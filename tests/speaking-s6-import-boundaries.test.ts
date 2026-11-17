import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({viewer:vi.fn(),bankClient:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/ielts-bank/server",()=>({
 viewer:mock.viewer,bankClient:mock.bankClient,
 requestError:(e:unknown)=>{
   const message=e instanceof Error?e.message:String(e);
   return Response.json({error:message},{status:/Admin access/.test(message)?403:/Authentication/.test(message)?401:400});
 }
}));
import {POST} from "@/app/api/admin/speaking-s6/import/route";
import {sha256Json} from "@/lib/speaking-s6/contract";

const makePackage=()=>{
 const id="S6-001";
 const guided=Array.from({length:4},(_,i)=>({
   activity_id:id+"-G0"+(i+1),question_en:"Which practice is helpful for speaking? "+(i+1),
   model_ref:"server:g"+(i+1),hints:[{level:1},{level:2},{level:3}]
 }));
 const independent=Array.from({length:3},(_,i)=>({
   activity_id:id+"-I0"+(i+1),mode:"INDEPENDENT",prompt_ref:"server:i"+(i+1),
   no_answer_key_on_student:true,followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const mastery=Array.from({length:2},(_,i)=>({
   activity_id:id+"-M0"+(i+1),mode:"MASTERY",prompt_ref:"server:m"+(i+1),
   no_answer_key_on_student:true,followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const lesson={lesson_id:id,status:"STAGING_REVIEW_REQUIRED",publish_allowed:false,
   steps:Array.from({length:10},(_,i)=>({step:i+1,learning_content:{topic:"Step "+(i+1)}})),
   guided,independent,mastery,spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}]
 };
 const privateLesson={
  guided:Object.fromEntries(guided.map((g,i)=>[g.activity_id,{question_en:g.question_en,model_answer_en:"Private model answer "+(i+1)} ])),
  independent:Object.fromEntries(independent.map((g,i)=>[g.activity_id,{question_en:"Independent unseen task number "+(i+1)} ])),
  mastery:Object.fromEntries(mastery.map((g,i)=>[g.activity_id,{question_en:"Mastery unseen task number "+(i+1),
    followup_en:"Unseen follow-up "+(i+1)}]))
 };
 return {revision:"R11_M10_L19_TEST",hash:sha256Json(lesson),privateHash:sha256Json(privateLesson),lesson,privateLesson};
};
const req=(body:unknown)=>new Request("https://staging.invalid/api/admin/speaking-s6/import",{
 method:"POST",headers:{"Content-Type":"application/json","Origin":"https://staging.invalid"},body:JSON.stringify(body)
});
describe("S6 authenticated ADD-ONLY import boundary (mock database)",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mock.viewer.mockResolvedValue({id:"33333333-3333-4333-8333-333333333333"});
  mock.rpc.mockResolvedValue({error:null});
  mock.bankClient.mockReturnValue({rpc:mock.rpc});
 });
 it("denies non-admin before writing to Supabase",async()=>{
  mock.viewer.mockRejectedValue(new Error("Admin access required"));
  const r=await POST(req(makePackage()));
  expect(r.status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("imports a signed valid lesson in STAGING only",async()=>{
  const r=await POST(req(makePackage()));
  expect(r.status).toBe(201);
  expect(await r.json()).toMatchObject({ok:true,status:"staging",lesson_id:"S6-001"});
  expect(mock.rpc).toHaveBeenCalledWith("speaking_s6_import_revision",expect.objectContaining({
    p_lesson_code:"S6-001",p_revision:"R11_M10_L19_TEST"
  }));
 });
 it("returns 409 when revision already exists",async()=>{
  mock.rpc.mockResolvedValue({error:{code:"23505",message:"duplicate key value"}});
  const r=await POST(req(makePackage()));
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe("ADD_ONLY_CONFLICT");
 });
 it("rejects modified content after student checksum",async()=>{
  const data=makePackage();
  data.lesson.guided[0].question_en="Modified student prompt not part of signed JSON";
  const r=await POST(req(data));
  expect(r.status).toBe(422);
  expect((await r.json()).error).toBe("S6_STUDENT_HASH_MISMATCH");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("rejects private bank modification without matching checksum",async()=>{
  const data=makePackage();
  data.privateLesson.guided["S6-001-G01"].model_answer_en="Changed secret";
  const r=await POST(req(data));
  expect(r.status).toBe(422);
  expect((await r.json()).error).toBe("S6_PRIVATE_HASH_MISMATCH");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("rejects private keys injected into student payload even with valid checksum",async()=>{
  const data=makePackage();
  const object=data.lesson as unknown as Record<string,unknown>;
  object.answer_keys={mastery_answer:"leaked"};
  data.hash=sha256Json(data.lesson);
  const r=await POST(req(data));
  expect(r.status).toBe(422);
  expect((await r.json()).error).toContain("S6_PRIVATE_FIELD");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("rejects unseen Mastery question injected in public content",async()=>{
  const data=makePackage();
  const object=data.lesson as unknown as Record<string,unknown>;
  object.intro_text="Mastery unseen task number 1";
  data.hash=sha256Json(data.lesson);
  const r=await POST(req(data));
  expect(r.status).toBe(422);
  expect((await r.json()).error).toBe("S6_UNSEEN_QUESTION_LEAK");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
});
