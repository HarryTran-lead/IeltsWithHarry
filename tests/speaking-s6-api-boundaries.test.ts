import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  viewer:vi.fn(),
  bankClient:vi.fn(),
  s6AccessAllowed:vi.fn()
}));
vi.mock("@/lib/ielts-bank/server",()=>({
  viewer:mocks.viewer,
  bankClient:mocks.bankClient,
  requestError:(e:unknown)=>Response.json({error:e instanceof Error?e.message:"ERROR"},{status:400}),
}));
vi.mock("@/lib/speaking-s6/access",()=>({s6AccessAllowed:mocks.s6AccessAllowed}));
import { POST } from "@/app/api/speaking/s6/session/route";

const USER_A="11111111-1111-4111-8111-111111111111";
const USER_B="22222222-2222-4222-8222-222222222222";
const ATTEMPT="33333333-3333-4333-8333-333333333333";

type Attempt={id:string;user_id:string;lesson_code:string;revision:string;
  activity_id:string;mode:"guided"|"independent"|"mastery";phase:"started"|"submitted";
  audio_storage_consent?:boolean;initial_response?:string;duration_seconds?:number};
const makeAttempt=(mode:Attempt["mode"]="mastery",phase:Attempt["phase"]="started"):Attempt=>({
  id:ATTEMPT,user_id:USER_A,lesson_code:"S6-001",revision:"R11",
  activity_id:mode==="mastery"?"S6-001-M01":mode==="guided"?"S6-001-G01":"S6-001-I01",
  mode,phase
});
const query=(result:unknown)=>{
  const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),
    maybeSingle:vi.fn().mockResolvedValue({data:result,error:null}),
    insert:vi.fn().mockResolvedValue({error:null}),
    update:vi.fn(),delete:vi.fn().mockResolvedValue({error:null})
  };
  for(const k of ["select","eq","order","limit","update"] as const)q[k].mockReturnValue(q);
  return q;
};
const makeDb=(options:{
 attempt?:Attempt|null;
 release?:string;
 updateResult?:{id:string}|null;
}={})=>{
 const lesson=query({revision:"R11",
   student_content:{guided:[{activity_id:"S6-001-G01",question_en:"Do you prefer mornings?"}]},
   status:options.release??"published"});
 const attempts=query(options.attempt===undefined?makeAttempt():options.attempt);
 const update=query(options.updateResult===undefined?{id:ATTEMPT}:options.updateResult);
 attempts.update.mockReturnValue(update);
 const privateBank=query({bank:{
   guided:{"S6-001-G01":{question_en:"Do you prefer mornings?",
     model_answer_en:"Private guided model",model_translation_vi:"Bản dịch riêng"}},
   independent:{"S6-001-I01":{question_en:"An unseen Independent prompt"}},
   mastery:{"S6-001-M01":{question_en:"An unseen Mastery prompt",
     followup_en:"What could you improve about your answer?"}}
 }});
 const from=vi.fn((table:string)=>{
   if(table==="speaking_s6_lesson_revisions")return lesson;
   if(table==="speaking_s6_private_revisions")return privateBank;
   if(table==="speaking_s6_attempts")return attempts;
   throw Error("Unexpected Supabase table "+table);
 });
 const db={from};
 mocks.bankClient.mockReturnValue(db);
 return {db,from,attempts,update,lesson,privateBank};
};
const request=(data:object)=>new Request("https://staging.invalid/api/speaking/s6/session",{
 method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)
});
describe("Speaking S6 API behavior (mocked Supabase, no live staging)",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({id:USER_A});
  mocks.s6AccessAllowed.mockResolvedValue(true);
 });
 it("rejects a locked user before any database read",async()=>{
  const d=makeDb();mocks.s6AccessAllowed.mockResolvedValue(false);
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(404);
  expect((await r.json()).error).toBe("S6_LOCKED");
  expect(d.from).not.toHaveBeenCalled();
 });
 it("only sends unseen Mastery question, not answers/followup, at start",async()=>{
  const d=makeDb();
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(201);
  const b=await r.json();
  expect(b.question).toBe("An unseen Mastery prompt");
  expect(b.mode).toBe("mastery");
  expect(JSON.stringify(b)).not.toContain("Private guided model");
  expect(JSON.stringify(b)).not.toContain("What could you improve");
  expect(d.attempts.insert).toHaveBeenCalledOnce();
  expect(d.lesson.eq).toHaveBeenCalledWith("status","published");
 });
 it("filters attempts by owner, including foreign IDs",async()=>{
  const d=makeDb({attempt:null});
  mocks.viewer.mockResolvedValue({id:USER_B});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(404);
  expect(d.attempts.eq).toHaveBeenCalledWith("user_id",USER_B);
  expect(d.from.mock.calls.map(c=>c[0])).not.toContain("speaking_s6_private_revisions");
 });
 it("does not expose Mastery follow-up before first submission",async()=>{
  const d=makeDb({attempt:makeAttempt("mastery","started")});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe("SUBMISSION_REQUIRED");
  expect(d.from.mock.calls.map(c=>c[0])).not.toContain("speaking_s6_private_revisions");
 });
 it("releases Mastery follow-up after initial submission, never model answer",async()=>{
  makeDb({attempt:makeAttempt("mastery","submitted")});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(200);
  const b=await r.json();
  expect(b.followup).toContain("What could you improve");
  expect(JSON.stringify(b)).not.toContain("Private guided model");
 });
 it("returns Guided model only after initial submission",async()=>{
  makeDb({attempt:makeAttempt("guided","submitted")});
  const r=await POST(request({action:"guidedFeedback",attemptId:ATTEMPT}));
  expect(r.status).toBe(200);
  expect((await r.json()).model).toBe("Private guided model");
 });
 it("refuses Guided feedback for an Independent attempt",async()=>{
  makeDb({attempt:makeAttempt("independent","submitted")});
  const r=await POST(request({action:"guidedFeedback",attemptId:ATTEMPT}));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("WRONG_MODE");
 });
 it("second submit returns 409 without overwriting first response",async()=>{
  const d=makeDb({attempt:makeAttempt("mastery","started"),updateResult:null});
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"I spoke.",durationSeconds:30}));
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe("ALREADY_SUBMITTED");
  expect(d.update.eq).toHaveBeenCalledWith("phase","started");
 });
 it("rejects cross-lesson activity IDs before creating attempts",async()=>{
  const d=makeDb();
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-002-M01"}));
  expect(r.status).toBe(422);
  expect(d.attempts.insert).not.toHaveBeenCalled();
 });
 it("admin preview is explicitly authorized via viewer(true)",async()=>{
  makeDb();
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01",preview:true}));
  // The mocked revision is available as staging when preview=true.
  expect(r.status).toBe(201);
  expect(mocks.viewer).toHaveBeenCalledWith(true);
 });
});


describe("S6 L20 session recovery and idempotent submissions",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({id:USER_A});
  mocks.s6AccessAllowed.mockResolvedValue(true);
 });
 it("restores only the owner's original unseen question, without a Mastery follow-up",async()=>{
  const d=makeDb({attempt:{...makeAttempt("mastery","started"),audio_storage_consent:true}});
  const r=await POST(request({action:"status",attemptId:ATTEMPT}));
  expect(r.status).toBe(200);
  const payload=await r.json();
  expect(payload).toMatchObject({
   attemptId:ATTEMPT,mode:"mastery",submitted:false,audioStorageConsent:true,
   question:"An unseen Mastery prompt"
  });
  expect(JSON.stringify(payload)).not.toContain("What could you improve");
  expect(d.attempts.eq).toHaveBeenCalledWith("user_id",USER_A);
 });
 it("does not restore a foreign user's attempt",async()=>{
  const d=makeDb({attempt:null});
  mocks.viewer.mockResolvedValue({id:USER_B});
  const r=await POST(request({action:"status",attemptId:ATTEMPT}));
  expect(r.status).toBe(404);
  expect(d.attempts.eq).toHaveBeenCalledWith("user_id",USER_B);
 });
 it("accepts exactly repeated content after a previously completed submit",async()=>{
  makeDb({attempt:{...makeAttempt("mastery","submitted"),initial_response:"I answered.",duration_seconds:35}});
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"I answered.",durationSeconds:35}));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ok:true,scored:false,alreadySubmitted:true});
 });
 it("rejects a second submit with a different answer instead of overwriting evidence",async()=>{
  const d=makeDb({attempt:{...makeAttempt("mastery","submitted"),initial_response:"First answer.",duration_seconds:35}});
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"Changed answer.",durationSeconds:35}));
  expect(r.status).toBe(409);
  expect(d.attempts.update).not.toHaveBeenCalled();
 });
 it("recovers a concurrent submission only when content is exactly identical",async()=>{
  const d=makeDb({attempt:makeAttempt("mastery","started"),updateResult:null});
  d.attempts.maybeSingle.mockResolvedValueOnce({data:makeAttempt("mastery","started"),error:null})
   .mockResolvedValueOnce({data:{phase:"submitted",initial_response:"I answered.",duration_seconds:35},error:null});
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"I answered.",durationSeconds:35}));
  expect(r.status).toBe(200);
  expect((await r.json()).alreadySubmitted).toBe(true);
 });
 it("refuses recovery after the lesson revision becomes unpublished",async()=>{
  makeDb({attempt:makeAttempt("mastery","started"),release:"archived"});
  const r=await POST(request({action:"status",attemptId:ATTEMPT}));
  expect(r.status).toBe(404);
 });
});
