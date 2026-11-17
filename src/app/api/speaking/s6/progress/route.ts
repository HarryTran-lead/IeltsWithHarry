import { z } from "zod";
import { bankClient,viewer,requestError } from "@/lib/ielts-bank/server";
import { lessonId } from "@/lib/speaking-s6/contract";
import { s6AccessAllowed } from "@/lib/speaking-s6/access";
export const runtime="nodejs";
const action=z.discriminatedUnion("action",[
  z.object({action:z.literal("completeStep"),lessonId,preview:z.boolean().default(false),step:z.number().int().min(1).max(10)}),
  z.object({action:z.literal("completeReview"),lessonId,preview:z.boolean().default(false),
    dayOffset:z.union([z.literal(2),z.literal(7),z.literal(21)]),recordingSeconds:z.number().int().min(10).max(180)})
]);
const headers={"Cache-Control":"private, no-store"};
type Progress={user_id:string;lesson_code:string;revision:string;preview:boolean;completed_steps:number[];
 current_step:number;review_anchor:string|null;completed_reviews:number[]};
async function findRevision(db:ReturnType<typeof bankClient>, code:string, preview:boolean){
 const result=await db.from("speaking_s6_lesson_revisions").select("revision").eq("lesson_code",code)
  .eq("status",preview?"staging":"published").order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw new Error(result.error.message);
 return result.data?.revision??null;
}
const empty=(uid:string,code:string,revision:string,preview:boolean):Progress=>({
 user_id:uid,lesson_code:code,revision,preview,completed_steps:[],current_step:1,review_anchor:null,completed_reviews:[]
});
export async function GET(request:Request){
 try {
  const q=new URL(request.url).searchParams;
  const preview=q.get("preview")==="true";const code=lessonId.parse(q.get("lessonId"));
  const user=await viewer(preview);
  const db=bankClient();
  if(!await s6AccessAllowed(user.id,preview,db))return Response.json({error:"S6_LOCKED"},{status:404,headers});
  const revision=await findRevision(db,code,preview);
  if(!revision)return Response.json({error:"NOT_FOUND"},{status:404,headers});
  const r=await db.from("speaking_s6_study_progress").select("*")
   .eq("user_id",user.id).eq("lesson_code",code).eq("revision",revision).eq("preview",preview).maybeSingle();
  if(r.error)throw new Error(r.error.message);
  return Response.json({progress:r.data??empty(user.id,code,revision,preview)},{headers});
 }catch(e){if(e instanceof z.ZodError)return Response.json({error:"SCHEMA_INVALID"},{status:422,headers});return requestError(e);}
}
export async function POST(request:Request){
 try {
  const content=await request.text();
  if(Buffer.byteLength(content,"utf8")>20000)return Response.json({error:"BODY_TOO_LARGE"},{status:413,headers});
  const body=action.parse(JSON.parse(content));const user=await viewer(body.preview),db=bankClient();
  if(!await s6AccessAllowed(user.id,body.preview,db))return Response.json({error:"S6_LOCKED"},{status:404,headers});
  const revision=await findRevision(db,body.lessonId,body.preview);
  if(!revision)return Response.json({error:"NOT_FOUND"},{status:404,headers});
  const old=await db.from("speaking_s6_study_progress").select("*")
   .eq("user_id",user.id).eq("lesson_code",body.lessonId).eq("revision",revision).eq("preview",body.preview).maybeSingle();
  if(old.error)throw new Error(old.error.message);
  const row=(old.data??empty(user.id,body.lessonId,revision,body.preview)) as Progress;
  const now=new Date();
  if(body.action==="completeStep"){
   if(body.step>1 && !row.completed_steps.includes(body.step-1))
     return Response.json({error:"STEP_OUT_OF_SEQUENCE"},{status:409,headers});
   row.completed_steps=[...new Set([...row.completed_steps,body.step])].sort((a,b)=>a-b);
   row.current_step=Math.min(10,Math.max(row.current_step,body.step+1));
   if(body.step===10 && !row.review_anchor)row.review_anchor=now.toISOString();
  }else{
   if(!row.completed_steps.includes(10) || !row.review_anchor)
    return Response.json({error:"FINISH_STEPS_FIRST"},{status:409,headers});
   const due=new Date(row.review_anchor).getTime()+body.dayOffset*86400000;
   if(now.getTime()<due)return Response.json({error:"REVIEW_NOT_DUE",dueAt:new Date(due).toISOString()},{status:409,headers});
   row.completed_reviews=[...new Set([...row.completed_reviews,body.dayOffset])].sort((a,b)=>a-b);
   // Self-reported evidence, NOT a pronunciation score or release gate.
  }
  const {error}=await db.from("speaking_s6_study_progress").upsert({...row,updated_at:now.toISOString()},
    {onConflict:"user_id,lesson_code,revision,preview"});
  if(error)throw new Error(error.message);
  return Response.json({progress:row,certified:false},{headers});
 }catch(e){if(e instanceof z.ZodError)return Response.json({error:"SCHEMA_INVALID",details:e.issues},{status:422,headers});return requestError(e);}
}
