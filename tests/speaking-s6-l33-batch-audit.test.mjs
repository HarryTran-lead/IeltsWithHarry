import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {auditL33BatchPackages} from "../scripts/speaking-s6-l33-batch-audit.mjs";

const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const digest=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
function packageFor(number){
 const id="S6-"+String(number).padStart(3,"0");
 const guided=Array.from({length:4},(_,i)=>({
   activity_id:id+"-G0"+(i+1),
   question_en:"How would you explain guided practice topic "+id+"-"+i+"?",
   hints:Array.from({length:3},(_,j)=>({
     level:j+1,text_vi:"Gợi ý học cách trình bày ý số "+j+" về "+id
   }))
 }));
 const independent=Array.from({length:3},(_,i)=>({
   activity_id:id+"-I0"+(i+1),mode:"INDEPENDENT",no_answer_key_on_student:true
 }));
 const mastery=Array.from({length:2},(_,i)=>({
   activity_id:id+"-M0"+(i+1),mode:"MASTERY",no_answer_key_on_student:true
 }));
 const lesson={lesson_id:id,status:"STAGING_REVIEW_REQUIRED",publish_allowed:false,
   steps:Array.from({length:10},(_,i)=>({
     step:i+1,instruction_en:"Practise the targeted speaking structure.",
     instruction_vi:"Luyện tập từng bước với cấu trúc nói cụ thể.",
     learning_content:{example:"Sample guided explanation "+i}
   })),
   guided,independent,mastery,
   spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}]
 };
 const privateLesson={
   guided:Object.fromEntries(guided.map((x,i)=>[x.activity_id,{
     model_answer_en:"A clear example with a reason for guided topic "+id+"-"+i,
     model_translation_vi:"Ví dụ với lí do rõ ràng cho chủ đề "+id+"-"+i,
     teaching_explanation_en:"Develop the answer with a topic sentence and relevant example.",
     teacher_reasoning_vi:"Cần trình bày ý rõ ràng và ví dụ liên quan."
   }])),
   independent:Object.fromEntries(independent.map((x,i)=>[x.activity_id,{
     question_en:"What might you do to improve independent speaking topic "+id+"-"+i+"?"
   }])),
   mastery:Object.fromEntries(mastery.map((x,i)=>[x.activity_id,{
     question_en:"How would you analyse complex Mastery topic "+id+"-"+i+"?",
     followup_en:"What changes might influence this Mastery topic "+id+"-"+i+"?"
   }]))
 };
 return {lessonId:id,pkg:{lesson,privateLesson,
   hash:digest(lesson),privateHash:digest(privateLesson)}};
}
const items=()=>Array.from({length:44},(_,i)=>packageFor(i+1));

describe("M10-L33 offline batch inspector (synthetic fixtures only)",()=>{
 it("verifies all 44 unique lesson structures without approving any teacher content",()=>{
   const report=auditL33BatchPackages(items());
   expect(report).toMatchObject({lessons_expected:44,lessons_checked:44,
     lessons_with_structure_flags:0,status:"READY_FOR_TEACHER_CONTENT_REVIEW",
     real_teacher_lessons_certified:0,release_authorized:false,
     s7_unlock_authorized:false,private_content_returned:false});
   expect(report.errors).toEqual([]);
 });
 it("holds if one of 44 private source packages is missing",()=>{
   const report=auditL33BatchPackages(items().slice(0,43));
   expect(report.status).toBe("HOLD_CONTENT_STRUCTURE");
   expect(report.errors).toContain("EXPECTED_44_LOCAL_PACKAGES");
 });
 it("rejects an extra or shifted S6 lesson identity",()=>{
   const fixtures=items();fixtures[8].lessonId="S6-010";
   const report=auditL33BatchPackages(fixtures);
   expect(report.errors.some(x=>x.includes("LESSON_ID_ORDER_OR_MISMATCH"))).toBe(true);
   expect(report.status).toBe("HOLD_CONTENT_STRUCTURE");
 });
 it("flags repeated unseen prompt across distinct lessons without logging the prompt text",()=>{
   const fixtures=items();
   fixtures[1].pkg.privateLesson.mastery["S6-002-M01"].question_en=
     fixtures[0].pkg.privateLesson.mastery["S6-001-M01"].question_en;
   fixtures[1].pkg.privateHash=digest(fixtures[1].pkg.privateLesson);
   const report=auditL33BatchPackages(fixtures);
   expect(report.status).toBe("HOLD_CONTENT_STRUCTURE");
   expect(report.errors).toContain("EXACT_CROSS_LESSON_PROMPT_DUPLICATES");
   expect(report.exact_cross_lesson_duplicate_lesson_ids).toContain("S6-001");
   expect(report.exact_cross_lesson_duplicate_lesson_ids).toContain("S6-002");
   expect(JSON.stringify(report)).not.toContain("How would you analyse complex Mastery");
 });
 it("flags missing bilingual teacher explanation in one lesson without changing content",()=>{
   const fixtures=items();
   delete fixtures[24].pkg.privateLesson.guided["S6-025-G01"].teacher_reasoning_vi;
   fixtures[24].pkg.privateHash=digest(fixtures[24].pkg.privateLesson);
   const report=auditL33BatchPackages(fixtures);
   expect(report.status).toBe("HOLD_CONTENT_STRUCTURE");
   expect(report.lesson_reports.find(x=>x.lesson_id==="S6-025").failed_check_codes)
     .toContain("guided_bilingual_feedback");
 });
});
