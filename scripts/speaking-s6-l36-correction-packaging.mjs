#!/usr/bin/env node
/**
 * M10-L36 — OFFLINE, read-only private S6 correction packaging / review gate.
 * Actual private files are only opened with --compare-local-pair, never in CI.
 * NO private text, answer, local path, source hash or sensitive user data output.
 * Never imports, overwrites, deploys, publishes, unlocks S7, or certifies IELTS.
 */
import {createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {evaluateL33Rubric,inspectL33LocalPackage,auditL33TeacherReviews}
  from "./speaking-s6-l33-teacher-review.mjs";
import {L34_CODEBOOK,auditL34Backlog}
  from "./speaking-s6-l34-editorial-remediation.mjs";
import {auditL35IntakeManifest}
  from "./speaking-s6-l35-source-intake.mjs";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const ID=i=>"S6-"+String(i).padStart(3,"0");
const ID_RE=/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])$/;
const REV=/^[A-Za-z0-9_-]{3,100}$/;
const SHA=/^[a-f0-9]{64}$/;
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const PERSON=/^[A-Za-z0-9 _.-]{3,90}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const STATES=["NOT_REQUESTED","DRAFT_PREPARED","TECHNICAL_REVIEWED","TEACHER_REVIEWED_PENDING_STAGING"];
const ENTRIES=new Set([...Object.keys(L34_CODEBOOK),
 "TEACHER_PEDAGOGY_GAP","SPOKEN_NATURALNESS",
 "PRONUNCIATION_SUPPORT","MASTERY_DIFFICULTY","SIMILARITY_REVIEW"]);
const REV_FIELDS=["source_revision","source_student_sha256","source_private_sha256",
 "target_revision","target_student_sha256","target_private_sha256",
 "source_evidence","proposal_evidence","change_author"];
const TECH_FIELDS=["first_reviewer","first_review_evidence"];
const TEACHER_FIELDS=["independent_teacher","teacher_review_evidence",
 "teacher_review_at_utc","teacher_rubric"];
const nullFields=(row,fields)=>fields.every(f=>row?.[f]===null);
const validRef=x=>typeof x==="string"&&REF.test(x);
const validPerson=x=>typeof x==="string"&&PERSON.test(x);
const validTime=x=>typeof x==="string"&&TIME.test(x)&&!Number.isNaN(Date.parse(x));
const uniqueCodes=x=>Array.isArray(x)&&x.length>0&&new Set(x).size===x.length&&
 x.every(k=>ENTRIES.has(k));

export function auditL36CorrectionManifest(manifest,source,backlog,teacher){
 const errors=[],counts=Object.fromEntries(STATES.map(x=>[x,0]));
 const previous=auditL35IntakeManifest(source,teacher,backlog);
 if(!previous.valid)errors.push("PRIOR_L35_SOURCE_PROVENANCE_INVALID");
 if(!auditL33TeacherReviews(teacher).valid||!auditL34Backlog(backlog,teacher).valid)
   errors.push("PRIOR_TEACHER_OR_BACKLOG_MANIFEST_INVALID");
 if(manifest?.milestone!=="M10-L36"||manifest?.expected_lessons!==44||
   manifest?.revision_policy!=="ADD_ONLY"||manifest?.production_untouched!==true||
   manifest?.release_authorized!==false||manifest?.s7_locked!==true)
   errors.push("CORRECTION_HEADER_AND_RELEASE_LOCK_INVALID");
 if(!Array.isArray(manifest?.lessons))
   return {valid:false,errors:[...errors,"MISSING_CORRECTION_ROWS"],counts,
     status:"HOLD_INVALID_METADATA",release_authorized:false,s7_unlock_authorized:false};
 if(manifest.lessons.length!==44)errors.push("REQUIRES_EXACTLY_44_CORRECTION_RECORDS");
 for(let i=0;i<manifest.lessons.length;i++){
  const row=manifest.lessons[i],id=ID(i+1),prior=source?.lessons?.[i];
  if(!row||row.lesson_id!==id){errors.push("LESSON_ID_DRIFT:"+id);continue;}
  if(!STATES.includes(row.state)){errors.push("INVALID_CORRECTION_STATE:"+id);continue;}
  counts[row.state]++;
  if(row.staging_retest_evidence!==null)
   errors.push("STAGING_RETEST_CANNOT_BE_PREAPPROVED:"+id);
  if(row.state==="NOT_REQUESTED"){
   if(!nullFields(row,[...REV_FIELDS,...TECH_FIELDS,...TEACHER_FIELDS])||
     !Array.isArray(row.reason_codes)||row.reason_codes.length)
     errors.push("NO_CORRECTION_BUT_FAKE_SIGNOFF_OR_REVISION:"+id);
   continue;
  }
  if(prior?.lesson_id!==id||prior?.intake_state!=="RIGHTS_CHECKED_PENDING_TEACHER"||
     !validRef(prior.rights_evidence))
   errors.push("ORIGINAL_RIGHTS_AND_SOURCE_NOT_VERIFIED:"+id);
  if(!REV.test(row.source_revision??"")||!REV.test(row.target_revision??"")||
     row.source_revision===row.target_revision||
     !SHA.test(row.source_student_sha256??"")||
     !SHA.test(row.source_private_sha256??"")||
     !SHA.test(row.target_student_sha256??"")||
     !SHA.test(row.target_private_sha256??"")||
     (row.source_student_sha256===row.target_student_sha256&&
      row.source_private_sha256===row.target_private_sha256))
   errors.push("ADD_ONLY_REVISION_AND_CONTENT_HASH_REQUIRED:"+id);
  if(row.source_revision!==prior?.source_revision||
     row.source_student_sha256!==prior?.student_sha256||
     row.source_private_sha256!==prior?.private_sha256||
     row.source_evidence!==prior?.local_structural_evidence)
   errors.push("IMMUTABLE_SOURCE_HASH_OR_PROVENANCE_DRIFT:"+id);
  if(!uniqueCodes(row.reason_codes)||
     !validPerson(row.change_author)||!validRef(row.proposal_evidence))
   errors.push("NO_TYPED_CORRECTION_REASON_OR_AUTHOR_PROOF:"+id);
  if(row.state==="DRAFT_PREPARED"){
   if(!nullFields(row,[...TECH_FIELDS,...TEACHER_FIELDS]))
     errors.push("DRAFT_CANNOT_CLAIM_REVIEWERS:"+id);
   continue;
  }
  if(!validPerson(row.first_reviewer)||!validRef(row.first_review_evidence)||
     row.first_reviewer===row.change_author)
   errors.push("TECHNICAL_REVIEW_MUST_BE_SEPARATE_FROM_AUTHOR:"+id);
  if(row.state==="TECHNICAL_REVIEWED"){
   if(!nullFields(row,TEACHER_FIELDS))
     errors.push("TECHNICAL_REVIEW_CANNOT_CLAIM_TEACHER_APPROVAL:"+id);
   continue;
  }
  const score=evaluateL33Rubric(row.teacher_rubric);
  if(!validPerson(row.independent_teacher)||
     row.independent_teacher===row.change_author||
     row.independent_teacher===row.first_reviewer||
     !validRef(row.teacher_review_evidence)||
     !validTime(row.teacher_review_at_utc)||
     !score.valid||!score.meets_threshold)
   errors.push("INDEPENDENT_TEACHER_REVIEW_NOT_SUPPORTED:"+id);
 }
 const proposed=counts.DRAFT_PREPARED+counts.TECHNICAL_REVIEWED+
   counts.TEACHER_REVIEWED_PENDING_STAGING;
 if(manifest.revisions_proposed!==proposed)
   errors.push("PROPOSAL_COUNT_DOES_NOT_MATCH_ROWS");
 const valid=errors.length===0;
 return {
  milestone:"M10-L36",valid,errors,lesson_count:manifest.lessons.length,counts,
  status:!valid?"HOLD_INVALID_METADATA":
   proposed===0?"HOLD_NO_ORIGINAL_CORRECTION_PACKAGES":
   counts.DRAFT_PREPARED||counts.TECHNICAL_REVIEWED?
     "HOLD_INDEPENDENT_EDITORIAL_REVIEW":
     "READY_FOR_OPERATOR_STAGING_RETEST_NOT_RELEASE",
  proposed_revision_count:proposed,
  // A metadata flag cannot authenticate signed human approval or contents.
  human_signoffs_verified_by_tool:0,teacher_quality_certified:false,
  private_content_returned:false,release_authorized:false,
  s7_unlock_authorized:false,production_changes_authorized:false
 };
}

const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const hash=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
const hasFields=x=>!!x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===5&&["revision","hash","privateHash","lesson","privateLesson"]
 .every(k=>Object.hasOwn(x,k));
const same=x=>JSON.stringify(x);
const modeIds=(p,mode)=>p?.lesson?.[mode]?.map(x=>x?.activity_id);
const changeCount=(a,b)=>a.filter((x,i)=>same(x)!==same(b?.[i])).length;
const bankList=(p,mode,ids)=>ids.map(id=>p?.privateLesson?.[mode]?.[id]);
const comparisonField=(p,mode,ids,key)=>bankList(p,mode,ids).map(x=>x?.[key]);
const shortErrors=arr=>[...new Set(arr)];
/**
 * Strict single-pair, in-memory correction compatibility. Old content is
 * never changed, private bank never exposed; does NOT perform actual import.
 */
export function compareL36PrivateRevisions(original,revised){
 const errors=[];
 const l0=original?.lesson,l1=revised?.lesson;
 if(!hasFields(original)||!hasFields(revised))
   errors.push("INVALID_ROOT_IMPORT_FIELDS");
 if(!ID_RE.test(l0?.lesson_id??"")||l0?.lesson_id!==l1?.lesson_id)
   errors.push("LESSON_SCOPE_NOT_IDENTICAL");
 if(!REV.test(original?.revision??"")||!REV.test(revised?.revision??"")||
    original.revision===revised.revision)
   errors.push("ADD_ONLY_NEW_REVISION_REQUIRED");
 for(const [p,label] of [[original,"SOURCE"],[revised,"TARGET"]]){
  if(!SHA.test(p?.hash??"")||!SHA.test(p?.privateHash??"")||
     p.hash!==hash(p.lesson)||p.privateHash!==hash(p.privateLesson))
    errors.push(label+"_SIGNED_CONTENT_HASH_INVALID");
  if(p?.lesson?.status!=="STAGING_REVIEW_REQUIRED"||
     p?.lesson?.publish_allowed!==false)
    errors.push(label+"_RELEASE_GUARD_NOT_LOCKED");
 }
 const revisionDiff=original?.hash!==revised?.hash||
   original?.privateHash!==revised?.privateHash;
 if(!revisionDiff)errors.push("NO_CONTENT_CHANGE_ONLY_REVISION_RENAME");
 const sectionIds={};
 for(const mode of ["guided","independent","mastery"]){
  const a=modeIds(original,mode),b=modeIds(revised,mode);
  if(!Array.isArray(a)||!Array.isArray(b)||same(a)!==same(b)){
   errors.push("ACTIVITY_IDENTITY_DRIFT_"+mode.toUpperCase());continue;
  }
  sectionIds[mode]=a;
 }
 // No private text, hashes, raw keys or source paths are returned.
 const targetScan=inspectL33LocalPackage(revised);
 if(targetScan.failed_check_codes.length)errors.push("REVISED_PACKAGE_STRUCTURAL_CHECKS_FAILED");
 const guided=sectionIds.guided??[],independent=sectionIds.independent??[],
   mastery=sectionIds.mastery??[];
 const summary={
  student_changed:original?.hash!==revised?.hash,
  private_bank_changed:original?.privateHash!==revised?.privateHash,
  guided_prompts_changed:changeCount(original?.lesson?.guided?.map(x=>x.question_en)??[],
    revised?.lesson?.guided?.map(x=>x.question_en)??[]),
  guided_models_changed:changeCount(comparisonField(original,"guided",guided,"model_answer_en"),
    comparisonField(revised,"guided",guided,"model_answer_en")),
  guided_explanations_changed:changeCount(comparisonField(original,"guided",guided,"teacher_reasoning_vi"),
    comparisonField(revised,"guided",guided,"teacher_reasoning_vi")),
  independent_prompts_changed:changeCount(comparisonField(original,"independent",independent,"question_en"),
    comparisonField(revised,"independent",independent,"question_en")),
  mastery_prompts_changed:changeCount(comparisonField(original,"mastery",mastery,"question_en"),
    comparisonField(revised,"mastery",mastery,"question_en")),
  mastery_followups_changed:changeCount(
    mastery.map(id=>[original?.privateLesson?.mastery?.[id]?.followup_en,
      original?.privateLesson?.mastery?.[id]?.followups_en]),
    mastery.map(id=>[revised?.privateLesson?.mastery?.[id]?.followup_en,
      revised?.privateLesson?.mastery?.[id]?.followups_en]))
 };
 return {
  milestone:"M10-L36",lesson_id:ID_RE.test(l0?.lesson_id??"")?l0.lesson_id:null,
  status:errors.length?"HOLD_CORRECTION_PACKAGE":"READY_FOR_SEPARATE_HUMAN_REVIEWS",
  errors:shortErrors(errors),
  impact:summary,
  source_original_unchanged:true,actual_import_performed:false,
  real_human_approval_verified:false,private_content_returned:false,
  release_authorized:false,s7_unlock_authorized:false
 };
}
function localFile(path){
 const resolved=resolve(path),stat=lstatSync(resolved);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024||stat.size<100)
   throw Error("LOCAL_FILE_NOT_REGULAR_OR_TOO_LARGE");
 return JSON.parse(readFileSync(resolved,"utf8"));
}
async function main(){
 const read=p=>JSON.parse(readFileSync(resolve(ROOT,p),"utf8"));
 const report=auditL36CorrectionManifest(
   read("tests/speaking-s6/m10-l36-correction-manifest.json"),
   read("tests/speaking-s6/m10-l35-source-intake.json"),
   read("tests/speaking-s6/m10-l34-editorial-backlog.json"),
   read("tests/speaking-s6/m10-l33-teacher-review.json")
 );
 let pair=null;
 const i=process.argv.indexOf("--compare-local-pair");
 if(i>=0){
  if(!process.argv[i+1]||!process.argv[i+2])throw Error("TWO_PRIVATE_LOCAL_FILES_REQUIRED");
  pair=compareL36PrivateRevisions(localFile(process.argv[i+1]),localFile(process.argv[i+2]));
 }
 console.log(JSON.stringify({...report,local_pair_comparison:pair},null,2));
 if(!report.valid||(pair&&pair.errors.length)||
   (process.argv.includes("--require-reviewed-corrections")&&
    report.status!=="READY_FOR_OPERATOR_STAGING_RETEST_NOT_RELEASE"))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L36 correction review HOLD (no private path or data printed)");process.exitCode=2;});
}
