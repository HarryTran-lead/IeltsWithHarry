#!/usr/bin/env node
/**
 * M10-L34: offline, non-destructive S6 editorial remediation triage.
 * L33 structural findings are indicators only, not evidence of teacher quality.
 * Never imports/edits content, reads private source unless explicitly opted in,
 * records real teacher scores, authorizes release, or emits question/answer text.
 */
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {auditL33TeacherReviews} from "./speaking-s6-l33-teacher-review.mjs";
import {auditL33BatchPackages,readL33PrivateDirectory} from "./speaking-s6-l33-batch-audit.mjs";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const ID=n=>"S6-"+String(n).padStart(3,"0");
const HEX=/^[a-f0-9]{64}$/;
const REV=/^[A-Za-z0-9_-]{3,100}$/;
const EVIDENCE=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const LABEL=/^[A-Za-z0-9 _.-]{3,90}$/;
const STATUS=new Set(["NOT_SCANNED","STRUCTURE_FLAGGED","STRUCTURE_PASSED","REVISION_PENDING_RESCAN"]);
const EXPECTED_DISPOSITION={
  NOT_SCANNED:"UNASSESSED",
  STRUCTURE_FLAGGED:"REMEDIATION_REQUIRED",
  STRUCTURE_PASSED:"READY_FOR_TEACHER_REVIEW",
  REVISION_PENDING_RESCAN:"RETEST_REQUIRED"
};
const CODEBOOK=Object.freeze({
  student_package_release_locked:{tier:"P0",area:"release_guard",action:"Restore staged-only status and publish_allowed=false; never unlock the student payload."},
  signed_student_hash:{tier:"P0",area:"source_integrity",action:"Re-export original student content and recompute canonical SHA-256; reject tampered revision."},
  signed_private_hash:{tier:"P0",area:"source_integrity",action:"Re-export the private teacher bank from authorized source; recompute canonical SHA-256."},
  private_bank_activity_id_alignment:{tier:"P0",area:"answer_secrecy",action:"Reconcile all Guided, Independent, Mastery activity IDs against the private bank before ADD-ONLY revision."},
  no_unseen_mastery_prompt_in_student_payload:{tier:"P0",area:"answer_secrecy",action:"Remove leaked unseen Mastery prompt from public lesson; create a new private-safe revision."},
  no_unseen_independent_prompt_in_student_payload:{tier:"P0",area:"answer_secrecy",action:"Remove leaked Independent prompt from public lesson; confirm private delivery only."},
  no_unseen_mastery_followup_in_student_payload:{tier:"P0",area:"answer_secrecy",action:"Remove leaked Mastery follow-up from public lesson and retest session reveal timing."},
  public_payload_has_no_private_response_fields:{tier:"P0",area:"answer_secrecy",action:"Remove private answer/reasoning fields from learner payload; isolate them server-side."},
  ten_ordered_steps:{tier:"P1",area:"learning_sequence",action:"Restore ten sequential micro-lessons: teach, model, practise, transfer and review."},
  four_guided_activities:{tier:"P1",area:"guided",action:"Provide four varied Guided prompts that progressively reduce help."},
  guided_model_bank:{tier:"P1",area:"guided",action:"Author a model answer explaining why it works, delivered only after learner submission."},
  three_independent_stubs:{tier:"P1",area:"independent",action:"Provide three novel Independent tasks; do not expose private prompts before starting."},
  two_mastery_stubs_and_followups:{tier:"P1",area:"mastery",action:"Provide two unseen Mastery prompts plus distinct reasoning-based follow-ups."},
  no_exact_question_duplicates:{tier:"P1",area:"prompt_variety",action:"Replace duplicate within-lesson prompts with genuinely different communicative demands."},
  EXACT_CROSS_LESSON_PROMPT_DUPLICATES:{tier:"P1",area:"prompt_variety",action:"Review cross-lesson duplicate questions; replace repetition in a new ADD-ONLY revision."},
  bilingual_step_instruction:{tier:"P2",area:"learning_sequence",action:"Add actionable English and Vietnamese learner instructions at every teaching step."},
  step_teaching_content:{tier:"P2",area:"learning_sequence",action:"Expand empty teaching steps into explanations, examples and learner practice."},
  three_progressive_hints:{tier:"P2",area:"guided",action:"Add three graded hint levels: idea support, sentence structure, useful vocabulary."},
  guided_hints_distinct:{tier:"P2",area:"guided",action:"Rewrite hints so each provides a different scaffold without revealing the answer."},
  guided_bilingual_feedback:{tier:"P2",area:"bilingual_feedback",action:"Add Guided model translation plus English explanation and Vietnamese teacher reasoning."},
  spaced_review_day_2_7_21:{tier:"P2",area:"retention",action:"Restore distinct retrieval tasks on days 2, 7 and 21."}
});
const tiers={P0:0,P1:1,P2:2};
export const L34_CODEBOOK=CODEBOOK;
export function l34Round(n){return n<=11?"A":n<=22?"B":n<=33?"C":"D";}
function validCodes(codes){
 return Array.isArray(codes)&&codes.length>0&&
   new Set(codes).size===codes.length&&codes.every(x=>Object.hasOwn(CODEBOOK,x));
}
function rowSourceValid(r){
 return REV.test(r.source_revision??"")&&HEX.test(r.student_sha256??"")&&
  HEX.test(r.private_sha256??"")&&EVIDENCE.test(r.evidence??"");
}

export function auditL34Backlog(manifest,teacher){
 const errors=[],counts={NOT_SCANNED:0,STRUCTURE_FLAGGED:0,STRUCTURE_PASSED:0,REVISION_PENDING_RESCAN:0};
 const priorities={P0:0,P1:0,P2:0};
 const flagged=[];
 if(manifest?.milestone!=="M10-L34"||manifest?.expected_lessons!==44||
   manifest?.production_untouched!==true||manifest?.release_authorized!==false||
   manifest?.s7_locked!==true)
   errors.push("INVALID_L34_RELEASE_SAFETY_HEADER");
 const teacherAudit=auditL33TeacherReviews(teacher);
 if(!teacherAudit.valid)errors.push("INVALID_L33_TEACHER_MANIFEST");
 if(!Array.isArray(manifest?.lessons))
   return {valid:false,errors:[...errors,"MISSING_L34_LESSONS"],counts,priorities,status:"HOLD_INVALID_METADATA",
    teacher_reviews_certified:0,release_authorized:false,s7_unlock_authorized:false};
 if(manifest.lessons.length!==44)errors.push("EXPECTED_44_EDITORIAL_ROWS");
 for(let i=0;i<manifest.lessons.length;i++){
  const row=manifest.lessons[i],expected=ID(i+1),round=l34Round(i+1);
  if(!row||row.lesson_id!==expected||row.review_round!==round){
   errors.push("LESSON_ID_OR_ROUND_MISMATCH:"+expected);continue;
  }
  if(!STATUS.has(row.scan_status)){
   errors.push("INVALID_SCAN_STATUS:"+expected);continue;
  }
  counts[row.scan_status]++;
  if(row.disposition!==EXPECTED_DISPOSITION[row.scan_status])
   errors.push("INVALID_DISPOSITION:"+expected);
  if(row.teacher_reviewer!==null||row.teacher_review_at_utc!==null)
   errors.push("TEACHER_REVIEW_BELONGS_IN_L33_ONLY:"+expected);
  const teacherRow=teacher?.lessons?.[i];
  if(teacherRow?.lesson_id!==expected)
   errors.push("L33_TEACHER_ID_DRIFT:"+expected);
  if(row.scan_status==="NOT_SCANNED"){
   const absent=["source_revision","student_sha256","private_sha256",
     "evidence","change_author","proposed_new_revision"].every(k=>row[k]===null);
   if(!absent||!Array.isArray(row.finding_codes)||row.finding_codes.length)
     errors.push("UNSCANNED_ROW_HAS_FABRICATED_FINDINGS:"+expected);
   if(teacherRow?.status==="APPROVED")
     errors.push("TEACHER_APPROVED_WITHOUT_L34_SCAN:"+expected);
   continue;
  }
  if(!rowSourceValid(row))
   errors.push("SOURCE_REVISION_OR_EVIDENCE_MISSING:"+expected);
  if(teacherRow?.status!=="NOT_REVIEWED"&&
     (teacherRow.source_revision!==row.source_revision||
      teacherRow.student_sha256!==row.student_sha256||
      teacherRow.private_sha256!==row.private_sha256))
   errors.push("L33_L34_REVIEW_SOURCE_HASH_DRIFT:"+expected);
  if(row.scan_status==="STRUCTURE_PASSED"){
   if(!Array.isArray(row.finding_codes)||row.finding_codes.length||
      row.change_author!==null||row.proposed_new_revision!==null)
     errors.push("CLEAN_SCAN_HAS_FINDINGS_OR_UNAPPROVED_CHANGES:"+expected);
  }else{
   if(!validCodes(row.finding_codes))
     errors.push("INVALID_OR_EMPTY_FINDING_CODES:"+expected);
   else{
     for(const code of row.finding_codes){
       const p=CODEBOOK[code].tier;
       priorities[p]++;
       flagged.push({lesson_id:expected,code,priority:p,area:CODEBOOK[code].area,
         next_action:CODEBOOK[code].action});
     }
   }
   if(row.scan_status==="REVISION_PENDING_RESCAN"){
     if(!REV.test(row.proposed_new_revision??"")||
        row.proposed_new_revision===row.source_revision||
        !LABEL.test(row.change_author??""))
       errors.push("NO_PINNED_ADD_ONLY_REVISION_OR_AUTHOR:"+expected);
   }else if(row.change_author!==null||row.proposed_new_revision!==null)
     errors.push("UNREVIEWED_FIX_CLAIM:"+expected);
  }
  if(teacherRow?.status==="APPROVED"&&row.scan_status!=="STRUCTURE_PASSED")
   errors.push("TEACHER_APPROVED_WITH_UNRESOLVED_STRUCTURE:"+expected);
 }
 if(manifest.real_source_packages_inspected!==counts.STRUCTURE_PASSED+
   counts.STRUCTURE_FLAGGED+counts.REVISION_PENDING_RESCAN)
   errors.push("SOURCE_INSPECTION_COUNT_MISMATCH");
 flagged.sort((a,b)=>tiers[a.priority]-tiers[b.priority]||
   a.lesson_id.localeCompare(b.lesson_id)||a.code.localeCompare(b.code));
 const valid=errors.length===0;
 return {valid,errors,
  status:!valid?"HOLD_INVALID_METADATA":
   counts.NOT_SCANNED>0?"HOLD_MISSING_SOURCE_COVERAGE":
   counts.STRUCTURE_FLAGGED>0||counts.REVISION_PENDING_RESCAN>0?
     "HOLD_EDITORIAL_REMEDIATION":"READY_FOR_INDEPENDENT_TEACHER_REVIEW",
  counts,lesson_count:manifest.lessons.length,priorities,
  pending_teacher_reviews:teacherAudit.counts.NOT_REVIEWED,
  remediation_items:flagged,
  // A structural scan cannot certify qualitative pedagogical standards.
  human_lessons_approved_by_this_tool:0,
  release_authorized:false,s7_unlock_authorized:false,
  production_changes_authorized:false,private_content_returned:false};
}

/**
 * Draft an in-memory prioritized queue from ACTUAL L33 private-package
 * structural results. No review scores, PASS statuses, personal details,
 * model answers or export paths are emitted.
 */
export function draftL34Remediation(batch){
 const findings=[],ids=new Set(batch?.exact_cross_lesson_duplicate_lesson_ids??[]);
 const inputs=Array.isArray(batch?.lesson_reports)?batch.lesson_reports:[];
 const validId=/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])$/;
 for(const r of inputs){
  if(!validId.test(r?.lesson_id??""))continue;
  const codes=new Set(Array.isArray(r.failed_check_codes)?r.failed_check_codes:[]);
  if(ids.has(r.lesson_id))codes.add("EXACT_CROSS_LESSON_PROMPT_DUPLICATES");
  for(const code of codes){
    if(!Object.hasOwn(CODEBOOK,code))continue;
    const item=CODEBOOK[code];
    findings.push({lesson_id:r.lesson_id,code,priority:item.tier,
      area:item.area,next_action:item.action});
  }
 }
 findings.sort((a,b)=>tiers[a.priority]-tiers[b.priority]||
   a.lesson_id.localeCompare(b.lesson_id)||a.code.localeCompare(b.code));
 const complete=inputs.length===44&&batch?.lessons_checked===44&&
   batch?.status==="READY_FOR_TEACHER_CONTENT_REVIEW"&&
   batch?.lessons_with_structure_flags===0&&
   Array.isArray(batch?.errors)&&batch.errors.length===0&&
   ids.size===0&&findings.length===0&&
   new Set(inputs.map(x=>x.lesson_id)).size===44;
 return {
  milestone:"M10-L34",source:"LOCAL_L33_STRUCTURAL_SIGNALS_ONLY",
  lessons_inspected:batch?.lessons_checked??0,
  exact_duplicate_lesson_ids:[...ids].filter(x=>validId.test(x)).sort(),
  remediation_items:findings,
  ready_for_human_review:complete,
  independent_teacher_approval:false,
  release_authorized:false,s7_unlock_authorized:false,
  private_content_returned:false
 };
}

async function main(){
 const teacher=JSON.parse(readFileSync(resolve(ROOT,"tests/speaking-s6/m10-l33-teacher-review.json"),"utf8"));
 const manifest=JSON.parse(readFileSync(resolve(ROOT,"tests/speaking-s6/m10-l34-editorial-backlog.json"),"utf8"));
 const audit=auditL34Backlog(manifest,teacher);
 let local=null;
 const arg=process.argv.indexOf("--inspect-private-local-dir");
 if(arg>=0){
   if(!process.argv[arg+1])throw Error("LOCAL_PRIVATE_DIRECTORY_REQUIRED");
   const batch=auditL33BatchPackages(readL33PrivateDirectory(process.argv[arg+1]));
   local=draftL34Remediation(batch);
 }
 console.log(JSON.stringify({milestone:"M10-L34",...audit,local_preview:local},null,2));
 if(!audit.valid||(local&&!local.ready_for_human_review&&
   process.argv.includes("--require-no-structural-flags"))||
   (process.argv.includes("--require-complete-editorial-review")&&
     audit.status!=="READY_FOR_INDEPENDENT_TEACHER_REVIEW"))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L34 editorial metadata HOLD; no private content disclosed");process.exitCode=2;});
}
