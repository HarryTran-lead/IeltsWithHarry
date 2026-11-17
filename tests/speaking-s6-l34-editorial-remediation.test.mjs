import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {L34_CODEBOOK,l34Round,auditL34Backlog,draftL34Remediation}
  from "../scripts/speaking-s6-l34-editorial-remediation.mjs";

const manifest=JSON.parse(readFileSync("tests/speaking-s6/m10-l34-editorial-backlog.json","utf8"));
const teacher=JSON.parse(readFileSync("tests/speaking-s6/m10-l33-teacher-review.json","utf8"));
const copy=x=>structuredClone(x);
const SHA="a".repeat(64);
function scanned(row,code,kind="STRUCTURE_FLAGGED"){
 row.scan_status=kind;row.source_revision="R11_L34_TEST";
 row.student_sha256=SHA;row.private_sha256=SHA;
 row.evidence="ev:restricted-store/structural-proof-001";
 row.finding_codes=code?[code]:[];
 row.disposition=kind==="STRUCTURE_FLAGGED"?"REMEDIATION_REQUIRED":
  kind==="STRUCTURE_PASSED"?"READY_FOR_TEACHER_REVIEW":"RETEST_REQUIRED";
 if(kind==="REVISION_PENDING_RESCAN"){
  row.change_author="Content author";
  row.proposed_new_revision="R11_L34_NEW";
 }
}
const validate=(m,t=teacher)=>auditL34Backlog(m,t);
describe("M10-L34 editorial backlog triage (synthetic metadata only)",()=>{
 it("retains all 44 lessons NOT_SCANNED without teacher scores or real source",()=>{
  const result=validate(manifest);
  expect(result).toMatchObject({
   valid:true,status:"HOLD_MISSING_SOURCE_COVERAGE",
   lesson_count:44,counts:{NOT_SCANNED:44,STRUCTURE_FLAGGED:0,
    STRUCTURE_PASSED:0,REVISION_PENDING_RESCAN:0},
   pending_teacher_reviews:44,human_lessons_approved_by_this_tool:0,
   release_authorized:false,s7_unlock_authorized:false,
   production_changes_authorized:false,private_content_returned:false
  });
 });
 it("assigns fixed four batches of 11 original lessons",()=>{
  for(const [i,batch] of [[1,"A"],[11,"A"],[12,"B"],[22,"B"],
    [23,"C"],[33,"C"],[34,"D"],[44,"D"]])
   expect(l34Round(i)).toBe(batch);
 });
 it("uses fixed priorities for private leaks, incomplete Mastery and missing EN/VI help",()=>{
  expect(L34_CODEBOOK.no_unseen_mastery_followup_in_student_payload.tier).toBe("P0");
  expect(L34_CODEBOOK.two_mastery_stubs_and_followups.tier).toBe("P1");
  expect(L34_CODEBOOK.guided_bilingual_feedback.tier).toBe("P2");
 });
 it("rejects a fake scanned status without pinned source and evidence",()=>{
  const m=copy(manifest);
  m.lessons[0].scan_status="STRUCTURE_PASSED";
  m.lessons[0].disposition="READY_FOR_TEACHER_REVIEW";
  m.real_source_packages_inspected=1;
  expect(validate(m).valid).toBe(false);
  expect(validate(m).errors).toContain("SOURCE_REVISION_OR_EVIDENCE_MISSING:S6-001");
 });
 it("flags private leak as P0 and stops remediation release",()=>{
  const m=copy(manifest);
  scanned(m.lessons[4],"no_unseen_mastery_followup_in_student_payload");
  m.real_source_packages_inspected=1;
  const r=validate(m);
  expect(r).toMatchObject({valid:true,status:"HOLD_MISSING_SOURCE_COVERAGE",
   priorities:{P0:1,P1:0,P2:0},human_lessons_approved_by_this_tool:0});
  expect(r.remediation_items[0]).toMatchObject({lesson_id:"S6-005",priority:"P0"});
  expect(JSON.stringify(r)).not.toContain("Mastery follow-up: secret text");
 });
 it("rejects a claimed clean scan that still contains findings",()=>{
  const m=copy(manifest);
  scanned(m.lessons[1],"guided_bilingual_feedback","STRUCTURE_PASSED");
  m.real_source_packages_inspected=1;
  expect(validate(m).errors).toContain("CLEAN_SCAN_HAS_FINDINGS_OR_UNAPPROVED_CHANGES:S6-002");
 });
 it("requires a genuinely new pinned revision and author before retest",()=>{
  const m=copy(manifest);
  scanned(m.lessons[15],"guided_model_bank","REVISION_PENDING_RESCAN");
  m.lessons[15].proposed_new_revision=m.lessons[15].source_revision;
  m.real_source_packages_inspected=1;
  expect(validate(m).errors).toContain("NO_PINNED_ADD_ONLY_REVISION_OR_AUTHOR:S6-016");
  m.lessons[15].proposed_new_revision="R11_L34_NEW";
  expect(validate(m).valid).toBe(true);
  expect(validate(m).status).toBe("HOLD_MISSING_SOURCE_COVERAGE");
 });
 it("blocks reported inspection counts not supported by lesson records",()=>{
  const m=copy(manifest);
  m.real_source_packages_inspected=44;
  expect(validate(m).errors).toContain("SOURCE_INSPECTION_COUNT_MISMATCH");
 });
 it("rejects unknown or duplicate finding codes, never accepts arbitrary prose",()=>{
  const m=copy(manifest);
  scanned(m.lessons[0],"guided_bilingual_feedback");
  m.lessons[0].finding_codes.push("PRIVATE_ACCESS_TOKEN=secret");
  m.real_source_packages_inspected=1;
  const result=validate(m);
  expect(result.errors).toContain("INVALID_OR_EMPTY_FINDING_CODES:S6-001");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_ACCESS_TOKEN");
 });
 it("produces a review-only status when 44 synthetic clean scans exist",()=>{
  const m=copy(manifest);
  for(const row of m.lessons)scanned(row,null,"STRUCTURE_PASSED");
  m.real_source_packages_inspected=44;
  const result=validate(m);
  expect(result).toMatchObject({valid:true,
   status:"READY_FOR_INDEPENDENT_TEACHER_REVIEW",
   human_lessons_approved_by_this_tool:0,release_authorized:false});
  expect(result.pending_teacher_reviews).toBe(44);
 });
 it("generates sorted remediation actions from synthetic L33 failures without showing content",()=>{
  const report={
   lessons_checked:44,status:"HOLD_CONTENT_STRUCTURE",
   exact_cross_lesson_duplicate_lesson_ids:["S6-015","S6-016"],
   lesson_reports:[
     {lesson_id:"S6-002",failed_check_codes:["guided_bilingual_feedback"]},
     {lesson_id:"S6-001",failed_check_codes:["no_unseen_independent_prompt_in_student_payload"]},
     {lesson_id:"S6-015",failed_check_codes:[]},
     {lesson_id:"S6-016",failed_check_codes:[]}
   ]
  };
  const result=draftL34Remediation(report);
  expect(result).toMatchObject({source:"LOCAL_L33_STRUCTURAL_SIGNALS_ONLY",
   lessons_inspected:44,independent_teacher_approval:false,release_authorized:false,
   private_content_returned:false});
  expect(result.remediation_items.map(x=>x.priority)).toEqual(["P0","P1","P1","P2"]);
  expect(result.remediation_items.map(x=>x.lesson_id)).toEqual([
   "S6-001","S6-015","S6-016","S6-002"
  ]);
  expect(JSON.stringify(result)).not.toContain("secret private teacher model");
 });
 it("refuses unscanned rows with fake hashes, teacher signature or source text",()=>{
  const m=copy(manifest);
  m.lessons[2].student_sha256=SHA;
  m.lessons[3].teacher_reviewer="Fake reviewer";
  const result=validate(m);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("UNSCANNED_ROW_HAS_FABRICATED_FINDINGS:S6-003");
  expect(result.errors).toContain("TEACHER_REVIEW_BELONGS_IN_L33_ONLY:S6-004");
 });
});
