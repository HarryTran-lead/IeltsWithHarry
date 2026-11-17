import { z } from "zod";
import { bankClient, viewer } from "@/lib/ielts-bank/server";
import { s6SessionErrorResponse, s6SessionNoStore } from "@/lib/speaking-s6/session-errors";
import { s6MutationGuard } from "@/lib/speaking-s6/mutation-guard";
import { fingerprintS6StoredAudio, S6AudioEvidenceError } from "@/lib/speaking-s6/audio-evidence";
import { activityId, lessonId } from "@/lib/speaking-s6/contract";
import { s6AccessAllowed } from "@/lib/speaking-s6/access";
export const runtime="nodejs";
const commands=z.discriminatedUnion("action",[
  z.object({action:z.literal("start"),lessonId,activityId,audioStorageConsent:z.boolean().default(false),preview:z.boolean().default(false)}),
  z.object({action:z.literal("submit"),attemptId:z.uuid(),transcript:z.string().trim().max(5000).default(""),
    durationSeconds:z.number().int().min(1).max(180),preview:z.boolean().default(false)}),
  z.object({action:z.literal("followup"),attemptId:z.uuid(),preview:z.boolean().default(false)}),
  z.object({action:z.literal("guidedFeedback"),attemptId:z.uuid(),preview:z.boolean().default(false)}),
  z.object({action:z.literal("status"),attemptId:z.uuid(),preview:z.boolean().default(false)})
]);
type BankEntry={question_en?:string;followup_en?:string;model_answer_en?:string;
  model_translation_vi?:string;teaching_explanation_en?:string;teacher_reasoning_vi?:string};
type Bank={guided:Record<string,BankEntry>;independent:Record<string,BankEntry>;mastery:Record<string,BankEntry>};
const noStore=s6SessionNoStore;
export async function POST(request:Request){
  const guard=s6MutationGuard(request);
  if(guard)return guard;
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
      const question=mode==="guided"?publicGuided?.question_en:entry.question_en;
      if(typeof question!=="string"||!question.trim())
        return Response.json({error:"BANK_MISSING"},{status:503,headers:noStore});
      // An atomic PostgreSQL RPC admits and records this start under a user-row lock.
      // Missing L25 migration => fail closed; no fallback to an unmetered INSERT.
      const admitted=await db.rpc("speaking_s6_start_attempt_l25",{
        p_user_id:user.id,p_lesson_code:body.lessonId,p_revision:rev,
        p_activity_id:body.activityId,p_mode:mode,p_preview:body.preview,
        p_audio_storage_consent:body.audioStorageConsent
      });
      if(admitted.error){
        const code=admitted.error.message;
        if(code==="S6_START_RATE_LIMIT"||code==="S6_START_COOLDOWN"||
            code==="S6_START_ACTIVE_LIMIT")
          return Response.json({error:code},{status:429,
            headers:{...noStore,"Retry-After":code==="S6_START_RATE_LIMIT"?"3600":"600"}});
        if(code==="S6_LOCKED"||code==="S6_REVISION_UNAVAILABLE")
          return Response.json({error:"S6_LOCKED"},{status:404,headers:noStore});
        // Never reflect operational SQL messages.
        return Response.json({error:"S6_SESSION_UNAVAILABLE"},{status:503,headers:noStore});
      }
      const parsedId=z.uuid().safeParse(admitted.data);
      if(!parsedId.success) return Response.json({error:"S6_SESSION_UNAVAILABLE"},{status:503,headers:noStore});
      const attemptId=parsedId.data;
      return Response.json({attemptId,mode,audioStorageConsent:body.audioStorageConsent,
        question},
        {status:201,headers:noStore});
    }
    const r=await db.from("speaking_s6_attempts")
      .select("id,user_id,lesson_code,revision,activity_id,mode,phase,deletion_requested_at,audio_storage_consent,audio_evidence_state,initial_response,duration_seconds")
      .eq("id",body.attemptId).eq("user_id",user.id).eq("preview",body.preview).maybeSingle();
    if(r.error || !r.data)return Response.json({error:"NOT_FOUND"},{status:404});
    const a=r.data;
    // A deletion marker is set *before* removing Storage objects. Once marked,
    // no status/retry/feedback/submit may race with the ongoing privacy deletion.
    if(a.deletion_requested_at)
      return Response.json({error:"S6_DELETION_IN_PROGRESS"},{status:409,headers:noStore});
    const release=await db.from("speaking_s6_lesson_revisions").select("status")
      .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
    if(release.error || release.data?.status!==(body.preview?"staging":"published"))
      return Response.json({error:"S6_NOT_PUBLISHED"},{status:404});
    if(body.action==="status"){
      let question:string|undefined;
      if(a.mode==="guided"){
        const lesson=await db.from("speaking_s6_lesson_revisions").select("student_content")
          .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
        if(lesson.error||!lesson.data)return Response.json({error:"NOT_FOUND"},{status:404});
        question=(lesson.data.student_content as {guided?:{activity_id:string;question_en:string}[]})
          .guided?.find(item=>item.activity_id===a.activity_id)?.question_en;
      }else{
        const secret=await db.from("speaking_s6_private_revisions").select("bank")
          .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
        if(secret.error||!secret.data)return Response.json({error:"NOT_FOUND"},{status:404});
        question=(secret.data.bank as Bank)[a.mode as "independent"|"mastery"]?.[a.activity_id]?.question_en;
      }
      if(!question)return Response.json({error:"NOT_FOUND"},{status:404});
      return Response.json({attemptId:a.id,activityId:a.activity_id,mode:a.mode,question,
        submitted:a.phase==="submitted",audioStorageConsent:a.audio_storage_consent,
        audioEvidence:a.audio_evidence_state??"not_stored"},{headers:noStore});
    }
    if(body.action==="submit"){
      if(a.phase==="submitted"){
        if(a.initial_response===body.transcript&&a.duration_seconds===body.durationSeconds)
          return Response.json({ok:true,scored:false,alreadySubmitted:true,
            audioEvidence:a.audio_evidence_state??"not_stored"},{headers:noStore});
        return Response.json({error:"ALREADY_SUBMITTED"},{status:409});
      }
      // Optional audio retention: only consented uploads get server-side
      // byte fingerprints. No consent => no Storage lookup and no audio proof.
      // The fingerprint is NOT proof of speech, duration or proficiency.
      let evidence:Record<string,unknown>={audio_evidence_state:"not_stored"};
      if(a.audio_storage_consent===true){
        try{
          evidence=await fingerprintS6StoredAudio(db.storage,user.id,a.id);
        }catch(error){
          if(error instanceof S6AudioEvidenceError){
            const status=error.code==="AUDIO_STORAGE_UNAVAILABLE"?503:
              error.code==="AUDIO_UPLOAD_REQUIRED"?409:422;
            return Response.json({error:error.code},{status,headers:noStore});
          }
          throw error;
        }
      }
      const s=await db.from("speaking_s6_attempts").update({
        phase:"submitted",initial_response:body.transcript,duration_seconds:body.durationSeconds,
        initial_submitted_at:new Date().toISOString(),...evidence
      }).eq("id",a.id).eq("user_id",user.id).eq("phase","started")
        .is("deletion_requested_at",null).select("id").maybeSingle();
      if(s.error)throw new Error(s.error.message);
      if(!s.data){
        const latest=await db.from("speaking_s6_attempts")
          .select("phase,initial_response,duration_seconds,deletion_requested_at")
          .eq("id",a.id).eq("user_id",user.id).maybeSingle();
        if(latest.data?.deletion_requested_at)
          return Response.json({error:"S6_DELETION_IN_PROGRESS"},{status:409,headers:noStore});
        if(!latest.error&&latest.data?.phase==="submitted"
          &&latest.data.initial_response===body.transcript
          &&latest.data.duration_seconds===body.durationSeconds)
          return Response.json({ok:true,scored:false,alreadySubmitted:true,
            audioEvidence:evidence.audio_evidence_state},{headers:noStore});
        return Response.json({error:"ALREADY_SUBMITTED"},{status:409});
      }
      return Response.json({ok:true,scored:false,
        audioEvidence:evidence.audio_evidence_state},{headers:noStore});
    }
    if(a.phase!=="submitted")return Response.json({error:"SUBMISSION_REQUIRED"},{status:409,headers:noStore});
    // Deny wrong-mode requests BEFORE querying the private answer bank.
    if(body.action==="followup"&&a.mode!=="mastery")
      return Response.json({error:"WRONG_MODE"},{status:403,headers:noStore});
    if(body.action==="guidedFeedback"&&a.mode!=="guided")
      return Response.json({error:"WRONG_MODE"},{status:403,headers:noStore});
    const q=await db.from("speaking_s6_private_revisions").select("bank")
      .eq("lesson_code",a.lesson_code).eq("revision",a.revision).maybeSingle();
    if(q.error || !q.data)return Response.json({error:"BANK_MISSING"},{status:503});
    const bank=q.data.bank as Bank;
    if(body.action==="followup"){
      const followup=bank.mastery?.[a.activity_id]?.followup_en;
      if(typeof followup!=="string"||!followup.trim())
        return Response.json({error:"BANK_MISSING"},{status:503,headers:noStore});
      return Response.json({followup},{headers:noStore});
    }
    const entry=bank.guided?.[a.activity_id];
    if(!entry)return Response.json({error:"ACTIVITY_NOT_FOUND"},{status:404,headers:noStore});
    if(typeof entry.model_answer_en!=="string"||!entry.model_answer_en.trim())
      return Response.json({error:"BANK_MISSING"},{status:503,headers:noStore});
    return Response.json({model:entry.model_answer_en,translation_vi:entry.model_translation_vi,
      explanation_en:entry.teaching_explanation_en,explanation_vi:entry.teacher_reasoning_vi},
      {headers:noStore});
  } catch(e){
    return s6SessionErrorResponse(e);
  }
}
export async function DELETE(request:Request){
  const guard=s6MutationGuard(request,false);
  if(guard)return guard;
  try{
    const user=await viewer();
    const attemptId=z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const db=bankClient();
    const r=await db.from("speaking_s6_attempts").select("id,deletion_requested_at")
      .eq("id",attemptId).eq("user_id",user.id).maybeSingle();
    if(r.error || !r.data)return Response.json({error:"NOT_FOUND"},{status:404,headers:noStore});
    if(!r.data.deletion_requested_at){
      // Mark deletion before interacting with Storage. The submit route
      // atomically checks this marker in its conditional UPDATE predicate.
      const marked=await db.from("speaking_s6_attempts")
        .update({deletion_requested_at:new Date().toISOString()})
        .eq("id",attemptId).eq("user_id",user.id)
        .is("deletion_requested_at",null).select("id").maybeSingle();
      if(marked.error)throw new Error(marked.error.message);
      if(!marked.data){
        // Concurrent deletion may have marked or removed the row.
        const again=await db.from("speaking_s6_attempts").select("deletion_requested_at")
          .eq("id",attemptId).eq("user_id",user.id).maybeSingle();
        if(again.error || !again.data || !again.data.deletion_requested_at)
          return Response.json({error:"NOT_FOUND"},{status:404,headers:noStore});
      }
    }
    // A failed Storage delete leaves the marked row for a safe retry.
    // These storage paths are owner-derived, never request-controlled.
    const names=["webm","mp4","ogg"].map(ext=>user.id+"/"+attemptId+"."+ext);
    const removed=await db.storage.from("speaking-s6-recordings").remove(names);
    if(removed.error)throw new Error(removed.error.message);
    const deleted=await db.from("speaking_s6_attempts").delete()
      .eq("id",attemptId).eq("user_id",user.id)
      .not("deletion_requested_at","is",null);
    if(deleted.error)throw new Error(deleted.error.message);
    return Response.json({ok:true},{headers:noStore});
  }catch(e){return s6SessionErrorResponse(e);}
}
