import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {auditL32DefectRegister,assessL32Triage,l32RiskTier}
  from "../scripts/speaking-s6-l32-defect-triage.mjs";

const baseline=JSON.parse(readFileSync("tests/speaking-s6/m10-l21-e2e-evidence.json","utf8"));
const addendum=JSON.parse(readFileSync("tests/speaking-s6/m10-l29-e2e-addendum.json","utf8"));
const device=JSON.parse(readFileSync("tests/speaking-s6/m10-l31-device-evidence.json","utf8"));
const defect=JSON.parse(readFileSync("tests/speaking-s6/m10-l32-defect-register.json","utf8"));
const clone=x=>structuredClone(x);
const SHA="a".repeat(40);
const TIME="2026-11-17T04:00:00.000Z";
function issue(caseId,details={}){
 return {
   id:"S6-DEF-001",case_id:caseId,severity:l32RiskTier(caseId),
   status:"OPEN",summary:"Private access denied unexpectedly",
   observation:"Observed a difference from expected security behavior",
   evidence:"ev:restricted-store/proof-12345",reporter:"QA reviewer",
   ...details
 };
}
function reportedFail(caseId="S6-E2E-09"){
 const original=clone(baseline),extra=clone(addendum),registry=clone(defect);
 const record=[...original.cases,...extra.cases].find(c=>c.id===caseId);
 record.status="FAIL";record.actual="Verified unexpected private access response";
 registry.issues=[issue(caseId)];
 return {original,extra,registry};
}
function goodPass(record){
 record.status="PASS";
 record.expected="Private data cannot be accessed";
 record.actual="Observed expected result on disposable staging";
 record.evidence="ev:restricted-store/pass-12345";
 record.reviewer="Independent tester";
 record.run_at_utc=TIME;
 record.environment_id="s6-disposable-stage-qa";
}

describe("M10-L32 offline release blocker and defect triage (synthetic fixtures)",()=>{
 it("classifies 50 NOT_RUN and 11 device NOT_RUN as HOLD, never a defect-free release",()=>{
   const report=assessL32Triage(baseline,addendum,device,defect);
   expect(report).toMatchObject({
     valid:true,status:"HOLD_NOT_TESTED",
     release_authorized:false,s7_unlock_authorized:false,
     cases_total_expected:50,
     observed_staging_e2e_certified_by_this_tool:0,
     declared_case_counts:{NOT_RUN:50,PASS:0,FAIL:0,BLOCKED:0},
     blockers:{device_not_executed:11,open_defects:0},
     defect_counts:{OPEN:0,IN_PROGRESS:0,FIXED_PENDING_RETEST:0,CLOSED_VERIFIED:0}
   });
 });
 it("assigns conservative fixed security and mobile priority tiers",()=>{
   expect(l32RiskTier("S6-E2E-09")).toBe("P0");
   expect(l32RiskTier("S6-E2E-47")).toBe("P0");
   expect(l32RiskTier("S6-E2E-42")).toBe("P1");
   expect(l32RiskTier("S6-E2E-30")).toBe("P2");
   expect(l32RiskTier("S6-E2E-51")).toBeNull();
 });
 it("rejects a declared FAIL without a matching defect record",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues=[];
   const report=assessL32Triage(original,extra,device,registry);
   expect(report.valid).toBe(false);
   expect(report.status).toBe("HOLD_EVIDENCE_CONFLICT");
   expect(report.reported_failures_missing_triage).toEqual(["S6-E2E-09"]);
 });
 it("records actual FAIL as a P0 blocker, without fabricating a fix or PASS",()=>{
   const {original,extra,registry}=reportedFail();
   const report=assessL32Triage(original,extra,device,registry);
   expect(report.valid).toBe(true);
   expect(report.status).toBe("HOLD_DEFECTS");
   expect(report.defect_counts.OPEN).toBe(1);
   expect(report.defect_priority_counts.P0).toBe(1);
   expect(report.release_authorized).toBe(false);
 });
 it("does not allow an OPEN defect when the related E2E case remains NOT_RUN",()=>{
   const registry=clone(defect);
   registry.issues=[issue("S6-E2E-09")];
   expect(auditL32DefectRegister(registry,baseline,addendum).valid).toBe(false);
 });
 it("prevents downgrading a private-bank leak from P0 to P2",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues[0].severity="P2";
   expect(auditL32DefectRegister(registry,original,extra).valid).toBe(false);
 });
 it("rejects duplicated incident IDs and case associations",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues.push({...issue("S6-E2E-09"),id:"S6-DEF-002"});
   const result=auditL32DefectRegister(registry,original,extra);
   expect(result.valid).toBe(false);
 });
 it("blocks FIXED_PENDING_RETEST when the live E2E result is still FAIL",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues[0].status="FIXED_PENDING_RETEST";
   const report=assessL32Triage(original,extra,device,registry);
   expect(report.status).toBe("HOLD_DEFECTS");
   expect(report.defect_counts.FIXED_PENDING_RETEST).toBe(1);
 });
 it("only allows CLOSED_VERIFIED with PASS, fix commit and independent retest",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues[0].status="CLOSED_VERIFIED";
   expect(auditL32DefectRegister(registry,original,extra).valid).toBe(false);
   goodPass(original.cases.find(c=>c.id==="S6-E2E-09"));
   Object.assign(registry.issues[0],{
     fix_commit:SHA,retest_evidence:"ev:restricted-store/retest-56789",
     retest_reviewer:"Independent retest assessor",retest_at_utc:TIME
   });
   const result=auditL32DefectRegister(registry,original,extra);
   expect(result.valid).toBe(true);
   registry.issues[0].retest_reviewer=registry.issues[0].reporter;
   expect(auditL32DefectRegister(registry,original,extra).valid).toBe(false);
 });
 it("blocks E2E device PASS when device report still says NOT_RUN",()=>{
   const original=clone(baseline);
   goodPass(original.cases.find(c=>c.id==="S6-E2E-28"));
   const report=assessL32Triage(original,addendum,device,defect);
   expect(report.status).toBe("HOLD_EVIDENCE_CONFLICT");
   expect(report.valid).toBe(false);
 });
 it("distinguishes BLOCKED environment from an observed software failure",()=>{
   const original=clone(baseline);
   const target=original.cases.find(c=>c.id==="S6-E2E-05");
   target.status="BLOCKED";target.actual="Disposable staging identity unavailable";
   const report=assessL32Triage(original,addendum,device,defect);
   expect(report.status).toBe("HOLD_BLOCKED_TESTS");
   expect(report.defect_counts.OPEN).toBe(0);
   expect(report.blockers.e2e_blocked).toBe(1);
 });
 it("never prints raw defect observations, JWTs or sensitive evidence paths",()=>{
   const {original,extra,registry}=reportedFail();
   registry.issues[0].observation="Bearer secret-credential-123456789";
   const report=assessL32Triage(original,extra,device,registry);
   expect(report.valid).toBe(false);
   const serialized=JSON.stringify(report);
   expect(serialized).not.toContain("secret-credential");
   expect(serialized).not.toContain(registry.issues[0].observation);
 });
});
