import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {L33_DIMENSIONS} from "../scripts/speaking-s6-l33-teacher-review.mjs";
import {auditL36CorrectionManifest,compareL36PrivateRevisions}
 from "../scripts/speaking-s6-l36-correction-packaging.mjs";

const corrections=JSON.parse(readFileSync("tests/speaking-s6/m10-l36-correction-manifest.json","utf8"));
const source=JSON.parse(readFileSync("tests/speaking-s6/m10-l35-source-intake.json","utf8"));
const backlog=JSON.parse(readFileSync("tests/speaking-s6/m10-l34-editorial-backlog.json","utf8"));
const teacher=JSON.parse(readFileSync("tests/speaking-s6/m10-l33-teacher-review.json","utf8"));
const clone=x=>structuredClone(x);
const H0="a".repeat(64),H1="b".repeat(64),REF="ev:restricted-proof/s6-private-12345";
const at={intake:"2026-11-17T09:00:00.000Z",proposal:"2026-11-17T10:00:00.000Z",
 technical:"2026-11-17T11:00:00.000Z",teacher:"2026-11-17T12:00:00.000Z"};
function metadata(state="DRAFT_PREPARED"){
 const c=clone(corrections),s=clone(source),b=clone(backlog);
 const sr=s.lessons[0],br=b.lessons[0],r=c.lessons[0];
 Object.assign(sr,{intake_state:"RIGHTS_CHECKED_PENDING_TEACHER",
  source_revision:"R11_STABLE",student_sha256:H0,private_sha256:H0,
  source_rights_basis:"ORIGINAL_AUTHOR",rights_evidence:REF,
  local_structural_evidence:REF,intake_reviewer:"Source operator",
  intake_at_utc:at.intake});
 s.source_packages_received=1;
 Object.assign(br,{scan_status:"STRUCTURE_PASSED",source_revision:"R11_STABLE",
  student_sha256:H0,private_sha256:H0,evidence:REF,
  disposition:"READY_FOR_TEACHER_REVIEW"});
 b.real_source_packages_inspected=1;
 Object.assign(r,{state,source_revision:"R11_STABLE",
  source_student_sha256:H0,source_private_sha256:H0,
  target_revision:"R11_CORRECTED",target_student_sha256:H1,target_private_sha256:H0,
  reason_codes:["TEACHER_PEDAGOGY_GAP"],source_evidence:REF,
  proposal_evidence:"ev:restricted-proof/new-revision-56789",
  proposal_at_utc:at.proposal,change_author:"Lesson writer"});
 c.revisions_proposed=1;
 if(["TECHNICAL_REVIEWED","TEACHER_REVIEWED_PENDING_STAGING"].includes(state)){
  Object.assign(r,{first_reviewer:"Technical auditor",
   first_review_evidence:"ev:restricted-proof/tech-audit-56789",
   first_review_at_utc:at.technical});
 }
 if(state==="TEACHER_REVIEWED_PENDING_STAGING"){
  Object.assign(r,{independent_teacher:"Independent educator",
   teacher_review_evidence:"ev:restricted-proof/teacher-56789",
   teacher_review_at_utc:at.teacher,
   teacher_rubric:Object.fromEntries(Object.entries(L33_DIMENSIONS))});
 }
 return {c,s,b,t:clone(teacher)};
}
const scan=(fixture)=>auditL36CorrectionManifest(fixture.c,fixture.s,fixture.b,fixture.t);
const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const hash=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
function original(){
 const id="S6-001";
 const guided=Array.from({length:4},(_,i)=>({
  activity_id:id+"-G0"+(i+1),
  question_en:"What makes a good place for learning different subjects in your community "+i+"?",
  model_ref:"server:guided-model-"+i,
  hints:Array.from({length:3},(_,j)=>({level:j+1,
    text_vi:"Hãy triển khai một ý rõ ràng bằng ví dụ mức "+j}))
 }));
 const independent=Array.from({length:3},(_,i)=>({
  activity_id:id+"-I0"+(i+1),mode:"INDEPENDENT",
  prompt_ref:"server:independent-"+i,
  no_answer_key_on_student:true,followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const mastery=Array.from({length:2},(_,i)=>({
  activity_id:id+"-M0"+(i+1),mode:"MASTERY",
  prompt_ref:"server:mastery-"+i,
  no_answer_key_on_student:true,followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const lesson={lesson_id:id,status:"STAGING_REVIEW_REQUIRED",publish_allowed:false,
  steps:Array.from({length:10},(_,i)=>({step:i+1,
   instruction_en:"Use a reason and an example to develop a clear answer.",
   instruction_vi:"Giải thích lý do và ví dụ cụ thể trước khi tự luyện.",
   learning_content:{example_en:"The practice starts with an idea "+i}
  })),
  guided,independent,mastery,
  spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}]};
 const privateLesson={
  guided:Object.fromEntries(guided.map((g,i)=>[g.activity_id,{
   question_en:g.question_en,
   model_answer_en:"I can explain my ideas using a relevant example about "+i,
   model_translation_vi:"Tôi có thể giải thích ý bằng ví dụ phù hợp về "+i,
   teaching_explanation_en:"State a clear main idea followed by a reason.",
   teacher_reasoning_vi:"Nên nêu ý chính, giải thích lý do và dùng ví dụ."
  }])),
  independent:Object.fromEntries(independent.map((g,i)=>[g.activity_id,{
   question_en:"How could different families make independent learning more effective with limited resources "+i+"?"
  }])),
  mastery:Object.fromEntries(mastery.map((g,i)=>[g.activity_id,{
   question_en:"What should governments do when education policies affect disadvantaged communities over several decades "+i+"?",
   followup_en:"How might technological changes alter those educational priorities during the next generation "+i+"?"
  }]))
 };
 return {revision:"R11_STABLE",lesson,privateLesson,hash:hash(lesson),privateHash:hash(privateLesson)};
}
function revised(){
 const a=original();
 const b=clone(a);
 b.revision="R11_CORRECTED";
 b.privateLesson.guided["S6-001-G01"].model_answer_en=
   "I explain my main reason first, then use an authentic example from daily life.";
 b.privateHash=hash(b.privateLesson);
 return b;
}

describe("M10-L36 offline ADD-ONLY correction and independent-review gate",()=>{
 it("keeps 44/44 records NOT_REQUESTED and zero certified approvals",()=>{
  const r=auditL36CorrectionManifest(corrections,source,backlog,teacher);
  expect(r).toMatchObject({valid:true,status:"HOLD_NO_ORIGINAL_CORRECTION_PACKAGES",
   counts:{NOT_REQUESTED:44,DRAFT_PREPARED:0,TECHNICAL_REVIEWED:0,
    TEACHER_REVIEWED_PENDING_STAGING:0},
   human_signoffs_verified_by_tool:0,release_authorized:false,
   s7_unlock_authorized:false,private_content_returned:false});
 });
 it("refuses DRAFT without verified original rights/source provenance",()=>{
  const f=metadata();
  f.s.lessons[0].intake_state="NOT_RECEIVED";
  const r=scan(f);
  expect(r.valid).toBe(false);
  expect(r.errors).toContain("ORIGINAL_RIGHTS_AND_SOURCE_NOT_VERIFIED:S6-001");
 });
 it("accepts a well-shaped correction draft only as pending review",()=>{
  const r=scan(metadata());
  expect(r).toMatchObject({valid:true,status:"HOLD_INDEPENDENT_EDITORIAL_REVIEW",
    proposed_revision_count:1,release_authorized:false});
 });
 it("rejects the same revision ID and no changed content hashes",()=>{
  const f=metadata(),r=f.c.lessons[0];
  r.target_revision=r.source_revision;
  r.target_student_sha256=r.source_student_sha256;
  expect(scan(f).errors).toContain("ADD_ONLY_REVISION_AND_CONTENT_HASH_REQUIRED:S6-001");
 });
 it("rejects drift from immutable source hash or source proof",()=>{
  const f=metadata();f.c.lessons[0].source_private_sha256="f".repeat(64);
  expect(scan(f).errors).toContain("IMMUTABLE_SOURCE_HASH_OR_PROVENANCE_DRIFT:S6-001");
 });
 it("blocks fake author/technical proof on an unrevised lesson",()=>{
  const f=metadata();f.c.lessons[1].proposal_evidence=REF;
  expect(scan(f).errors).toContain("NO_CORRECTION_BUT_FAKE_SIGNOFF_OR_REVISION:S6-002");
 });
 it("enforces technical reviewer distinct from author, including case variants",()=>{
  const f=metadata("TECHNICAL_REVIEWED");
  f.c.lessons[0].first_reviewer="lesson writer";
  expect(scan(f).errors).toContain("TECHNICAL_REVIEW_MUST_BE_SEPARATE_FROM_AUTHOR:S6-001");
 });
 it("rejects technical signoff dated before author proposal",()=>{
  const f=metadata("TECHNICAL_REVIEWED");
  f.c.lessons[0].first_review_at_utc="2026-11-17T08:00:00.000Z";
  expect(scan(f).errors).toContain("TECHNICAL_REVIEW_MUST_BE_SEPARATE_FROM_AUTHOR:S6-001");
 });
 it("requires a different independent teacher and rubric >=90/100",()=>{
  const f=metadata("TEACHER_REVIEWED_PENDING_STAGING");
  expect(scan(f).status).toBe("READY_FOR_OPERATOR_STAGING_RETEST_NOT_RELEASE");
  expect(scan(f).release_authorized).toBe(false);
  f.c.lessons[0].independent_teacher="Technical auditor";
  expect(scan(f).errors).toContain("INDEPENDENT_TEACHER_REVIEW_NOT_SUPPORTED:S6-001");
  f.c.lessons[0].independent_teacher="Independent educator";
  f.c.lessons[0].teacher_rubric.privacy_and_accessibility=0;
  expect(scan(f).errors).toContain("INDEPENDENT_TEACHER_REVIEW_NOT_SUPPORTED:S6-001");
 });
 it("does not accept a purported staging retest without genuine E2E evidence",()=>{
  const f=metadata("TEACHER_REVIEWED_PENDING_STAGING");
  f.c.lessons[0].staging_retest_evidence=REF;
  expect(scan(f).errors).toContain("STAGING_RETEST_CANNOT_BE_PREAPPROVED:S6-001");
 });
 it("compares authentic signed source and modified private bank in-memory",()=>{
  const a=original(),b=revised(),before=hash(a);
  const r=compareL36PrivateRevisions(a,b);
  expect(r).toMatchObject({status:"READY_FOR_SEPARATE_HUMAN_REVIEWS",
   errors:[],lesson_id:"S6-001",actual_import_performed:false,
   source_original_unchanged:true,private_content_returned:false,
   release_authorized:false,s7_unlock_authorized:false,
   impact:{student_changed:false,private_bank_changed:true,guided_models_changed:1}});
  expect(hash(a)).toBe(before);
  expect(JSON.stringify(r)).not.toContain("I explain my main reason");
 });
 it("rejects rename-only revision as not an actual correction",()=>{
  const a=original(),b=clone(a);b.revision="R11_RENAME_ONLY";
  expect(compareL36PrivateRevisions(a,b).errors)
    .toContain("NO_CONTENT_CHANGE_ONLY_REVISION_RENAME");
 });
 it("rejects attempts to change original activity identities",()=>{
  const a=original(),b=revised();
  b.lesson.independent[0].activity_id="S6-001-I99";
  b.hash=hash(b.lesson);
  const r=compareL36PrivateRevisions(a,b);
  expect(r.errors).toContain("ACTIVITY_IDENTITY_DRIFT_INDEPENDENT");
  expect(r.status).toBe("HOLD_CORRECTION_PACKAGE");
 });
 it("rejects student payload containing secret Mastery answer fields",()=>{
  const a=original(),b=revised();
  b.lesson.steps[0].learning_content.model_answer_en="a private unseen Mastery explanation";
  b.hash=hash(b.lesson);
  const r=compareL36PrivateRevisions(a,b);
  expect(r.errors).toContain("REVISED_PACKAGE_STRUCTURAL_CHECKS_FAILED");
  expect(JSON.stringify(r)).not.toContain("a private unseen");
 });
 it("rejects changed private teacher content without a re-signed hash",()=>{
  const a=original(),b=revised();
  b.privateLesson.mastery["S6-001-M01"].followup_en=
   "A completely different hidden follow-up without a renewed checksum.";
  const r=compareL36PrivateRevisions(a,b);
  expect(r.errors).toContain("TARGET_SIGNED_CONTENT_HASH_INVALID");
  expect(JSON.stringify(r)).not.toContain("A completely different");
 });
});
