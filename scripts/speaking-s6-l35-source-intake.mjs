#!/usr/bin/env node
/**
 * M10-L35: authorized S6 source intake and lexical overlap triage.
 * Safe default: reads redacted manifests only, no network, no changes.
 * --inspect-private-local-dir is a LOCAL, READ-ONLY operator action.
 * Never logs private source text, paths, question hashes, model answers or PII.
 * This does not certify rights, teachability, genuine speech or IELTS band.
 */
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {auditL33TeacherReviews} from "./speaking-s6-l33-teacher-review.mjs";
import {auditL33BatchPackages,readL33PrivateDirectory} from "./speaking-s6-l33-batch-audit.mjs";
import {auditL34Backlog} from "./speaking-s6-l34-editorial-remediation.mjs";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const ID=n=>"S6-"+String(n).padStart(3,"0");
const ID_RE=/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])$/;
const REV=/^[A-Za-z0-9_-]{3,100}$/;
const SHA=/^[a-f0-9]{64}$/;
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const REVIEWER=/^[A-Za-z0-9 _.-]{3,90}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const STATES=new Set([
  "NOT_RECEIVED","QUARANTINED",
  "STRUCTURE_SCANNED_PENDING_RIGHTS","RIGHTS_CHECKED_PENDING_TEACHER"
]);
const ISSUE_CODES=new Set([
  "MISSING_REVISION","HASH_MISMATCH","INVALID_IMPORT_SHAPE",
  "PUBLIC_PRIVATE_LEAK","MISSING_PRIVATE_BANK","UNSAFE_SOURCE",
  "UNVERIFIED_RIGHTS","STRUCTURAL_FAILURE","NEAR_DUPLICATE_REVIEW"
]);
const RIGHTS=new Set(["ORIGINAL_AUTHOR","LICENSED_PERMISSION"]);
const PHASES=new Set([
  "NOT_STARTED","CHANGE_REQUESTED","NEW_REVISION_PENDING",
  "INDEPENDENT_REVIEW_REQUIRED"
]);
const empty=x=>x===null;
const safeIso=x=>typeof x==="string"&&ISO.test(x)&&!Number.isNaN(Date.parse(x));
const allNull=(row,keys)=>keys.every(k=>empty(row[k]));
const sourceFields=["source_revision","student_sha256","private_sha256",
  "source_rights_basis","rights_evidence","local_structural_evidence",
  "intake_reviewer","intake_at_utc"];
const validCodes=x=>Array.isArray(x)&&new Set(x).size===x.length&&
  x.every(k=>ISSUE_CODES.has(k));
const checkedCounts=()=>Object.fromEntries([...STATES].map(k=>[k,0]));

export function auditL35IntakeManifest(manifest,teacher,backlog){
 const errors=[],counts=checkedCounts();
 const previousTeacher=auditL33TeacherReviews(teacher);
 const previousBacklog=auditL34Backlog(backlog,teacher);
 if(!previousTeacher.valid||!previousBacklog.valid)errors.push("PRIOR_EDITORIAL_MANIFEST_INVALID");
 if(manifest?.milestone!=="M10-L35"||manifest?.expected_lessons!==44||
    manifest?.production_untouched!==true||manifest?.release_authorized!==false||
    manifest?.s7_locked!==true||manifest?.release_state!=="HOLD_SOURCE_INTAKE")
   errors.push("INVALID_L35_RELEASE_LOCK_HEADER");
 if(!Array.isArray(manifest?.lessons))
   return {valid:false,errors:[...errors,"MISSING_INTAKE_ROWS"],counts,
     status:"HOLD_INVALID_METADATA",release_authorized:false,s7_unlock_authorized:false};
 if(manifest.lessons.length!==44)errors.push("REQUIRES_EXACTLY_44_LESSONS");
 for(let i=0;i<manifest.lessons.length;i++){
  const row=manifest.lessons[i],id=ID(i+1);
  if(!row||row.lesson_id!==id){errors.push("LESSON_ID_OR_ORDER_MISMATCH:"+id);continue;}
  if(!STATES.has(row.intake_state)){errors.push("INVALID_INTAKE_STATUS:"+id);continue;}
  counts[row.intake_state]++;
  if(!PHASES.has(row.teacher_remediation_status))
    errors.push("INVALID_REMEDIATION_PHASE:"+id);
  const codes=validCodes(row.intake_issue_codes);
  if(!codes)errors.push("UNKNOWN_OR_DUPLICATED_ISSUE_CODE:"+id);
  const peer=backlog?.lessons?.[i],reviewer=teacher?.lessons?.[i];
  if(peer?.lesson_id!==id||reviewer?.lesson_id!==id)
    errors.push("L33_L34_ID_DRIFT:"+id);
  if(row.intake_state==="NOT_RECEIVED"){
    if(!allNull(row,sourceFields)||row.intake_issue_codes?.length!==0||
       row.teacher_remediation_status!=="NOT_STARTED")
      errors.push("UNRECEIVED_SOURCE_HAS_FABRICATED_EVIDENCE:"+id);
    if(peer?.scan_status!=="NOT_SCANNED"||reviewer?.status!=="NOT_REVIEWED")
      errors.push("SOURCE_NOT_RECEIVED_BUT_PRIOR_QA_CLAIMED:"+id);
    continue;
  }
  if(row.intake_state==="QUARANTINED"){
    // Untrusted files may have no reliable revision/hash: quarantine may not
    // manufacture values merely to satisfy a metadata schema.
    if(row.intake_issue_codes?.length===0||!REF.test(row.local_structural_evidence??"")||
       !REVIEWER.test(row.intake_reviewer??"")||!safeIso(row.intake_at_utc))
      errors.push("QUARANTINE_NEEDS_SAFE_INTAKE_EVIDENCE:"+id);
    if(row.teacher_remediation_status==="INDEPENDENT_REVIEW_REQUIRED")
      errors.push("QUARANTINED_CANNOT_REQUEST_APPROVAL:"+id);
    continue;
  }
  if(!REV.test(row.source_revision??"")||!SHA.test(row.student_sha256??"")||
     !SHA.test(row.private_sha256??"")||
     !REF.test(row.local_structural_evidence??"")||
     !REVIEWER.test(row.intake_reviewer??"")||!safeIso(row.intake_at_utc))
    errors.push("SCANNED_SOURCE_PROVENANCE_INCOMPLETE:"+id);
  if(row.intake_issue_codes?.length!==0)
    errors.push("SCANNED_SOURCE_HAS_UNRESOLVED_INTAKE_FLAGS:"+id);
  if(peer?.scan_status!=="STRUCTURE_PASSED"||
     peer?.source_revision!==row.source_revision||
     peer?.student_sha256!==row.student_sha256||
     peer?.private_sha256!==row.private_sha256)
    errors.push("L34_SCANNED_REVISION_HASH_DRIFT:"+id);
  if(reviewer?.status!=="NOT_REVIEWED"&&(
     reviewer?.source_revision!==row.source_revision||
     reviewer?.student_sha256!==row.student_sha256||
     reviewer?.private_sha256!==row.private_sha256))
    errors.push("L33_REVIEW_REVISION_HASH_DRIFT:"+id);
  if(row.intake_state==="STRUCTURE_SCANNED_PENDING_RIGHTS"){
    if(!empty(row.source_rights_basis)||!empty(row.rights_evidence)||
       row.teacher_remediation_status!=="NOT_STARTED")
      errors.push("UNVERIFIED_RIGHTS_CANNOT_BE_TREATED_AS_APPROVED:"+id);
  }else if(!RIGHTS.has(row.source_rights_basis)||
    !REF.test(row.rights_evidence??"")){
    errors.push("INDEPENDENT_SOURCE_RIGHTS_EVIDENCE_MISSING:"+id);
  }
 }
 const received=counts.QUARANTINED+counts.STRUCTURE_SCANNED_PENDING_RIGHTS+
   counts.RIGHTS_CHECKED_PENDING_TEACHER;
 if(manifest.source_packages_received!==received)
   errors.push("RECEIVED_PACKAGES_COUNT_MISMATCH");
 const valid=errors.length===0;
 return {
  milestone:"M10-L35",valid,errors,counts,
  lessons_expected:44,source_packages_received:received,
  status:!valid?"HOLD_INVALID_METADATA":
   counts.QUARANTINED>0?"HOLD_SOURCE_QUARANTINE":
   counts.NOT_RECEIVED>0?"HOLD_SOURCE_INCOMPLETE":
   counts.STRUCTURE_SCANNED_PENDING_RIGHTS>0?"HOLD_RIGHTS_UNVERIFIED":
   "READY_FOR_INDEPENDENT_TEACHER_SOURCE_REVIEW",
  external_evidence_verified_by_tool:0,teacher_content_approved_by_tool:0,
  release_authorized:false,s7_unlock_authorized:false,
  production_changes_authorized:false,private_content_returned:false
 };
}

const tokens=s=>typeof s==="string"?
  (s.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu)??[]):[];
const chunks=(arr,n)=>new Set(Array.from({length:Math.max(0,arr.length-n+1)},
  (_,i)=>arr.slice(i,i+n).join(" ")));
const similarity=(a,b)=>{
 let shared=0;
 for(const x of a)if(b.has(x))shared++;
 return a.size+b.size?2*shared/(a.size+b.size):0;
};
const features=s=>{
 const words=tokens(s);
 return {length:words.length,terms:new Set(words),bigrams:chunks(words,2)};
};
const compareFeatures=(a,b)=>{
 if(a.length<8||b.length<8||Math.min(a.length,b.length)/Math.max(a.length,b.length)<0.72)
   return 0;
 const term=similarity(a.terms,b.terms);
 const ordered=similarity(a.bigrams,b.bigrams);
 return Math.round((0.52*term+0.48*ordered)*1000)/1000;
};
/** Lexical overlap ONLY, not semantic plagiarism or IELTS difficulty. */
export function l35LexicalOverlap(a,b){
 return compareFeatures(features(a),features(b));
}
function questions(record){
 const l=record?.pkg?.lesson,p=record?.pkg?.privateLesson,id=record?.lessonId;
 if(!ID_RE.test(id??"")||l?.lesson_id!==id)return [];
 const results=[];
 const push=(section,ref,s)=>{
  if(typeof s==="string"&&s.trim())
    results.push({lesson_id:id,ref,section,raw:s});
 };
 for(const q of l.guided??[])push("guided",q.activity_id,q.question_en);
 for(const section of ["independent","mastery"]){
  for(const [ref,q] of Object.entries(p?.[section]??{})){
   push(section,ref,q?.question_en);
   if(section==="mastery"){
    if(typeof q?.followup_en==="string")push("mastery_followup",ref+":F",q.followup_en);
    if(Array.isArray(q?.followups_en))q.followups_en.forEach((v,i)=>
      push("mastery_followup",ref+":F"+(i+1),v));
   }
  }
 }
 return results;
}
const safeRef=ref=>/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])-[GIM]\d{2}(?::F\d*)?$/.test(ref);

export function inspectL35LocalPackages(records,{threshold=0.77,maxPairs=80}={}){
 const base=auditL33BatchPackages(records);
 const failures=[],all=[];
 if(!Array.isArray(records)||records.length!==44)
  failures.push("SOURCE_44_PACKAGE_SET_INCOMPLETE");
 for(let i=0;i<(Array.isArray(records)?records.length:0);i++){
  const r=records[i],id=ID(i+1),p=r?.pkg;
  if(r?.lessonId!==id||!p||p?.lesson?.lesson_id!==id){
   failures.push("SOURCE_ID_MISMATCH:"+id);continue;
  }
  const required=["revision","hash","privateHash","lesson","privateLesson"];
  if(!REV.test(p.revision??"")||Object.keys(p).length!==5||
     required.some(key=>!Object.hasOwn(p,key)))
   failures.push("IMPORT_PACKAGE_ROOT_INVALID:"+id);
  if(!SHA.test(p.hash??"")||!SHA.test(p.privateHash??""))
   failures.push("SOURCE_HASH_NOT_PINNED:"+id);
  for(const q of questions(r))if(safeRef(q.ref))all.push(q);
 }
 if(!base.lesson_reports||base.lesson_reports.length!==44||
    base.errors.length||base.lessons_with_structure_flags)
   failures.push("L33_STRUCTURAL_GATE_NOT_CLEAN");
 // Precompute features once per prompt, rather than tokenizing private
 // questions repeatedly during hundreds of cross-lesson comparisons.
 const candidates=all.map(q=>({lesson_id:q.lesson_id,ref:q.ref,
   section:q.section,features:features(q.raw)}));
 const overlaps=[],pairCount={value:0};
 const seenPair=new Set();
 for(let i=0;i<candidates.length;i++){
  const a=candidates[i];
  for(let j=i+1;j<candidates.length;j++){
   const b=candidates[j];
   if(a.lesson_id===b.lesson_id)continue;
   const score=compareFeatures(a.features,b.features);
   if(score<threshold)continue;
   const aRef=a.ref,bRef=b.ref;
   const key=aRef+"|"+bRef;
   if(seenPair.has(key))continue;
   seenPair.add(key);pairCount.value++;
   // Never emit private words or hashes. Only owned deterministic IDs,
   // category, overlap score and an advisory manual-review marker.
   overlaps.push({lesson_a:a.lesson_id,activity_a:aRef,section_a:a.section,
     lesson_b:b.lesson_id,activity_b:bRef,section_b:b.section,
     lexical_overlap:score,action:"HUMAN_PROMPT_VARIETY_REVIEW"});
  }
 }
 overlaps.sort((a,b)=>b.lexical_overlap-a.lexical_overlap||
   a.lesson_a.localeCompare(b.lesson_a)||a.activity_a.localeCompare(b.activity_a));
 const structuralClean=failures.length===0;
 return {
  milestone:"M10-L35",inspection:"LOCAL_SOURCE_READ_ONLY",
  lessons_expected:44,lessons_examined:base.lessons_checked,
  source_root_schema_checked:records?.length??0,
  source_structure_issues:base.lessons_with_structure_flags,
  lexical_review_pairs_total:pairCount.value,
  lexical_review_pairs:overlaps.slice(0,Math.min(80,Math.max(0,maxPairs))),
  lexical_review_pairs_truncated:overlaps.length>maxPairs,
  errors:failures,
  status:!structuralClean?"HOLD_LOCAL_SOURCE_STRUCTURE":
    overlaps.length?"HOLD_LEXICAL_SIMILARITY_MANUAL_REVIEW":
    "READY_FOR_RIGHTS_AND_INDEPENDENT_TEACHER_REVIEW",
  // Not proof of ownership, authenticity, semantic uniqueness or band:
  source_rights_verified:false,private_content_returned:false,
  teacher_quality_certified:false,release_authorized:false,
  s7_unlock_authorized:false
 };
}

async function main(){
 const read=p=>JSON.parse(readFileSync(resolve(ROOT,p),"utf8"));
 const summary=auditL35IntakeManifest(
  read("tests/speaking-s6/m10-l35-source-intake.json"),
  read("tests/speaking-s6/m10-l33-teacher-review.json"),
  read("tests/speaking-s6/m10-l34-editorial-backlog.json")
 );
 let localInspection=null;
 const ix=process.argv.indexOf("--inspect-private-local-dir");
 if(ix!==-1){
  if(!process.argv[ix+1])throw Error("MISSING_PRIVATE_LOCAL_DIRECTORY");
  localInspection=inspectL35LocalPackages(readL33PrivateDirectory(process.argv[ix+1]));
 }
 console.log(JSON.stringify({milestone:"M10-L35",...summary,localInspection},null,2));
 if(!summary.valid||localInspection?.errors?.length||
    (process.argv.includes("--require-full-source-review")&&
      (summary.status!=="READY_FOR_INDEPENDENT_TEACHER_SOURCE_REVIEW"||
       localInspection?.status!=="READY_FOR_RIGHTS_AND_INDEPENDENT_TEACHER_REVIEW")))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L35 source intake HOLD; private source and file paths withheld");process.exitCode=2;});
}
