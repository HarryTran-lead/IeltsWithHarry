import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  viewer:vi.fn(),
  bankClient:vi.fn(),
  s6AccessAllowed:vi.fn(),
  fingerprintAudio:vi.fn()
}));
vi.mock("@/lib/ielts-bank/server",()=>({
  viewer:mocks.viewer,
  bankClient:mocks.bankClient,
  requestError:(e:unknown)=>Response.json({error:e instanceof Error?e.message:"ERROR"},{status:400}),
}));
vi.mock("@/lib/speaking-s6/access",()=>({s6AccessAllowed:mocks.s6AccessAllowed}));
vi.mock("@/lib/speaking-s6/audio-evidence",()=>({
  fingerprintS6StoredAudio:mocks.fingerprintAudio,
  S6AudioEvidenceError:class extends Error {
    constructor(public readonly code:string){super(code);}
  }
}));
import { POST } from "@/app/api/speaking/s6/session/route";
import { S6AudioEvidenceError } from "@/lib/speaking-s6/audio-evidence";

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
 const rpc=vi.fn().mockResolvedValue({data:ATTEMPT,error:null});
 const db={from,rpc};
 mocks.bankClient.mockReturnValue(db);
 return {db,from,attempts,update,lesson,privateBank,rpc};
};
const request=(data:object)=>new Request("https://staging.invalid/api/speaking/s6/session",{
 method:"POST",headers:{"Content-Type":"application/json","Origin":"https://staging.invalid"},body:JSON.stringify(data)
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
  expect(d.rpc).toHaveBeenCalledOnce();
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
  expect(d.rpc).not.toHaveBeenCalled();
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

describe("Speaking S6 M10-L24 private-bank fail-closed boundary tests (mock database)",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({id:USER_A});
  mocks.s6AccessAllowed.mockResolvedValue(true);
 });
 it("rejects Guided followup before any private-bank query",async()=>{
  const d=makeDb({attempt:makeAttempt("guided","submitted")});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("WRONG_MODE");
  expect(d.from.mock.calls.map(c=>c[0])).not.toContain("speaking_s6_private_revisions");
 });
 it("rejects Mastery guidedFeedback before any private-bank query",async()=>{
  const d=makeDb({attempt:makeAttempt("mastery","submitted")});
  const r=await POST(request({action:"guidedFeedback",attemptId:ATTEMPT}));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("WRONG_MODE");
  expect(d.from.mock.calls.map(c=>c[0])).not.toContain("speaking_s6_private_revisions");
 });
 it("returns a non-cacheable fail-closed error when required Mastery followup is missing",async()=>{
  const d=makeDb({attempt:makeAttempt("mastery","submitted")});
  d.privateBank.maybeSingle.mockResolvedValue({data:{bank:{
   guided:{},independent:{},mastery:{"S6-001-M01":{question_en:"Unseen prompt"}}
  }},error:null});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(503);
  expect((await r.json()).error).toBe("BANK_MISSING");
  expect(r.headers.get("Cache-Control")).toContain("no-store");
 });
 it("rejects an empty private Mastery question before inserting an attempt",async()=>{
  const d=makeDb();
  d.privateBank.maybeSingle.mockResolvedValue({data:{bank:{
   guided:{},independent:{},mastery:{"S6-001-M01":{followup_en:"Unseen secret"}}
  }},error:null});
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(503);
  expect(d.rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(await r.json())).not.toContain("Unseen secret");
 });
 it("refuses a Guided explanation if the private model answer is blank",async()=>{
  const d=makeDb({attempt:makeAttempt("guided","submitted")});
  d.privateBank.maybeSingle.mockResolvedValue({data:{bank:{
   guided:{"S6-001-G01":{question_en:"Do you prefer mornings?",model_answer_en:" "}},
   independent:{},mastery:{}
  }},error:null});
  const r=await POST(request({action:"guidedFeedback",attemptId:ATTEMPT}));
  expect(r.status).toBe(503);
  expect((await r.json()).error).toBe("BANK_MISSING");
 });
 it("never reflects a database error containing private details to the client",async()=>{
  const d=makeDb();
  d.rpc.mockResolvedValue({data:null,error:{message:"SQL private bank: hidden teacher key"}});
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(503);
  const body=JSON.stringify(await r.json());
  expect(body).toBe('{"error":"S6_SESSION_UNAVAILABLE"}');
  expect(body).not.toContain("teacher key");
  expect(r.headers.get("Cache-Control")).toContain("no-store");
 });
 it("returns fixed 401 and 403 errors for learner auth and admin preview denial",async()=>{
  const d=makeDb();
  mocks.viewer.mockRejectedValueOnce(Error("Authentication required"));
  const first=await POST(request({action:"status",attemptId:ATTEMPT}));
  expect(first.status).toBe(401);
  expect((await first.json()).error).toBe("AUTHENTICATION_REQUIRED");
  mocks.viewer.mockRejectedValueOnce(Error("Admin access required"));
  const second=await POST(request({action:"status",attemptId:ATTEMPT,preview:true}));
  expect(second.status).toBe(403);
  expect((await second.json()).error).toBe("ADMIN_REQUIRED");
  expect(d.from).not.toHaveBeenCalled();
  expect(mocks.viewer).toHaveBeenCalledWith(true);
 });
 it("does not expose raw malformed JSON or schema-validation internals",async()=>{
  makeDb();
  const malformed=new Request("https://staging.invalid/api/speaking/s6/session",{
    method:"POST",headers:{"Content-Type":"application/json","Origin":"https://staging.invalid"},body:"{"
  });
  const first=await POST(malformed);
  expect(first.status).toBe(400);
  expect((await first.json()).error).toBe("MALFORMED_JSON");
  const second=await POST(request({action:"followup",attemptId:"invalid"}));
  expect(second.status).toBe(422);
  expect((await second.json()).error).toBe("SCHEMA_INVALID");
 });
 it("includes no private answer/model/notes in Mastery followup payload",async()=>{
  makeDb({attempt:makeAttempt("mastery","submitted")});
  const r=await POST(request({action:"followup",attemptId:ATTEMPT}));
  expect(r.status).toBe(200);
  const payload=await r.json();
  expect(Object.keys(payload)).toEqual(["followup"]);
  expect(r.headers.get("Cache-Control")).toContain("no-store");
  expect(JSON.stringify(payload)).not.toContain("Private guided model");
 });
});

describe("Speaking S6 M10-L25 atomic start quota and origin guard (mock database)",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({id:USER_A});
  mocks.s6AccessAllowed.mockResolvedValue(true);
 });
 it("admits start only through atomic RPC, never an unmetered attempt insert",async()=>{
  const d=makeDb();
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(201);
  expect(d.rpc).toHaveBeenCalledWith("speaking_s6_start_attempt_l25",expect.objectContaining({
    p_user_id:USER_A,p_lesson_code:"S6-001",p_activity_id:"S6-001-M01",p_mode:"mastery",
    p_preview:false,p_audio_storage_consent:false
  }));
  expect(d.attempts.insert).not.toHaveBeenCalled();
  expect((await r.json()).question).toBe("An unseen Mastery prompt");
 });
 it("returns 429 on an hourly rate limit, without leaking any private bank",async()=>{
  const d=makeDb();
  d.rpc.mockResolvedValue({data:null,error:{message:"S6_START_RATE_LIMIT"}});
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(429);
  expect(r.headers.get("Retry-After")).toBe("3600");
  const response=JSON.stringify(await r.json());
  expect(response).toContain("S6_START_RATE_LIMIT");
  expect(response).not.toContain("An unseen Mastery prompt");
 });
 it("returns 429 for cooldown and active-attempt limits",async()=>{
  const d=makeDb();
  for(const code of ["S6_START_COOLDOWN","S6_START_ACTIVE_LIMIT"]){
    d.rpc.mockResolvedValueOnce({data:null,error:{message:code}});
    const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe(code);
  }
 });
 it("does not fall back to insert when the new RPC/migration is absent",async()=>{
  const d=makeDb();
  d.rpc.mockResolvedValue({data:null,error:{message:"Could not find the function in the schema cache"}});
  const r=await POST(request({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"}));
  expect(r.status).toBe(503);
  expect((await r.json()).error).toBe("S6_SESSION_UNAVAILABLE");
  expect(d.attempts.insert).not.toHaveBeenCalled();
 });
 it("denies cross-site and mismatched-origin requests before auth or DB",async()=>{
  const d=makeDb();
  const forbidden=new Request("https://staging.invalid/api/speaking/s6/session",{
    method:"POST",headers:{"Content-Type":"application/json","Origin":"https://attacker.invalid",
      "Sec-Fetch-Site":"cross-site"},
    body:JSON.stringify({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"})
  });
  const r=await POST(forbidden);
  expect(r.status).toBe(403);
  expect(mocks.viewer).not.toHaveBeenCalled();
  expect(d.rpc).not.toHaveBeenCalled();
 });
 it("requires JSON and a browser-origin or same-origin Fetch Metadata signal",async()=>{
  makeDb();
  const noOrigin=new Request("https://staging.invalid/api/speaking/s6/session",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"start",lessonId:"S6-001",activityId:"S6-001-M01"})
  });
  expect((await POST(noOrigin)).status).toBe(403);
  const plain=new Request("https://staging.invalid/api/speaking/s6/session",{
    method:"POST",headers:{"Origin":"https://staging.invalid","Content-Type":"text/plain"},body:"hello"
  });
  expect((await POST(plain)).status).toBe(415);
 });
});

describe("M10-L27 S6 submit audio provenance boundaries (mocked Storage, not genuine speech)",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({id:USER_A});
  mocks.s6AccessAllowed.mockResolvedValue(true);
 });
 it("does not inspect Storage when learner opted out of retention",async()=>{
  makeDb({attempt:{...makeAttempt("mastery","started"),audio_storage_consent:false}});
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"Notes only",durationSeconds:30}));
  expect(r.status).toBe(200);
  expect((await r.json()).audioEvidence).toBe("not_stored");
  expect(mocks.fingerprintAudio).not.toHaveBeenCalled();
 });
 it("requires a real uploaded file when consent was recorded",async()=>{
  const d=makeDb({attempt:{...makeAttempt("mastery","started"),audio_storage_consent:true}});
  mocks.fingerprintAudio.mockRejectedValue(new S6AudioEvidenceError("AUDIO_UPLOAD_REQUIRED"));
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"Notes",durationSeconds:30}));
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe("AUDIO_UPLOAD_REQUIRED");
  expect(d.attempts.update).not.toHaveBeenCalled();
  expect(mocks.fingerprintAudio).toHaveBeenCalledWith(undefined,USER_A,ATTEMPT);
 });
 it("records the server-side checksum and byte count in the same submitted update",async()=>{
  const d=makeDb({attempt:{...makeAttempt("guided","started"),audio_storage_consent:true}});
  const fingerprint={
    audio_evidence_state:"stored_hash_recorded",
    audio_evidence_sha256:"a".repeat(64),audio_evidence_bytes:1052,
    audio_evidence_mime:"audio/webm",audio_evidence_at:"2026-11-17T10:00:00.000Z"
  };
  mocks.fingerprintAudio.mockResolvedValue(fingerprint);
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"My response",durationSeconds:40}));
  expect(r.status).toBe(200);
  expect((await r.json()).audioEvidence).toBe("stored_hash_recorded");
  expect(d.attempts.update).toHaveBeenCalledWith(expect.objectContaining(fingerprint));
  expect(d.update.eq).toHaveBeenCalledWith("phase","started");
 });
 it("does not submit if private Storage is unavailable",async()=>{
  const d=makeDb({attempt:{...makeAttempt("guided","started"),audio_storage_consent:true}});
  mocks.fingerprintAudio.mockRejectedValue(new S6AudioEvidenceError("AUDIO_STORAGE_UNAVAILABLE"));
  const r=await POST(request({action:"submit",attemptId:ATTEMPT,transcript:"My response",durationSeconds:40}));
  expect(r.status).toBe(503);
  expect((await r.json()).error).toBe("AUDIO_STORAGE_UNAVAILABLE");
  expect(d.attempts.update).not.toHaveBeenCalled();
 });
});
