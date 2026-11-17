#!/usr/bin/env node
/**
 * M10-L29: offline, NO NETWORK, fail-closed release-evidence review.
 * This script NEVER publishes lessons, runs migrations, accesses Supabase,
 * turns gates on, or unlocks S7. Even a fully populated record only qualifies
 * for INDEPENDENT HUMAN REVIEW, not automatic release authorization.
 */
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {auditManifest} from "./speaking-s6-l22-preflight.mjs";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const SHA=/^[0-9a-f]{40}$/;
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const SUPPLEMENT_COUNTS={
 "Quota & anti-harvesting":4,"CSRF & API":1,
 "Consent & audio":4,"Race & deletion":3
};
const SIGNOFFS=["s5","teacher","audio","privacy","import"];
const present=s=>typeof s==="string"&&s.trim().length>0;
function safeEvidenceRef(s){return present(s)&&REF.test(s);}

export function auditL29Supplement(doc){
 const errors=[],counts={NOT_RUN:0,PASS:0,FAIL:0,BLOCKED:0};
 if(!Array.isArray(doc?.cases))return {valid:false,errors:["Missing addendum cases"],counts,ready:false};
 if(doc.cases.length!==12)errors.push("Supplement must contain 12 cases");
 const areas=Object.fromEntries(Object.keys(SUPPLEMENT_COUNTS).map(k=>[k,0]));
 for(let i=0;i<doc.cases.length;i++){
   const c=doc.cases[i],id="S6-E2E-"+String(i+39).padStart(2,"0");
   if(c?.id!==id)errors.push("Wrong supplementary ID at "+i);
   if(!Object.hasOwn(counts,c?.status)){errors.push("Invalid status "+id);continue;}
   counts[c.status]++;
   if(!Object.hasOwn(areas,c.area)){errors.push("Unexpected area "+id);}else areas[c.area]++;
   if(!present(c.scenario))errors.push("Scenario missing for "+id);
   if(c.status==="PASS"){
     for(const f of ["expected","actual","evidence","environment_id","reviewer","run_at_utc"]){
       if(!present(c[f]))errors.push("PASS lacks "+f+": "+id);
     }
     if(!safeEvidenceRef(c.evidence))errors.push("PASS requires redacted ev: evidence reference: "+id);
     if(!present(c.run_at_utc)||Number.isNaN(Date.parse(c.run_at_utc)))
       errors.push("PASS time invalid: "+id);
   }
   if((c.status==="FAIL"||c.status==="BLOCKED")&&!present(c.actual))
     errors.push(c.status+" requires actual explanation: "+id);
 }
 for(const [name,count] of Object.entries(SUPPLEMENT_COUNTS))
   if(areas[name]!==count)errors.push("Unexpected supplement group count: "+name);
 return {valid:errors.length===0,errors,counts,
   ready:errors.length===0&&counts.PASS===12};
}

function validCI(ci){
 if(!ci||!SHA.test(ci.commit_sha??"")||ci.conclusion!=="success")return false;
 if(typeof ci.run_url!=="string")return false;
 try{
   const u=new URL(ci.run_url);
   return u.protocol==="https:" && u.hostname==="github.com" &&
     /^\/HarryTran-lead\/IeltsWithHarry\/actions\/runs\/[0-9]+\/?$/.test(u.pathname)
     && !u.search && !u.hash && !u.username && !u.password;
 }catch{return false;}
}
function validStaging(stage){
 return stage?.kind==="disposable_supabase" && present(stage.environment_id)
   && stage.not_production===true
   && stage.migrations_l14_to_l28_verified===true
   && stage.cleanup?.attempts_zero===true
   && stage.cleanup?.audio_objects_zero===true
   && stage.cleanup?.test_accounts_removed===true
   && SIGNOFFS.every(x=>stage.cleanup?.release_gates?.[x]===false);
}
export function assessL29Readiness(baseline,supplement,review={}){
 const original=auditManifest(baseline);
 const extra=auditL29Supplement(supplement);
 const baselineAll=original.valid&&original.counts?.PASS===38;
 const supplementAll=extra.valid&&extra.counts.PASS===12;
 const all=[...(baseline?.cases??[]),...(supplement?.cases??[])];
 const reviewers=SIGNOFFS.every(k=>{
   const approval=baseline?.signoffs?.[k];
   return approval?.approved===true&&present(approval.reviewer)&&safeEvidenceRef(approval.evidence);
 });
 const git=SHA.test(review?.candidate_sha??"")&&validCI(review?.ci)
   && review.candidate_sha===review.ci.commit_sha;
 const staging=validStaging(review?.staging);
 const evidence=all.length===50&&all.every(c=>c.status==="PASS"
   &&safeEvidenceRef(c.evidence) &&present(c.expected)&&present(c.actual)
   &&present(c.reviewer)&&present(c.run_at_utc)
   &&!Number.isNaN(Date.parse(c.run_at_utc))
   && c.environment_id===review?.staging?.environment_id);
 const unlocked=baseline?.s7_locked!==true ||
   baseline?.release_status!=="REVIEWED_FOR_RELEASE" ||
   review?.production_untouched!==true;
 const blockers=[];
 if(!original.valid)blockers.push("Original 38-case manifest is structurally invalid");
 if(!extra.valid)blockers.push("Supplementary 12-case manifest is structurally invalid");
 if(!baselineAll)blockers.push("Original 38 real staging tests lack verified PASS evidence");
 if(!supplementAll)blockers.push("12 additional L25-L28 real staging tests lack verified PASS evidence");
 if(!reviewers)blockers.push("Five independent human sign-offs with evidence are missing");
 if(!git)blockers.push("Successful CI evidence tied to the exact candidate commit is missing");
 if(!staging)blockers.push("Disposable Supabase environment, migrations or cleanup proof is incomplete");
 if(!evidence)blockers.push("50 cases need redacted evidence tied to one disposable staging environment");
 if(unlocked)blockers.push("S7 must remain locked; production untouched; release review incomplete");
 const reviewable=blockers.length===0;
 return {
   milestone:"M10-L29",status:reviewable?"READY_FOR_INDEPENDENT_HUMAN_REVIEW":"HOLD",
   release_authorized:false,s7_unlock_authorized:false,
   reported_pass_entries_unverified:(original.counts?.PASS??0)+extra.counts.PASS,
   expected_real_e2e_cases:50,
   baseline_counts:original.counts,addendum_counts:extra.counts,
   blockers,
   manifest_errors:[...(original.errors??[]),...extra.errors]
 };
}
async function main(){
 const baseline=JSON.parse(readFileSync(resolve(ROOT,
  "tests/speaking-s6/m10-l21-e2e-evidence.json"),"utf8"));
 const supplement=JSON.parse(readFileSync(resolve(ROOT,
  "tests/speaking-s6/m10-l29-e2e-addendum.json"),"utf8"));
 const path=resolve(ROOT,"tests/speaking-s6/m10-l29-review-proof.json");
 let review={};
 try{review=JSON.parse(readFileSync(path,"utf8"));}catch{/* proof intentionally absent by default */}
 const status=assessL29Readiness(baseline,supplement,review);
 console.log(JSON.stringify(status,null,2));
 if(status.manifest_errors.length>0
   ||(process.argv.includes("--require-reviewable")&&status.status!=="READY_FOR_INDEPENDENT_HUMAN_REVIEW"))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L29 evidence gate unavailable");process.exitCode=2;});
}
