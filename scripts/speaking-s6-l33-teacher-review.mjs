#!/usr/bin/env node
/**
 * M10-L33: OFFLINE S6 pedagogical QA intake.
 *
 * This tool never sees Supabase by default, changes production, grants access,
 * publishes content, scores learner speech or certifies an IELTS band.
 * It does NOT turn teacher-entered scores into authenticated human signoff.
 *
 * A single private import package can optionally be checked IN MEMORY
 * from a local file; never print/commit its content or file path.
 */
import {createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const L33_DIMENSIONS=Object.freeze({
 learning_sequence:16,
 scaffold_progression:14,
 guided_examples:12,
 independent_transfer:12,
 mastery_authenticity:12,
 bilingual_feedback:12,
 grammar_pronunciation_vocabulary:10,
 spaced_review:6,
 privacy_and_accessibility:6
});
export const L33_CHECKS=Object.freeze([
 "teach_before_assess","ten_step_guidance","three_progressive_hints",
 "guided_model_evidence","independent_no_answer_leak","mastery_followup_private",
 "english_vietnamese_feedback","topic_and_question_variety",
 "realistic_speaking_prompts","spaced_review_2_7_21",
 "pronunciation_vocabulary_support","audio_consent_and_mobile_accessibility",
 "source_rights_and_originality","not_a_certified_band_score"
]);
const STATUS=new Set(["NOT_REVIEWED","REQUIRES_REVISION","PENDING_INDEPENDENT_QA","APPROVED"]);
const HASH=/^[a-f0-9]{64}$/;
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const ID=n=>"S6-"+String(n).padStart(3,"0");
const present=x=>typeof x==="string"&&x.trim().length>0&&x.length<=120;
const safeText=x=>present(x)&&!/(https?:\/\/|Bearer\s|eyJ[A-Za-z0-9_-]{15,}|\btoken\b\s*[:=]|\bpassword\b\s*[:=]|\bsecret\b\s*[:=]|\b[\w.+-]+@[\w.-]+\.\w+\b)/i.test(x);
const goodTime=x=>typeof x==="string"&&TIME.test(x)&&!Number.isNaN(Date.parse(x));
function exactKeys(input,keys){
 return !!input&&typeof input==="object"&&!Array.isArray(input)&&
  Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k));
}

export function evaluateL33Rubric(scores){
 const entries=Object.entries(L33_DIMENSIONS);
 if(!exactKeys(scores,entries.map(([key])=>key)))
   return {valid:false,total:null,meets_threshold:false};
 for(const [k,max] of entries)
   if(!Number.isInteger(scores[k])||scores[k]<0||scores[k]>max)
     return {valid:false,total:null,meets_threshold:false};
 const total=entries.reduce((sum,[k])=>sum+scores[k],0);
 const floor={
  learning_sequence:12,scaffold_progression:10,
  independent_transfer:9,mastery_authenticity:9,
  bilingual_feedback:9,privacy_and_accessibility:6
 };
 const meets_threshold=total>=90&&Object.entries(floor)
   .every(([key,min])=>scores[key]>=min);
 return {valid:true,total,meets_threshold};
}

export function auditL33TeacherReviews(manifest){
 const counts={NOT_REVIEWED:0,REQUIRES_REVISION:0,PENDING_INDEPENDENT_QA:0,APPROVED:0};
 const errors=[];
 if(manifest?.milestone!=="M10-L33"||manifest?.production_untouched!==true||
    manifest?.release_authorized!==false||manifest?.s7_locked!==true||
    manifest?.lesson_count_expected!==44)
   errors.push("L33 release safety or review metadata invalid");
 if(!Array.isArray(manifest?.lessons))
   return {valid:false,errors:["Missing 44 lesson review records",...errors],
     counts,lesson_count:0,approved_metadata_count:0,
     status:"HOLD_INVALID_METADATA",teacher_review_certified_by_tool:0,
     release_authorized:false,s7_unlock_authorized:false};
 if(manifest.lessons.length!==44)errors.push("Expected exactly 44 original S6 lesson review records");
 const ids=new Set(),weak=[];
 for(let i=0;i<manifest.lessons.length;i++){
  const row=manifest.lessons[i],expected=ID(i+1);
  if(!row||row.lesson_id!==expected||ids.has(row.lesson_id)){
   errors.push("Missing or duplicate lesson ID at position "+(i+1));continue;
  }
  ids.add(row.lesson_id);
  if(!STATUS.has(row.status)){errors.push("Invalid review state: "+expected);continue;}
  counts[row.status]++;
  if(row.status==="NOT_REVIEWED"){
   // The unexecuted template must not masquerade as content QA.
   if(row.rubric!==null||row.teacher_reviewer!==null||row.reviewed_at_utc!==null||
      row.evidence!==null)errors.push("Unreviewed lesson has fabricated QA fields: "+expected);
   continue;
  }
  if(!present(row.source_revision)||!HASH.test(row.student_sha256??"")||
     !HASH.test(row.private_sha256??""))
    errors.push("Content revision/hashes missing: "+expected);
  if(!safeText(row.author)||!REF.test(row.evidence??""))
    errors.push("Content author and restricted evidence required: "+expected);
  const scores=evaluateL33Rubric(row.rubric);
  if(!scores.valid)errors.push("Score rubric is incomplete/invalid: "+expected);
  if(row.status==="REQUIRES_REVISION"){
   if(!safeText(row.revision_notes))errors.push("Revision reason required: "+expected);
  }
  if(row.status==="APPROVED"||row.status==="PENDING_INDEPENDENT_QA"){
   if(!scores.meets_threshold){weak.push(expected);errors.push("Insufficient score for independent QA: "+expected);}
   if(!exactKeys(row.editorial_checks,L33_CHECKS)||L33_CHECKS.some(k=>row.editorial_checks[k]!==true))
     errors.push("Editorial content checks must all pass: "+expected);
  }
  if(row.status==="APPROVED"){
   if(!safeText(row.teacher_reviewer)||row.teacher_reviewer===row.author||
      !goodTime(row.reviewed_at_utc))
     errors.push("Independent teacher review and UTC timestamp required: "+expected);
   if(!scores.meets_threshold)errors.push("Lesson below editorial acceptance threshold: "+expected);
  }
 }
 const approved=counts.APPROVED;
 const valid=errors.length===0;
 return {
  valid,errors,lesson_count:manifest.lessons.length,counts,
  approved_metadata_count:approved,
  under_threshold_lesson_ids:weak,
  status:!valid?"HOLD_INVALID_METADATA":
    approved===44?"READY_FOR_INDEPENDENT_TEACHER_EVIDENCE_AUDIT":"HOLD_TEACHER_CONTENT_NOT_REVIEWED",
  teacher_review_certified_by_tool:0,release_authorized:false,
  s7_unlock_authorized:false
 };
}

const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const sha=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
const text=x=>typeof x==="string"&&x.trim().length>=5;
const normalized=x=>String(x??"").trim().toLocaleLowerCase("en");
const guidedText=h=>!!h&&typeof h==="object"&&
  (text(h.text_en)||text(h.text_vi));
const SENSITIVE_PUBLIC_FIELDS=new Set([
  "model_answer_en","model_translation_vi","teacher_reasoning_vi",
  "teaching_explanation_en","followup_en","followups_en",
  "privateLesson","privateBank","private_answer_bank","answer_key",
  "answer_keys","correct_answer_en","mastery_answer"
]);
function publicFieldsSafe(value){
  if(Array.isArray(value))return value.every(publicFieldsSafe);
  if(!value||typeof value!=="object")return true;
  return Object.entries(value).every(([key,entry])=>
    !SENSITIVE_PUBLIC_FIELDS.has(key)&&
    (key!=="teacher_private_bank"||entry==="SERVER_ONLY")&&
    publicFieldsSafe(entry));
}
const modelHasBilingualExplanation=x=>text(x?.model_translation_vi)&&
  text(x?.teaching_explanation_en)&&text(x?.teacher_reasoning_vi);
const objectMatchesActivities=(rows,bank,prefix,lessonId)=>
  Array.isArray(rows)&&!!bank&&typeof bank==="object"&&
  !Array.isArray(bank)&&Object.keys(bank).length===rows.length&&
  rows.every((row,i)=>row?.activity_id===
     lessonId+"-"+prefix+String(i+1).padStart(2,"0")&&
     Object.hasOwn(bank,row.activity_id));


/**
 * Technical *signals* from one operator-owned local S6 import payload.
 * Flags are NOT scores for grammar accuracy, band authenticity or teacher
 * judgment. Contents, answers and local paths are never returned.
 */
export function inspectL33LocalPackage(pkg){
 const checks={};
 const fail=(name,ok)=>{checks[name]=Boolean(ok);};
 const lesson=pkg?.lesson,privateLesson=pkg?.privateLesson;
 const steps=lesson?.steps,guided=lesson?.guided,
   independent=lesson?.independent,mastery=lesson?.mastery,
   review=lesson?.spaced_review;
 fail("signed_student_hash",!!lesson&&HASH.test(pkg?.hash??"")&&sha(lesson)===pkg.hash);
 fail("signed_private_hash",!!privateLesson&&HASH.test(pkg?.privateHash??"")&&sha(privateLesson)===pkg.privateHash);
 fail("ten_ordered_steps",Array.isArray(steps)&&steps.length===10&&
   steps.every((x,i)=>x?.step===i+1));
 fail("bilingual_step_instruction",Array.isArray(steps)&&steps.length===10&&
   steps.every(x=>text(x?.instruction_vi)&&text(x?.instruction_en)));
 fail("step_teaching_content",Array.isArray(steps)&&steps.length===10&&
   steps.every(x=>x?.learning_content&&typeof x.learning_content==="object"&&
     Object.keys(x.learning_content).length>0));
 fail("four_guided_activities",Array.isArray(guided)&&guided.length===4);
 fail("three_progressive_hints",Array.isArray(guided)&&guided.length===4&&
   guided.every(x=>Array.isArray(x.hints)&&x.hints.length===3&&
     x.hints.every((hint,i)=>hint?.level===i+1&&guidedText(hint))));
 fail("guided_model_bank",Array.isArray(guided)&&guided.length===4&&
   guided.every(x=>text(privateLesson?.guided?.[x.activity_id]?.model_answer_en)));
 fail("guided_bilingual_feedback",Array.isArray(guided)&&guided.length===4&&
   guided.every(x=>modelHasBilingualExplanation(privateLesson?.guided?.[x.activity_id])));
 fail("guided_hints_distinct",Array.isArray(guided)&&guided.length===4&&
   guided.every(x=>Array.isArray(x.hints)&&x.hints.length===3&&
     new Set(x.hints.map(h=>normalized(h?.text_en||h?.text_vi))).size===3));
 fail("private_bank_activity_id_alignment",!!lesson?.lesson_id&&
   objectMatchesActivities(guided,privateLesson?.guided,"G",lesson.lesson_id)&&
   objectMatchesActivities(independent,privateLesson?.independent,"I",lesson.lesson_id)&&
   objectMatchesActivities(mastery,privateLesson?.mastery,"M",lesson.lesson_id));
 fail("three_independent_stubs",Array.isArray(independent)&&independent.length===3&&
   independent.every(x=>x?.mode==="INDEPENDENT"&&
     x.no_answer_key_on_student===true&&text(privateLesson?.independent?.[x.activity_id]?.question_en)));
 fail("two_mastery_stubs_and_followups",Array.isArray(mastery)&&mastery.length===2&&
   mastery.every(x=>{
     const b=privateLesson?.mastery?.[x.activity_id];
     const follow=typeof b?.followup_en==="string"?b.followup_en:
       Array.isArray(b?.followups_en)?b.followups_en[0]:null;
     return x?.mode==="MASTERY"&&x.no_answer_key_on_student===true&&
       text(b?.question_en)&&text(follow)&&normalized(b.question_en)!==normalized(follow);
   }));
 fail("spaced_review_day_2_7_21",Array.isArray(review)&&review.length===3&&
   review.every((x,i)=>x?.day_offset===[2,7,21][i]));
 const allQuestions=[
  ...(Array.isArray(guided)?guided.map(x=>x?.question_en):[]),
  ...(Array.isArray(independent)?independent.map(x=>privateLesson?.independent?.[x.activity_id]?.question_en):[]),
  ...(Array.isArray(mastery)?mastery.map(x=>privateLesson?.mastery?.[x.activity_id]?.question_en):[])
 ].filter(text);
 fail("no_exact_question_duplicates",allQuestions.length===9&&
   new Set(allQuestions.map(normalized)).size===9);
 const publicJson=JSON.stringify(lesson??{}).toLowerCase();
 fail("no_unseen_mastery_prompt_in_student_payload",
   Array.isArray(mastery)&&mastery.length===2&&mastery.every(x=>{
     const q=privateLesson?.mastery?.[x.activity_id]?.question_en;
     return text(q)&&!publicJson.includes(normalized(q));
   }));
 fail("no_unseen_independent_prompt_in_student_payload",
   Array.isArray(independent)&&independent.length===3&&
     independent.every(x=>{
       const q=privateLesson?.independent?.[x.activity_id]?.question_en;
       return text(q)&&!publicJson.includes(normalized(q));
     }));
 fail("no_unseen_mastery_followup_in_student_payload",
   Array.isArray(mastery)&&mastery.length===2&&mastery.every(x=>{
     const entry=privateLesson?.mastery?.[x.activity_id];
     const followups=[
       ...(typeof entry?.followup_en==="string"?[entry.followup_en]:[]),
       ...(Array.isArray(entry?.followups_en)?entry.followups_en:[])
     ];
     return followups.length>0&&followups.every(q=>
       text(q)&&!publicJson.includes(normalized(q)));
   }));
 fail("public_payload_has_no_private_response_fields",publicFieldsSafe(lesson));
 // Empty fields are warnings to the educator, not automatic labels of band.
 return {
  inspection:"ONE_LOCAL_IMPORT_PAYLOAD_STRUCTURAL_SIGNALS_ONLY",
  total_checks:Object.keys(checks).length,
  passed_checks:Object.values(checks).filter(Boolean).length,
  failed_check_codes:Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key),
  teacher_quality_approved:false,ielts_band_score:null,
  private_content_returned:false
 };
}

async function main(){
 const manifest=JSON.parse(readFileSync(resolve(ROOT,"tests/speaking-s6/m10-l33-teacher-review.json"),"utf8"));
 const report=auditL33TeacherReviews(manifest);
 let localInspection=null;
 const index=process.argv.indexOf("--inspect-local-package");
 if(index>=0){
   if(process.argv.length<=index+1)throw Error("Private local JSON path required");
   const path=resolve(process.argv[index+1]);
   const stat=lstatSync(path);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)
     throw Error("Local package is not a regular file within size limit");
   localInspection=inspectL33LocalPackage(JSON.parse(readFileSync(path,"utf8")));
 }
 console.log(JSON.stringify({milestone:"M10-L33",...report,
   localInspection,
   release_authorized:false},null,2));
 if(!report.valid||(localInspection?.failed_check_codes.length>0 &&
     process.argv.includes("--require-local-structural-pass"))||
   (process.argv.includes("--require-all-teacher-approved")&&
     report.status!=="READY_FOR_INDEPENDENT_TEACHER_EVIDENCE_AUDIT"))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L33 private editorial QA unavailable");process.exitCode=2;});
}
