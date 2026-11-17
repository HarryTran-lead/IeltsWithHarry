#!/usr/bin/env node
/**
 * M10-L32: OFFLINE defect triage and 50-case release evidence reconciliation.
 * No API, secrets, audio, browser, migration, release-flag mutation or deployment.
 * Manifest claims are NOT independently authenticated or counted as certified E2E.
 */
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {auditManifest} from "./speaking-s6-l22-preflight.mjs";
import {auditL29Supplement,assessL29Readiness} from "./speaking-s6-l29-release-gate.mjs";
import {auditL31DeviceEvidence} from "./speaking-s6-l31-device-evidence.mjs";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const CASE=/^S6-E2E-(0[1-9]|[1-4]\d|50)$/;
const DEFECT=/^S6-DEF-\d{3}$/;
const SHA=/^[0-9a-f]{40}$/;
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const KINDS=new Set(["OPEN","IN_PROGRESS","FIXED_PENDING_RETEST","CLOSED_VERIFIED"]);
const RISK_P0=new Set([1,2,9,10,11,12,16,21,24,33,34,35,36,38,44,45,47,48,49,50]);
const RISK_P2=new Set([18,19,20,22,23,25,26,28,29,30,31,32]);
const PROHIBITED=/(https?:\/\/|Bearer\s|eyJ[A-Za-z0-9_-]{15,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|(?:password|secret|access[_-]?token)\s*[:=]|\b[\w.+-]+@[\w.-]+\.\w+\b)/i;
const note=x=>typeof x==="string"&&x.trim().length>=4&&x.length<=400&&!PROHIBITED.test(x);
const validRef=x=>typeof x==="string"&&REF.test(x);

export function l32RiskTier(caseId){
 if(!CASE.test(caseId??""))return null;
 const n=Number(caseId.slice(-2));
 return RISK_P0.has(n)?"P0":RISK_P2.has(n)?"P2":"P1";
}

export function auditL32DefectRegister(registry,baseline,addendum){
 const errors=[],counts={OPEN:0,IN_PROGRESS:0,FIXED_PENDING_RETEST:0,CLOSED_VERIFIED:0};
 const priorities={P0:0,P1:0,P2:0};
 const originals=[...(baseline?.cases??[]),...(addendum?.cases??[])];
 const indexed=new Map(originals.map(c=>[c.id,c]));
 const known=new Set(),byCase=new Map();
 if(registry?.milestone!=="M10-L32"||registry.production_untouched!==true||
    registry.expected_total_e2e_cases!==50)
   errors.push("Invalid defect register identity / production safety fields");
 if(!Array.isArray(registry?.issues))
   return {valid:false,errors:[...errors,"Missing defect issue list"],counts,priorities,
     untriaged_failures:[],open_cases:[],closed_cases:[]};
 if(registry.issues.length>50)errors.push("Unexpected defect register size");
 for(const issue of registry.issues){
   if(!DEFECT.test(issue?.id??"")||known.has(issue.id)){
     errors.push("Duplicate or invalid defect identifier");continue;
   }
   known.add(issue.id);
   const caseId=issue.case_id;
   const parent=indexed.get(caseId);
   if(!parent||!CASE.test(caseId)||byCase.has(caseId)){
     errors.push("Defect must link to one distinct real E2E case: "+issue.id);continue;
   }
   byCase.set(caseId,issue);
   if(!KINDS.has(issue.status)){
     errors.push("Invalid defect state: "+issue.id);continue;
   }
   counts[issue.status]++;
   const severity=l32RiskTier(caseId);
   if(issue.severity!==severity)errors.push("Risk-priority downgrading or mismatch: "+issue.id);
   else priorities[severity]++;
   if(!note(issue.summary)||!note(issue.observation)||!note(issue.reporter)||
     !validRef(issue.evidence))
     errors.push("Missing or unsafe redacted defect evidence: "+issue.id);
   if(issue.status==="CLOSED_VERIFIED"){
     if(parent.status!=="PASS"||!SHA.test(issue.fix_commit??"")||
       !validRef(issue.retest_evidence)||!note(issue.retest_reviewer)||
       issue.retest_reviewer===issue.reporter||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(issue.retest_at_utc??"")||
       Number.isNaN(Date.parse(issue.retest_at_utc))){
       errors.push("Defect closure lacks real PASS and independently reviewed retest: "+issue.id);
     }
   }else if(parent.status!=="FAIL"&&parent.status!=="BLOCKED"){
     errors.push("Open/pending defect must remain FAIL or BLOCKED in E2E manifest: "+issue.id);
   }
 }
 const untriaged_failures=originals.filter(c=>c.status==="FAIL"&&!byCase.has(c.id))
   .map(c=>c.id);
 if(untriaged_failures.length)errors.push("Observed FAIL records require a defect issue");
 const open_cases=[...byCase].filter(([,i])=>i.status!=="CLOSED_VERIFIED")
   .map(([id])=>id).sort();
 const closed_cases=[...byCase].filter(([,i])=>i.status==="CLOSED_VERIFIED")
   .map(([id])=>id).sort();
 return {valid:errors.length===0,errors,counts,priorities,
   untriaged_failures,open_cases,closed_cases,
   recorded_defects:registry.issues.length};
}

/** Offline metadata triage only: it never certifies any actual run or reviewer. */
export function assessL32Triage(baseline,addendum,device,registry,review={}){
 const original=auditManifest(baseline);
 const extra=auditL29Supplement(addendum);
 const mobile=auditL31DeviceEvidence(device,baseline,addendum);
 const incidents=auditL32DefectRegister(registry,baseline,addendum);
 const release=assessL29Readiness(baseline,addendum,review);
 const all=[...(baseline?.cases??[]),...(addendum?.cases??[])];
 const byState={NOT_RUN:[],PASS:[],FAIL:[],BLOCKED:[]};
 for(const c of all){
   if(Object.hasOwn(byState,c.status))byState[c.status].push(c.id);
 }
 const structuralErrors=[
   ...original.errors.map(x=>"baseline: "+x),
   ...extra.errors.map(x=>"addendum: "+x),
   ...mobile.errors.map(x=>"device: "+x),
   ...incidents.errors.map(x=>"defects: "+x)
 ];
 if(all.length!==50||new Set(all.map(c=>c.id)).size!==50)
   structuralErrors.push("50 unique E2E case IDs are required");
 if(registry?.issues?.some(x=>x.status!=="CLOSED_VERIFIED")&&byState.FAIL.length===0&&
    byState.BLOCKED.length===0)
   structuralErrors.push("Open defect is not backed by a failing/blocked E2E record");

 const missingHuman=release.blockers.filter(x=>
   /sign-?offs|independent human/i.test(x));
 const blockers={
   e2e_not_executed:byState.NOT_RUN.length,
   e2e_reported_failures:byState.FAIL.length,
   e2e_blocked:byState.BLOCKED.length,
   open_defects:incidents.open_cases.length,
   device_not_executed:mobile.counts.NOT_RUN,
   review_or_staging_evidence_missing:release.status!=="READY_FOR_INDEPENDENT_HUMAN_REVIEW",
   human_signoffs_missing:missingHuman.length>0
 };
 let status="HOLD_NOT_TESTED";
 if(structuralErrors.length)status="HOLD_EVIDENCE_CONFLICT";
 else if(blockers.e2e_reported_failures||blockers.open_defects)status="HOLD_DEFECTS";
 else if(blockers.e2e_blocked)status="HOLD_BLOCKED_TESTS";
 else if(blockers.e2e_not_executed||blockers.device_not_executed)status="HOLD_NOT_TESTED";
 else if(!mobile.metadata_reconciled||release.status!=="READY_FOR_INDEPENDENT_HUMAN_REVIEW")
   status="HOLD_INDEPENDENT_REVIEW";
 else status="READY_FOR_INDEPENDENT_HUMAN_REVIEW";
 const valid=structuralErrors.length===0;
 return {
   milestone:"M10-L32",status,valid,release_authorized:false,
   s7_unlock_authorized:false,production_changes_authorized:false,
   declared_case_counts:Object.fromEntries(Object.entries(byState).map(([k,v])=>[k,v.length])),
   cases_total_expected:50,
   device_cases_tracked:mobile.tracked_device_cases,
   device_case_counts:mobile.counts,
   observed_staging_e2e_certified_by_this_tool:0,
   defect_counts:incidents.counts,
   defect_priority_counts:incidents.priorities,
   reported_failures_missing_triage:incidents.untriaged_failures,
   reported_failed_case_ids:byState.FAIL,
   reported_blocked_case_ids:byState.BLOCKED,
   blockers,
   // NO actual notes, audio, private URLs, tokens or names in output.
   structural_errors:structuralErrors,
   evidence_metadata_unverified:true,
   next_action:valid?"MANUAL_ISOLATED_STAGING_TEST_AND_INDEPENDENT_REVIEW":
     "RECONCILE_INVALID_EVIDENCE_METADATA"
 };
}

async function main(){
 const read=path=>JSON.parse(readFileSync(resolve(ROOT,path),"utf8"));
 const baseline=read("tests/speaking-s6/m10-l21-e2e-evidence.json");
 const addendum=read("tests/speaking-s6/m10-l29-e2e-addendum.json");
 const device=read("tests/speaking-s6/m10-l31-device-evidence.json");
 const registry=read("tests/speaking-s6/m10-l32-defect-register.json");
 let review={};
 try{review=read("tests/speaking-s6/m10-l29-review-proof.json");}
 catch{/* optional, intentionally absent until approved proof exists */}
 const report=assessL32Triage(baseline,addendum,device,registry,review);
 console.log(JSON.stringify(report,null,2));
 if(!report.valid||
   (process.argv.includes("--require-reviewable")&&
     report.status!=="READY_FOR_INDEPENDENT_HUMAN_REVIEW"))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L32 offline evidence triage blocked");process.exitCode=2;});
}
