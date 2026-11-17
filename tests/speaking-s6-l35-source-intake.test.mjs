import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {auditL35IntakeManifest,l35LexicalOverlap,inspectL35LocalPackages}
  from "../scripts/speaking-s6-l35-source-intake.mjs";

const intake=JSON.parse(readFileSync("tests/speaking-s6/m10-l35-source-intake.json","utf8"));
const teacher=JSON.parse(readFileSync("tests/speaking-s6/m10-l33-teacher-review.json","utf8"));
const backlog=JSON.parse(readFileSync("tests/speaking-s6/m10-l34-editorial-backlog.json","utf8"));
const clone=x=>structuredClone(x);
const DIGEST="c".repeat(64);
const proof="ev:restricted-proof/s6-local-intake";
const rightsProof="ev:restricted-proof/source-rights";
const now="2026-11-17T11:00:00.000Z";
const canonical=x=>{
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
};
const hash=x=>createHash("sha256").update(canonical(x),"utf8").digest("hex");
function synth(i){
 const id="S6-"+String(i).padStart(3,"0");
 const unique=["alpha","beta","gamma","delta","epsilon","zeta"].map(w=>w+i);
 const label=unique.join(" ");
 const guided=Array.from({length:4},(_,k)=>({
  activity_id:id+"-G"+String(k+1).padStart(2,"0"),
  question_en:"Describe how communities can use "+label+
    " to improve clear public speaking when plans change "+k+"?",
  model_ref:"server:model-"+k,
  hints:Array.from({length:3},(_,j)=>({level:j+1,
    text_vi:"Gợi ý trình bày ý riêng về ngữ cảnh "+j+" cho bài "+id}))
 }));
 const independent=Array.from({length:3},(_,k)=>({
  activity_id:id+"-I"+String(k+1).padStart(2,"0"),mode:"INDEPENDENT",
  prompt_ref:"server:independent-"+k,no_answer_key_on_student:true,
  followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const mastery=Array.from({length:2},(_,k)=>({
  activity_id:id+"-M"+String(k+1).padStart(2,"0"),mode:"MASTERY",
  prompt_ref:"server:mastery-"+k,no_answer_key_on_student:true,
  followup_delivery:"AFTER_INITIAL_SUBMISSION"
 }));
 const lesson={
  lesson_id:id,status:"STAGING_REVIEW_REQUIRED",publish_allowed:false,
  steps:Array.from({length:10},(_,j)=>({
   step:j+1,instruction_en:"Practise a different speaking skill in every lesson step.",
   instruction_vi:"Luyện tập kỹ năng nói theo từng bước bằng hướng dẫn cụ thể.",
   learning_content:{model:"Learner-facing example step "+j+" without private prompts"}
  })),
  guided,independent,mastery,
  spaced_review:[{day_offset:2},{day_offset:7},{day_offset:21}]
 };
 const privateLesson={
  guided:Object.fromEntries(guided.map((x,k)=>[x.activity_id,{
   question_en:x.question_en,
   model_answer_en:"I can support my reasoning with a specific example about "+label+" "+k,
   model_translation_vi:"Tôi có thể giải thích bằng ví dụ cụ thể về "+label+" "+k,
   teaching_explanation_en:"Explain one reason clearly before adding a concrete example.",
   teacher_reasoning_vi:"Trước tiên nêu lý do rõ ràng, sau đó bổ sung ví dụ thực tế."
  }])),
  independent:Object.fromEntries(independent.map((x,k)=>[x.activity_id,{
   question_en:"Why could "+label+" encourage a thoughtful approach "+
     "to independent speaking in a new community situation "+k+"?"
  }])),
  mastery:Object.fromEntries(mastery.map((x,k)=>[x.activity_id,{
   question_en:"How might "+label+" influence complex educational decisions "+
     "across different generations in modern cities "+k+"?",
   followup_en:"What alternative policy could change the outcome for "+
     label+" in the following decade "+k+"?"
  }]))
 };
 return {lessonId:id,pkg:{
  revision:"R11_L35_"+String(i).padStart(3,"0"),
  lesson,privateLesson,hash:hash(lesson),privateHash:hash(privateLesson)
 }};
}
const items=()=>Array.from({length:44},(_,i)=>synth(i+1));
const fill=(state="RIGHTS_CHECKED_PENDING_TEACHER")=>{
 const m=clone(intake),b=clone(backlog);
 for(let i=0;i<44;i++){
  const row=m.lessons[i],peer=b.lessons[i];
  row.intake_state=state;row.source_revision="R11_L35_"+String(i+1).padStart(3,"0");
  row.student_sha256=DIGEST;row.private_sha256=DIGEST;
  row.local_structural_evidence=proof;row.intake_reviewer="Intake reviewer";
  row.intake_at_utc=now;
  row.teacher_remediation_status="NOT_STARTED";
  if(state==="RIGHTS_CHECKED_PENDING_TEACHER"){
   row.source_rights_basis="ORIGINAL_AUTHOR";row.rights_evidence=rightsProof;
  }
  peer.scan_status="STRUCTURE_PASSED";peer.source_revision=row.source_revision;
  peer.student_sha256=DIGEST;peer.private_sha256=DIGEST;
  peer.evidence=proof;peer.disposition="READY_FOR_TEACHER_REVIEW";
 }
 m.source_packages_received=44;b.real_source_packages_inspected=44;
 return {m,b};
};

describe("M10-L35 secure local intake and lexical prefilter (only synthetic data)",()=>{
 it("keeps all 44 original lessons at NOT_RECEIVED and release HOLD",()=>{
  const r=auditL35IntakeManifest(intake,teacher,backlog);
  expect(r).toMatchObject({valid:true,status:"HOLD_SOURCE_INCOMPLETE",
   source_packages_received:0,lessons_expected:44,
   external_evidence_verified_by_tool:0,teacher_content_approved_by_tool:0,
   release_authorized:false,s7_unlock_authorized:false,
   counts:{NOT_RECEIVED:44,QUARANTINED:0,STRUCTURE_SCANNED_PENDING_RIGHTS:0,
    RIGHTS_CHECKED_PENDING_TEACHER:0}});
 });
 it("refuses a fictitious signed revision on a NOT_RECEIVED lesson",()=>{
  const m=clone(intake);m.lessons[0].student_sha256=DIGEST;
  expect(auditL35IntakeManifest(m,teacher,backlog).errors)
   .toContain("UNRECEIVED_SOURCE_HAS_FABRICATED_EVIDENCE:S6-001");
 });
 it("refuses a rights-checked row without an independently pinned L34 scan",()=>{
  const {m}=fill();
  const r=auditL35IntakeManifest(m,teacher,backlog);
  expect(r.valid).toBe(false);
  expect(r.errors).toContain("L34_SCANNED_REVISION_HASH_DRIFT:S6-001");
 });
 it("rejects missing license/rightsholder evidence even after all 44 scans",()=>{
  const {m,b}=fill();
  m.lessons[4].rights_evidence=null;
  expect(auditL35IntakeManifest(m,teacher,b).errors)
    .toContain("INDEPENDENT_SOURCE_RIGHTS_EVIDENCE_MISSING:S6-005");
 });
 it("full synthetic metadata can be ready for human review but never approves rights",()=>{
  const {m,b}=fill();
  const r=auditL35IntakeManifest(m,teacher,b);
  expect(r).toMatchObject({valid:true,
   status:"READY_FOR_INDEPENDENT_TEACHER_SOURCE_REVIEW",
   external_evidence_verified_by_tool:0,teacher_content_approved_by_tool:0,
   release_authorized:false,s7_unlock_authorized:false});
 });
 it("keeps structural scans at HOLD while author rights are unverified",()=>{
  const {m,b}=fill("STRUCTURE_SCANNED_PENDING_RIGHTS");
  const r=auditL35IntakeManifest(m,teacher,b);
  expect(r).toMatchObject({valid:true,status:"HOLD_RIGHTS_UNVERIFIED",
    counts:{STRUCTURE_SCANNED_PENDING_RIGHTS:44}});
 });
 it("quarantines unsafe source only with an issue code and restricted local evidence",()=>{
  const m=clone(intake);
  m.lessons[0].intake_state="QUARANTINED";
  m.lessons[0].intake_issue_codes=["HASH_MISMATCH"];
  m.lessons[0].local_structural_evidence=proof;
  m.lessons[0].intake_reviewer="Staging reviewer";
  m.lessons[0].intake_at_utc=now;
  m.source_packages_received=1;
  const r=auditL35IntakeManifest(m,teacher,backlog);
  expect(r).toMatchObject({valid:true,status:"HOLD_SOURCE_QUARANTINE"});
  m.lessons[0].intake_issue_codes=["not-an-issue:PRIVATE_TOKEN"];
  expect(auditL35IntakeManifest(m,teacher,backlog).valid).toBe(false);
 });
 it("refuses discrepancies in number of source packages actually received",()=>{
  const {m,b}=fill();
  m.source_packages_received=43;
  expect(auditL35IntakeManifest(m,teacher,b).errors)
   .toContain("RECEIVED_PACKAGES_COUNT_MISMATCH");
 });
 it("detects near-identical prompts but does not label them IELTS plagiarism",()=>{
  const a="How could public libraries improve learning opportunities for families who live in smaller communities today?";
  const b="How could public libraries improve learning opportunities for families who live in rural communities today?";
  const short="Where do you live?";
  expect(l35LexicalOverlap(a,b)).toBeGreaterThanOrEqual(.77);
  expect(l35LexicalOverlap(a,short)).toBe(0);
 });
 it("does not confuse unrelated long questions as near duplicates",()=>{
  const a="What policies might help city governments make public transport more affordable for commuters?";
  const b="How do local museums preserve historical memories through storytelling across different generations?";
  expect(l35LexicalOverlap(a,b)).toBeLessThan(.77);
 });
 it("inspects 44 signed synthetic local packages without certifying teacher quality",()=>{
  const report=inspectL35LocalPackages(items(),{maxPairs:3});
  expect(report).toMatchObject({lessons_expected:44,lessons_examined:44,
   source_rights_verified:false,teacher_quality_certified:false,
   release_authorized:false,s7_unlock_authorized:false,private_content_returned:false});
  expect(report.errors).toEqual([]);
  expect(report.lexical_review_pairs.length).toBeLessThanOrEqual(3);
  expect(JSON.stringify(report)).not.toContain("Why could alpha");
 });
 it("flags one deliberately similar private question using IDs only",()=>{
  const records=items();
  const source=records[0].pkg.privateLesson.independent["S6-001-I01"].question_en;
  const replacement=source.replace("thoughtful","careful");
  records[1].pkg.privateLesson.independent["S6-002-I01"].question_en=replacement;
  records[1].pkg.privateHash=hash(records[1].pkg.privateLesson);
  const report=inspectL35LocalPackages(records,{maxPairs:80});
  expect(report.lexical_review_pairs.some(x=>
   x.activity_a==="S6-001-I01"&&x.activity_b==="S6-002-I01")).toBe(true);
  expect(JSON.stringify(report)).not.toContain(replacement);
  expect(report.teacher_quality_certified).toBe(false);
 });
 it("holds when source revision is absent or package has additional root data",()=>{
  const records=items();
  records[7].pkg.revision="X";
  records[0].pkg.unsafe_extra="my-private-key";
  const report=inspectL35LocalPackages(records,{maxPairs:2});
  expect(report.errors).toContain("IMPORT_PACKAGE_ROOT_INVALID:S6-001");
  expect(report.errors).toContain("IMPORT_PACKAGE_ROOT_INVALID:S6-008");
  expect(JSON.stringify(report)).not.toContain("my-private-key");
 });
 it("fails closed when a signed private package hash does not match its bytes",()=>{
  const records=items();
  records[3].pkg.privateLesson.mastery["S6-004-M01"].followup_en=
   "Different hidden follow-up with much weaker reasoning.";
  const report=inspectL35LocalPackages(records,{maxPairs:2});
  expect(report.errors).toContain("L33_STRUCTURAL_GATE_NOT_CLEAN");
  expect(report.status).toBe("HOLD_LOCAL_SOURCE_STRUCTURE");
  expect(JSON.stringify(report)).not.toContain("Different hidden follow-up");
 });
 it("does not accept 43 synthetic source files as a complete 44-lesson intake",()=>{
  const report=inspectL35LocalPackages(items().slice(0,43),{maxPairs:2});
  expect(report.errors).toContain("SOURCE_44_PACKAGE_SET_INCOMPLETE");
  expect(report.status).toBe("HOLD_LOCAL_SOURCE_STRUCTURE");
 });
});
