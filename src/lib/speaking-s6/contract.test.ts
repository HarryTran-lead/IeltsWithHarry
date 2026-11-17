import { describe,it,expect } from "vitest";
import { canonicalJson,sha256Json,validateS6Import } from "./contract";
type Raw=Parameters<typeof validateS6Import>[0];
function sample(){
 const id="S6-001";
 const guided=Array.from({length:4},(_,i)=>({
  activity_id:id+"-G"+String(i+1).padStart(2,"0"),question_en:"Guided question number "+i+"?",
  model_ref:"server:guide-"+i,
  hints:[{level:1},{level:2},{level:3}]
 }));
 const stub=(mode:"I"|"M",i:number)=>({
  activity_id:id+"-"+mode+String(i+1).padStart(2,"0"),
  mode:mode==="I"?"INDEPENDENT":"MASTERY",
  prompt_ref:"server:prompt-"+mode+"-"+i,
  no_answer_key_on_student:true,
  followup_delivery:"AFTER_INITIAL_SUBMISSION"
 });
 const lesson={lesson_id:id,status:"STAGING_REVIEW_REQUIRED",publish_allowed:false,
  steps:Array.from({length:10},(_,i)=>({step:i+1,learning_content:{model_en:"Teaching example "+i}})),
  guided,independent:Array.from({length:3},(_,i)=>stub("I",i)),
  mastery:Array.from({length:2},(_,i)=>stub("M",i)),
  spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}],
  teacher_private_bank:"SERVER_ONLY"
 };
 const privateLesson={
  guided:Object.fromEntries(guided.map((g,i)=>[g.activity_id,{question_en:g.question_en,model_answer_en:"Private guide answer "+i}])),
  independent:Object.fromEntries(lesson.independent.map((g,i)=>[g.activity_id,{question_en:"Unseen independent sentence "+i}])),
  mastery:Object.fromEntries(lesson.mastery.map((g,i)=>[g.activity_id,{question_en:"Unseen mastery sentence "+i,followup_en:"Follow-up secret "+i}]))
 };
 return {revision:"R11_M10_L16_STAGING",lesson,privateLesson,hash:sha256Json(lesson),
  privateHash:sha256Json(privateLesson)};
}
describe("Speaking S6 import boundary",()=>{
 it("canonical hash ignores object key order",()=>{
  expect(canonicalJson({z:1,a:{b:2,c:3}})).toBe(canonicalJson({a:{c:3,b:2},z:1}));
  expect(sha256Json({a:1,b:2})).toBe(sha256Json({b:2,a:1}));
 });
 it("accepts isolated, well-formed staging lesson",()=>{
  expect(validateS6Import(sample() as Raw).lesson.lesson_id).toBe("S6-001");
 });
 it("rejects modified student content after hash signed",()=>{
  const value=sample();value.lesson.guided[0].question_en="Question has changed since checksum";
  expect(()=>validateS6Import(value as Raw)).toThrow("S6_STUDENT_HASH_MISMATCH");
 });
 it("rejects modified server bank after hash signed",()=>{
  const value=sample();value.privateLesson.guided["S6-001-G01"].model_answer_en="Modified secret";
  expect(()=>validateS6Import(value as Raw)).toThrow("S6_PRIVATE_HASH_MISMATCH");
 });
 it("rejects a missing private Mastery answer",()=>{
  const value=sample();delete (value.privateLesson.mastery as Record<string,unknown>)["S6-001-M01"];
  value.privateHash=sha256Json(value.privateLesson);
  expect(()=>validateS6Import(value as Raw)).toThrow("S6_KEY_MISMATCH:mastery");
 });
 it("rejects unseen question leaked into student fields",()=>{
  const value=sample();
  (value.lesson as Record<string,unknown>).unintended_text="Unseen mastery sentence 0";
  value.hash=sha256Json(value.lesson);
  expect(()=>validateS6Import(value as Raw)).toThrow("S6_UNSEEN_QUESTION_LEAK");
 });
 it("rejects forbidden answer fields inside student payload",()=>{
  const value=sample();
  (value.lesson as Record<string,unknown>).answer_keys=["secret"];
  value.hash=sha256Json(value.lesson);
  expect(()=>validateS6Import(value as Raw)).toThrow("S6_PRIVATE_FIELD");
 });
});
