import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bankClient, viewer, requestError } from "@/lib/ielts-bank/server";
import { activityId, lessonId } from "@/lib/speaking-s6/contract";
import { s6AccessAllowed } from "@/lib/speaking-s6/access";
export const runtime="nodejs";
const commands=z.discriminatedUnion("action",[
  z.object({action:z.literal("start"),lessonId,activityId,audioStorageConsent:z.boolean().default(false),preview:z.boolean().default(false)}),
  z.object({action:z.literal("submit"),attemptId:z.uuid(),transcript:z.string().trim().max(5000).default(""),
    durationSeconds:z.number().int().min(1).max(180),preview:z.boolean().default(false)}),
  z.object({action:z.literal("followup"),attemptId:z.uuid(),preview:z.boolean().default(false)}),
  z.object({action:z.literal("guidedFeedback"),attemptId:z.uuid(),preview:z.boolean().default(false)})
]);
type BankEntry={question_en?:string;followup_en?:string;model_answer_en?:string;
  model_translation_vi?:string;teaching_explanation_en?:string;teacher_reasoning_vi?:string};
type Bank={guided:Record<string,BankEntry>;independent:Record<string,BankEntry>;mastery:Record<string,BankEntry>};
const noStore={"Cache-Control":"private, no-store"};
export async function POST(request:Request){
  try {
    if(Number(request.headers.get("content-length")||0)>30000)
      return Response.json({error:"BODY_TOO_LARGE"},{status:413});
    const raw=await request.text();
    if(Buffer.byteLength(raw,"utf8")>30000)return Response.json({error:"BODY_TOO_LARGE"},{status:413});
    const body=commands.parse(JSON.parse(raw));
    const user=await viewer(body.preview),db=bankClient();
    if(!await s6AccessAllowed(user.id,body.preview,db))
      return Response.json({error:"S6_LOCKED"},{status:404});
    if(body.action==="start"){
      if(!body.activityId.startsWith(body.lessonId+"-"))return Response.json({error:"ID_MISMATCH"},{status:422});
      const found=await db.from("speaking_s6_lesson_revisions")
        .select("revision,student_content").eq("lesson_code",body.lessonId).eq("status",body.preview?"staging":"published")
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(found.error || !found.data)return Response.json({error:"S6_NOT_PUBLISHED"},{status:404});
      const rev=found.data.revision;
      const letter=body.activityId.match(/-([GIM])\d{2}$/)?.[1];
      const mode=letter==="G"?"guided":letter==="I"?"independent":letter==="M"?"mastery":null;
      if(!mode)return Response.json({error:"ACTIVITY_INVALID"},{status:422});
      const ref=await db.from("speaking_s6_private_revisions").select("bank")
        .eq("lesson_code",body.lessonId).eq("revision",rev).maybeSingle();
      if(ref.error || !ref.data)return Response.json({error:"BANK_MISSING"},{status:503});
      const entry=(ref.data.bank as Bank)[mode]?.[body.activityId];
      if(!entry)return Response.json({error:"ACTIVITY_NOT_FOUND"},{status:404});
      const publicGuided=(found.data.student_content as {guided?:{activity_id:string;question_en:string}[]})
        .guided?.find(x=>x.activity_id===body.activityId);
      if(mode==="guided" && !publicGuided)return Response.json({error:"ACTIVITY_NOT_FOUND"},{status:404});
      const attemptId=randomUUID();
      const write=await db.from("speaking_s6_attempts").insert({
        id:attemptId,user_id:user.id,lesson_code:body.lessonId,revision:rev,
        activity_id:body.activityId,mode,preview:body.preview,audio_storage_consent:body.audioStorageConsent
      });
      if(write.error)throw new Error(write.error.message);
      return Response.json({attemptId,mode,audioStorageConsent:body.audioStorageConsent,
        question:mode==="guided"?publicGuided!.question_en:entry.question_en},
        {status:201,headers:noStore});
    }
    const r=await db.from("speaking_s6_attempts")
      .select("id,user_id,lesson_code,revision,activity_id,mode,phase")
      .eq("id",body.attemptId).eq("user_id",user.id).eq("preview",body.preview).maybeSingle();
    if(r.error || !r.data)return Response.json({error:"NOT_FOUND"},{status:404});
    const a=r.data;
    const release=await db.from("speaking_s6_lesson_revisions").select("status")
      .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
    if(release.error || release.data?.status!==(body.preview?"staging":"published"))
      return Response.json({error:"S6_NOT_PUBLISHED"},{status:404});
    if(body.action==="submit"){
      const s=await db.from("speaking_s6_attempts").update({
        phase:"submitted",initial_response:body.transcript,duration_seconds:body.durationSeconds,
        initial_submitted_at:new Date().toISOString()
      }).eq("id",a.id).eq("user_id",user.id).eq("phase","started").select("id").maybeSingle();
      if(s.error)throw new Error(s.error.message);
      if(!s.data)return Response.json({error:"ALREADY_SUBMITTED"},{status:409});
      return Response.json({ok:true,scored:false},{headers:noStore});
    }
    if(a.phase!=="submitted")return Response.json({error:"SUBMISSION_REQUIRED"},{status:409});
    const q=await db.from("speaking_s6_private_revisions").select("bank")
      .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
    if(q.error || !q.data)return Response.json({error:"BANK_MISSING"},{status:503});
    const bank=q.data.bank as Bank;
    if(body.action==="followup"){
      if(a.mode!=="mastery")return Response.json({error:"WRONG_MODE"},{status:403});
      return Response.json({followup:bank.mastery?.[a.activity_id]?.followup_en??null},{headers:noStore});
    }
    if(a.mode!=="guided")return Response.json({error:"WRONG_MODE"},{status:403});
    const entry=bank.guided?.[a.activity_id];
    if(!entry)return Response.json({error:"ACTIVITY_NOT_FOUND"},{status:404});
    return Response.json({model:entry.model_answer_en,translation_vi:entry.model_translation_vi,
      explanation_en:entry.teaching_explanation_en,explanation_vi:entry.teacher_reasoning_vi},
      {headers:noStore});
  } catch(e){
    if(e instanceof z.ZodError)return Response.json({error:"SCHEMA_INVALID",details:e.issues},{status:422});
    return requestError(e);
  }
}
export async function DELETE(request:Request){
  try{
    const user=await viewer();
    const attemptId=z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const db=bankClient();
    const r=await db.from("speaking_s6_attempts").select("id")
      .eq("id",attemptId).eq("user_id",user.id).maybeSingle();
    if(r.error || !r.data)return Response.json({error:"NOT_FOUND"},{status:404});
    const names=["webm","mp4","ogg"].map(ext=>user.id+"/"+attemptId+"."+ext);
    const removed=await db.storage.from("speaking-s6-recordings").remove(names);
    if(removed.error)throw new Error(removed.error.message);
    const deleted=await db.from("speaking_s6_attempts").delete()
      .eq("id",attemptId).eq("user_id",user.id);
    if(deleted.error)throw new Error(deleted.error.message);
    return Response.json({ok:true},{headers:noStore});
  }catch(e){return requestError(e);}
}
