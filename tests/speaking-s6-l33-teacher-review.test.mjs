import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {L33_DIMENSIONS,L33_CHECKS,evaluateL33Rubric,
 auditL33TeacherReviews,inspectL33LocalPackage}
 from "../scripts/speaking-s6-l33-teacher-review.mjs";

const review=JSON.parse(readFileSync("tests/speaking-s6/m10-l33-teacher-review.json","utf8"));
const clone=x=>structuredClone(x);
const HASH="a".repeat(64);
const TIME="2026-11-17T11:00:00.000Z";
function validHumanRow(row){
 row.status="APPROVED";
 row.source_revision="R11_M10_L16_STAGING";
 row.student_sha256=HASH;row.private_sha256=HASH;
 row.rubric={...L33_DIMENSIONS};
 row.editorial_checks=Object.fromEntries(L33_CHECKS.map(k=>[k,true]));
 row.author="Content author";row.teacher_reviewer="Independent teacher";
 row.reviewed_at_utc=TIME;row.evidence="ev:restricted-store/teacher-qa-12345";
}
const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const sha=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
function syntheticPackage(){
 const id="S6-001";
 const guided=Array.from({length:4},(_,i)=>({
  activity_id:id+"-G0"+(i+1),
  question_en:"Can you explain your experience about topic number "+i+"?",
  hints:Array.from({length:3},(_,j)=>({level:j+1,
    text_vi:"Gợi ý cho câu trả lời số "+(j+1)}))
 }));
 const independent=Array.from({length:3},(_,i)=>({
  activity_id:id+"-I0"+(i+1),mode:"INDEPENDENT",
  no_answer_key_on_student:true
 }));
 const mastery=Array.from({length:2},(_,i)=>({
  activity_id:id+"-M0"+(i+1),mode:"MASTERY",
  no_answer_key_on_student:true
 }));
 const lesson={
  lesson_id:id,
  steps:Array.from({length:10},(_,i)=>({
   step:i+1,instruction_en:"Follow the practice steps carefully.",
   instruction_vi:"Hãy học theo các bước hướng dẫn cụ thể.",
   learning_content:{example_en:"Example content for "+i}
  })),
  guided,independent,mastery,
  spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}]
 };
 const privateLesson={
  guided:Object.fromEntries(guided.map((g,i)=>[g.activity_id,{
   model_answer_en:"I usually explain my ideas by giving a reason and an example about topic "+i,
   model_translation_vi:"Tôi thường giải thích ý kiến bằng lí do và ví dụ về chủ đề "+i,
   teaching_explanation_en:"Give a main idea, clear reason and relevant example.",
   teacher_reasoning_vi:"Nêu ý chính, giải thích lí do rồi đưa ví dụ phù hợp."
  }])),
  independent:Object.fromEntries(independent.map((g,i)=>[g.activity_id,{
   question_en:"Describe an independent topic number "+i+" in your own words."
  }])),
  mastery:Object.fromEntries(mastery.map((g,i)=>[g.activity_id,{
   question_en:"Please discuss a new complex Mastery topic number "+i+" in detail.",
   followup_en:"How might this approach change in the future for topic "+i+"?"
  }]))
 };
 return {lesson,privateLesson,hash:sha(lesson),privateHash:sha(privateLesson)};
}
describe("M10-L33 teacher QA metadata and local-only content signals",()=>{
 it("keeps all 44 lessons unreviewed with no fabricated teacher scores",()=>{
  expect(auditL33TeacherReviews(review)).toMatchObject({
   valid:true,lesson_count:44,status:"HOLD_TEACHER_CONTENT_NOT_REVIEWED",
   counts:{NOT_REVIEWED:44,APPROVED:0},
   teacher_review_certified_by_tool:0,release_authorized:false,
   s7_unlock_authorized:false
  });
 });
 it("rejects duplicated, missing or reordered S6 lesson numbers",()=>{
  const r=clone(review);r.lessons[1].lesson_id=r.lessons[0].lesson_id;
  expect(auditL33TeacherReviews(r).valid).toBe(false);
  const q=clone(review);q.lessons.pop();
  expect(auditL33TeacherReviews(q).valid).toBe(false);
 });
 it("rejects fabricated approval without actual hashes or teacher evidence",()=>{
  const r=clone(review);r.lessons[0].status="APPROVED";
  expect(auditL33TeacherReviews(r).valid).toBe(false);
 });
 it("requires a 100-point integer-weighted pedagogical rubric",()=>{
  expect(Object.values(L33_DIMENSIONS).reduce((a,b)=>a+b,0)).toBe(100);
  const r=evaluateL33Rubric({...L33_DIMENSIONS});
  expect(r).toMatchObject({valid:true,total:100,meets_threshold:true});
  expect(evaluateL33Rubric({...L33_DIMENSIONS,learning_sequence:17}).valid).toBe(false);
  expect(evaluateL33Rubric({...L33_DIMENSIONS,extra:1}).valid).toBe(false);
 });
 it("does not accept 90 points if critical privacy/scaffolding criteria fall below minimum",()=>{
  const scores={...L33_DIMENSIONS};
  scores.privacy_and_accessibility=0;
  expect(evaluateL33Rubric(scores)).toMatchObject({valid:true,total:94,meets_threshold:false});
 });
 it("rejects an independent teacher reviewer identical to the author",()=>{
  const r=clone(review);validHumanRow(r.lessons[0]);
  r.lessons[0].teacher_reviewer=r.lessons[0].author;
  expect(auditL33TeacherReviews(r).valid).toBe(false);
 });
 it("rejects approval if a critical editorial check is still false",()=>{
  const r=clone(review);validHumanRow(r.lessons[0]);
  r.lessons[0].editorial_checks.mastery_followup_private=false;
  expect(auditL33TeacherReviews(r).valid).toBe(false);
 });
 it("requires revision notes when teacher flags lesson for rewriting",()=>{
  const r=clone(review);validHumanRow(r.lessons[0]);
  r.lessons[0].status="REQUIRES_REVISION";r.lessons[0].revision_notes=null;
  expect(auditL33TeacherReviews(r).valid).toBe(false);
 });
 it("44 completely filled synthetic records are reviewable metadata only, never a release",()=>{
  const r=clone(review);for(const x of r.lessons)validHumanRow(x);
  expect(auditL33TeacherReviews(r)).toMatchObject({
   valid:true,approved_metadata_count:44,
   status:"READY_FOR_INDEPENDENT_TEACHER_EVIDENCE_AUDIT",
   teacher_review_certified_by_tool:0,release_authorized:false
  });
  expect(review.lessons.every(x=>x.status==="NOT_REVIEWED")).toBe(true);
 });
 it("detects structural training steps and Guided/Independent/Mastery coverage without exposing answers",()=>{
  const p=syntheticPackage(),result=inspectL33LocalPackage(p);
  expect(result.passed_checks).toBe(result.total_checks);
  expect(result.failed_check_codes).toEqual([]);
  expect(result.teacher_quality_approved).toBe(false);
  expect(JSON.stringify(result)).not.toContain("Please discuss a new");
  expect(JSON.stringify(result)).not.toContain("model_answer");
 });
 it("detects absent Guided hint text and duplicate prompts",()=>{
  const p=syntheticPackage();p.lesson.guided[0].hints[1].text_vi="";
  p.lesson.guided[1].question_en=p.lesson.guided[0].question_en;
  p.hash=sha(p.lesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("three_progressive_hints");
  expect(result.failed_check_codes).toContain("no_exact_question_duplicates");
 });
 it("detects Mastery follow-up missing or leaked into student content",()=>{
  const p=syntheticPackage();
  delete p.privateLesson.mastery["S6-001-M01"].followup_en;
  p.lesson.extras={unintended:p.privateLesson.mastery["S6-001-M02"].question_en};
  p.hash=sha(p.lesson);p.privateHash=sha(p.privateLesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("two_mastery_stubs_and_followups");
  expect(result.failed_check_codes).toContain("no_unseen_mastery_prompt_in_student_payload");
 });

 it("rejects missing Vietnamese translations and bilingual Guided reasoning",()=>{
  const p=syntheticPackage();
  delete p.privateLesson.guided["S6-001-G01"].model_translation_vi;
  p.privateHash=sha(p.privateLesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("guided_bilingual_feedback");
 });
 it("rejects duplicate hints even when there are exactly three levels",()=>{
  const p=syntheticPackage();
  p.lesson.guided[0].hints[2].text_vi=p.lesson.guided[0].hints[1].text_vi;
  p.hash=sha(p.lesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("guided_hints_distinct");
 });
 it("rejects mismatched or extra private bank activity IDs without showing content",()=>{
  const p=syntheticPackage();
  p.privateLesson.independent["S6-001-I99"]={
    question_en:"Do you prefer to study in the morning or in the evening?"
  };
  p.privateHash=sha(p.privateLesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("private_bank_activity_id_alignment");
  expect(JSON.stringify(result)).not.toContain("Do you prefer to study");
 });
 it("rejects independent prompt and Mastery follow-up leaked into student lesson",()=>{
  const p=syntheticPackage();
  p.lesson.extras={
    hiddenIndependent:p.privateLesson.independent["S6-001-I01"].question_en,
    hiddenMasteryFollowup:p.privateLesson.mastery["S6-001-M01"].followup_en
  };
  p.hash=sha(p.lesson);
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("no_unseen_independent_prompt_in_student_payload");
  expect(result.failed_check_codes).toContain("no_unseen_mastery_followup_in_student_payload");
 });
 it("rejects private answer and teacher reasoning field names anywhere in student content",()=>{
  const p=syntheticPackage();
  p.lesson.steps[0].learning_content.teacher_reasoning_vi="Hidden teacher explanation";
  p.hash=sha(p.lesson);
  expect(inspectL33LocalPackage(p).failed_check_codes)
   .toContain("public_payload_has_no_private_response_fields");
 });
 it("cannot approve a pending independent review with weak rubric scores",()=>{
  const r=clone(review);validHumanRow(r.lessons[0]);
  r.lessons[0].status="PENDING_INDEPENDENT_QA";
  r.lessons[0].rubric.privacy_and_accessibility=0;
  expect(auditL33TeacherReviews(r).valid).toBe(false);
 });
 it("detects student and teacher hash tampering",()=>{
  const p=syntheticPackage();p.lesson.steps[0].instruction_en="Tampered student content";
  p.privateLesson.guided["S6-001-G01"].model_answer_en="Tampered teacher answer";
  const result=inspectL33LocalPackage(p);
  expect(result.failed_check_codes).toContain("signed_student_hash");
  expect(result.failed_check_codes).toContain("signed_private_hash");
 });
});
