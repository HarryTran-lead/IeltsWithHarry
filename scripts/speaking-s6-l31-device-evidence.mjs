#!/usr/bin/env node
/**
 * M10-L31: OFFLINE, READ-ONLY redacted device-evidence reconciliation.
 * No browser automation, microphone, network, Supabase, audio, secrets, files
 * outside the committed QA manifests, database writes or release actions.
 * Reported PASS metadata never proves that a device test actually ran.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MOBILE=[
 ["S6-E2E-28","IOS_RECORD_PLAYBACK"],
 ["S6-E2E-29","ANDROID_RECORD_PLAYBACK"],
 ["S6-E2E-30","MIC_PERMISSION_DENIAL"],
 ["S6-E2E-31","STALE_RECORDER_CALLBACK"],
 ["S6-E2E-32","REFRESH_NO_LOCAL_BLOB"],
 ["S6-E2E-33","CONSENTED_OWNER_UPLOAD"],
 ["S6-E2E-34","NO_CONSENT_NO_STORAGE"],
 ["S6-E2E-44","NO_CONSENT_EVIDENCE"],
 ["S6-E2E-45","STORED_AUDIO_HASH"],
 ["S6-E2E-46","INVALID_UPLOAD_REJECTION"],
 ["S6-E2E-47","STORAGE_RLS_DENIAL"]
];
const REF=/^ev:[A-Za-z0-9/_-]{5,100}$/;
const ALIAS=/^[A-Za-z0-9_-]{5,64}$/;
const SHA=/^[0-9a-f]{40}$/;
const VERSION=/^\d{1,3}(?:\.\d{1,4}){0,3}$/;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MIME=new Set(["audio/webm","audio/mp4","audio/ogg"]);
const STATUS=new Set(["NOT_RUN","PASS","FAIL","BLOCKED"]);
const hasText=x=>typeof x==="string"&&x.trim().length>0;
const cleanNote=x=>hasText(x)&&x.length<=400&&!/(https?:\/\/|Bearer\s|eyJ[A-Za-z0-9_-]{15,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\btoken\b\s*[:=])/i.test(x);
const DETAIL_FIELDS={
 IOS_RECORD_PLAYBACK:["recording_ok","playback_ok","upload_ok","consent","duration_seconds","media_mime"],
 ANDROID_RECORD_PLAYBACK:["recording_ok","playback_ok","upload_ok","consent","duration_seconds","media_mime"],
 MIC_PERMISSION_DENIAL:["permission_denied","phantom_blob","recoverable_ui"],
 STALE_RECORDER_CALLBACK:["late_callback_ignored","take_replaced"],
 REFRESH_NO_LOCAL_BLOB:["old_blob_restored","re_record_required"],
 CONSENTED_OWNER_UPLOAD:["consent","owner_path_verified","server_object_present"],
 NO_CONSENT_NO_STORAGE:["consent","server_object_present"],
 NO_CONSENT_EVIDENCE:["consent","server_object_present","audio_evidence"],
 STORED_AUDIO_HASH:["consent","server_object_present","audio_evidence","sha256_matches","mime_matches","size_matches"],
 INVALID_UPLOAD_REJECTION:["attempt_not_submitted","private_errors_not_leaked","invalid_variants"],
 STORAGE_RLS_DENIAL:["direct_delete_denied","direct_update_denied","cross_account_read_denied"]
};
function detailsValid(check,d){
 if(!d||typeof d!=="object"||Array.isArray(d))return false;
 // No raw audio, transcript, UUID, Storage URL or arbitrary opaque data
 // may be hidden in extra keys inside the public redacted QA manifest.
 const allowed=DETAIL_FIELDS[check];
 if(!allowed||Object.keys(d).some(key=>!allowed.includes(key)))return false;
 switch(check){
  case "IOS_RECORD_PLAYBACK":
  case "ANDROID_RECORD_PLAYBACK":
   return d.recording_ok===true&&d.playback_ok===true&&d.upload_ok===true
     &&d.consent===true&&MIME.has(d.media_mime)
     &&typeof d.duration_seconds==="number"&&d.duration_seconds>=1
     &&d.duration_seconds<=180;
  case "MIC_PERMISSION_DENIAL":
   return d.permission_denied===true&&d.phantom_blob===false&&d.recoverable_ui===true;
  case "STALE_RECORDER_CALLBACK":
   return d.late_callback_ignored===true&&d.take_replaced===false;
  case "REFRESH_NO_LOCAL_BLOB":
   return d.old_blob_restored===false&&d.re_record_required===true;
  case "CONSENTED_OWNER_UPLOAD":
   return d.consent===true&&d.owner_path_verified===true&&d.server_object_present===true;
  case "NO_CONSENT_NO_STORAGE":
   return d.consent===false&&d.server_object_present===false;
  case "NO_CONSENT_EVIDENCE":
   return d.consent===false&&d.audio_evidence==="not_stored"
     &&d.server_object_present===false;
  case "STORED_AUDIO_HASH":
   return d.consent===true&&d.audio_evidence==="stored_hash_recorded"
     &&d.sha256_matches===true&&d.mime_matches===true&&d.size_matches===true
     &&d.server_object_present===true;
  case "INVALID_UPLOAD_REJECTION":
   return d.attempt_not_submitted===true&&d.private_errors_not_leaked===true
     &&Array.isArray(d.invalid_variants)
     &&["missing","corrupt_header","mime_mismatch","duplicate"].every(x=>d.invalid_variants.includes(x));
  case "STORAGE_RLS_DENIAL":
   return d.direct_delete_denied===true&&d.direct_update_denied===true
     &&d.cross_account_read_denied===true;
  default:return false;
 }
}

export function auditL31DeviceEvidence(doc,original,addendum){
 const errors=[],counts={NOT_RUN:0,PASS:0,FAIL:0,BLOCKED:0};
 if(!Array.isArray(doc?.cases))return {valid:false,errors:["Missing device cases"],counts,metadata_reconciled:false};
 if(doc.milestone!=="M10-L31")errors.push("Unexpected milestone");
 if(doc.cases.length!==MOBILE.length)errors.push("Expected exactly 11 tracked device cases");
 const all=[...(original?.cases??[]),...(addendum?.cases??[])];
 const lookup=new Map(all.map(x=>[x.id,x]));
 let matched=0;
 for(let i=0;i<doc.cases.length;i++){
  const c=doc.cases[i],expected=MOBILE[i];
  if(!expected||c?.id!==expected[0]||c?.check!==expected[1]){
   errors.push("Unexpected or duplicate device-case identity at index "+i);continue;
  }
  if(!STATUS.has(c.status)){errors.push("Invalid device status "+c.id);continue;}
  counts[c.status]++;
  const linked=lookup.get(c.id);
  if(!linked){errors.push("Missing E2E manifest case "+c.id);continue;}
  if(c.status==="PASS"){
   if(c.platform!=="ios"&&c.platform!=="android")
     errors.push("Invalid mobile platform "+c.id);
   if(c.browser!==(c.platform==="ios"?"Safari":"Chrome"))
     errors.push("Browser/platform mismatch "+c.id);
   if(c.device_kind!=="phone"&&c.device_kind!=="tablet")
     errors.push("Missing mobile device class "+c.id);
   if(!VERSION.test(c.os_version??"")||!VERSION.test(c.browser_version??""))
     errors.push("Missing exact OS or browser version "+c.id);
   if(c.id==="S6-E2E-28"&&c.platform!=="ios")
     errors.push("iOS Safari was not actually used "+c.id);
   if(c.id==="S6-E2E-29"&&c.platform!=="android")
     errors.push("Android Chrome was not actually used "+c.id);
   if(!cleanNote(c.expected)||!cleanNote(c.actual))
     errors.push("Missing/sensitive expected or actual observation "+c.id);
   if(!REF.test(c.evidence??"")||!cleanNote(c.reviewer)||
      !TIME.test(c.run_at_utc??"")||Number.isNaN(Date.parse(c.run_at_utc)))
     errors.push("Missing or unsafe redacted proof metadata "+c.id);
   if(!detailsValid(c.check,c.details))
     errors.push("Specific device assertions missing "+c.id);
   if(linked.status==="PASS" && linked.evidence===c.evidence &&
      linked.environment_id===doc.environment_id &&
      linked.reviewer===c.reviewer && linked.run_at_utc===c.run_at_utc)matched++;
   else errors.push("Real E2E manifest evidence not independently reconciled "+c.id);
  }else if(linked.status==="PASS"){
   errors.push("E2E manifest claims PASS without device evidence "+c.id);
  }else if(c.status==="FAIL"||c.status==="BLOCKED"){
   if(!cleanNote(c.actual))errors.push("Failure or blocker missing safe observation "+c.id);
  }
 }
 const anyPass=counts.PASS>0;
 if(anyPass&&(!ALIAS.test(doc.environment_id??"")||!SHA.test(doc.candidate_sha??"")))
   errors.push("Device PASS requires a non-secret staging alias and exact Git SHA");
 if(anyPass&&(doc.environment_id=== "production"||doc.environment_id?.startsWith("prod-")))
   errors.push("Production test provenance is forbidden");
 const complete=errors.length===0&&counts.PASS===MOBILE.length&&matched===MOBILE.length;
 return {
  valid:errors.length===0,
  counts,
  metadata_reconciled:complete,
  matched_with_e2e_manifest:matched,
  tracked_device_cases:MOBILE.length,
  status:complete?"READY_FOR_INDEPENDENT_DEVICE_EVIDENCE_REVIEW":"HOLD",
  // The reporter does not authenticate reviewers or proof objects.
  device_tests_certified:0,release_authorized:false,s7_unlock_authorized:false,
  errors
 };
}

async function main(){
 const read=p=>JSON.parse(readFileSync(resolve(ROOT,p),"utf8"));
 const report=auditL31DeviceEvidence(
  read("tests/speaking-s6/m10-l31-device-evidence.json"),
  read("tests/speaking-s6/m10-l21-e2e-evidence.json"),
  read("tests/speaking-s6/m10-l29-e2e-addendum.json")
 );
 // Never print individual recorded observations or credentials.
 console.log(JSON.stringify({milestone:"M10-L31",...report},null,2));
 if(!report.valid||(process.argv.includes("--require-device-evidence")&&!report.metadata_reconciled))
   process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("M10-L31 device evidence unavailable");process.exitCode=2;});
}
