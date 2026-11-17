import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {auditL31DeviceEvidence} from "../scripts/speaking-s6-l31-device-evidence.mjs";

const original=JSON.parse(readFileSync("tests/speaking-s6/m10-l21-e2e-evidence.json","utf8"));
const extra=JSON.parse(readFileSync("tests/speaking-s6/m10-l29-e2e-addendum.json","utf8"));
const device=JSON.parse(readFileSync("tests/speaking-s6/m10-l31-device-evidence.json","utf8"));
const copy=x=>structuredClone(x);
function details(check){
 switch(check){
  case "IOS_RECORD_PLAYBACK":case "ANDROID_RECORD_PLAYBACK":
   return {recording_ok:true,playback_ok:true,upload_ok:true,consent:true,
     duration_seconds:23,media_mime:"audio/mp4"};
  case "MIC_PERMISSION_DENIAL":
   return {permission_denied:true,phantom_blob:false,recoverable_ui:true};
  case "STALE_RECORDER_CALLBACK":
   return {late_callback_ignored:true,take_replaced:false};
  case "REFRESH_NO_LOCAL_BLOB":
   return {old_blob_restored:false,re_record_required:true};
  case "CONSENTED_OWNER_UPLOAD":
   return {consent:true,owner_path_verified:true,server_object_present:true};
  case "NO_CONSENT_NO_STORAGE":
   return {consent:false,server_object_present:false};
  case "NO_CONSENT_EVIDENCE":
   return {consent:false,server_object_present:false,audio_evidence:"not_stored"};
  case "STORED_AUDIO_HASH":
   return {consent:true,server_object_present:true,
     audio_evidence:"stored_hash_recorded",sha256_matches:true,mime_matches:true,size_matches:true};
  case "INVALID_UPLOAD_REJECTION":
   return {attempt_not_submitted:true,private_errors_not_leaked:true,
     invalid_variants:["missing","corrupt_header","mime_mismatch","duplicate"]};
  case "STORAGE_RLS_DENIAL":
   return {direct_delete_denied:true,direct_update_denied:true,cross_account_read_denied:true};
  default:throw Error("Unexpected fixture");
 }
}
function simulatedReports(){
 const d=copy(device),a=copy(original),b=copy(extra);
 d.environment_id="s6-disposable-qa-1";
 d.candidate_sha="a".repeat(40);
 d.execution_status="RECORDED_PENDING_INDEPENDENT_REVIEW";
 const all=[...a.cases,...b.cases];
 for(const record of d.cases){
   const linked=all.find(x=>x.id===record.id);
   const ios=record.id==="S6-E2E-28";
   record.status="PASS";record.platform=ios?"ios":"android";
   record.browser=ios?"Safari":"Chrome";record.device_kind="phone";
   record.os_version=ios?"26.0":"16.0";
   record.browser_version=ios?"26.0":"133.0.0.0";
   record.expected="Tested owner isolation and device behavior";
   record.actual="Observed expected behavior using controlled synthetic test audio";
   record.run_at_utc="2026-11-17T04:00:00.000Z";
   record.reviewer="Independent staging QA reviewer";
   record.evidence="ev:restricted-store/"+record.id;
   record.details=details(record.check);
   linked.status="PASS";linked.evidence=record.evidence;
   linked.expected=record.expected;linked.actual=record.actual;
   linked.environment_id=d.environment_id;
   linked.reviewer=record.reviewer;linked.run_at_utc=record.run_at_utc;
 }
 return {d,a,b};
}

describe("M10-L31 device acceptance reports (synthetic fixtures only)",()=>{
 it("keeps current 11 cases at NOT_RUN, 0 certified and release HOLD",()=>{
   const result=auditL31DeviceEvidence(device,original,extra);
   expect(result).toMatchObject({valid:true,status:"HOLD",
     tracked_device_cases:11,matched_with_e2e_manifest:0,
     counts:{NOT_RUN:11,PASS:0,FAIL:0,BLOCKED:0},
     device_tests_certified:0,release_authorized:false,s7_unlock_authorized:false});
 });
 it("rejects missing/duplicated device IDs",()=>{
   const {d,a,b}=simulatedReports();
   d.cases[1].id=d.cases[0].id;
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("rejects claiming iOS Safari was tested on Android Chrome",()=>{
   const {d,a,b}=simulatedReports();
   d.cases[0].platform="android";d.cases[0].browser="Chrome";
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("rejects an invalid contentless permission-denial observation",()=>{
   const {d,a,b}=simulatedReports();
   d.cases[2].details.phantom_blob=true;
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("rejects audio hash PASS without independent byte/size match",()=>{
   const {d,a,b}=simulatedReports();
   d.cases.find(c=>c.id==="S6-E2E-45").details.sha256_matches=false;
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("requires every invalid-upload negative case, not one success only",()=>{
   const {d,a,b}=simulatedReports();
   d.cases.find(c=>c.id==="S6-E2E-46").details.invalid_variants=["missing"];
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("does not accept raw URLs, tokens or personal IDs as evidence references",()=>{
   const {d,a,b}=simulatedReports();
   d.cases[0].evidence="https://files.example.com/private?token=leaked";
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
   d.cases[0].evidence="ev:restricted-store/S6-E2E-28";
   d.cases[0].actual="Bearer secret-data from JWT";
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("blocks device report PASS if the original E2E case is still NOT_RUN",()=>{
   const {d,a,b}=simulatedReports();
   a.cases.find(c=>c.id==="S6-E2E-29").status="NOT_RUN";
   const report=auditL31DeviceEvidence(d,a,b);
   expect(report.status).toBe("HOLD");
   expect(report.errors.some(s=>s.includes("S6-E2E-29"))).toBe(true);
 });
 it("does not accept conflicting proof timestamps or staging alias",()=>{
   const {d,a,b}=simulatedReports();
   b.cases.find(c=>c.id==="S6-E2E-45").run_at_utc="2026-11-17T04:01:00.000Z";
   expect(auditL31DeviceEvidence(d,a,b).valid).toBe(false);
 });
 it("a completely populated *synthetic* example is only reviewable, never authorized",()=>{
   const {d,a,b}=simulatedReports();
   const result=auditL31DeviceEvidence(d,a,b);
   expect(result).toMatchObject({
     status:"READY_FOR_INDEPENDENT_DEVICE_EVIDENCE_REVIEW",
     metadata_reconciled:true,matched_with_e2e_manifest:11,
     device_tests_certified:0,release_authorized:false,s7_unlock_authorized:false
   });
   // No test code ever updates the repository's actual NOT_RUN files.
   expect(device.cases.every(c=>c.status==="NOT_RUN")).toBe(true);
 });
});
