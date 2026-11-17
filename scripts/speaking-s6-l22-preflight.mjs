#!/usr/bin/env node
/**
 * M10-L22 Speaking S6: no-secret offline QA preflight + optional READ-ONLY
 * anon Supabase REST probes for an explicitly approved disposable staging host.
 * Never grants access, applies migrations, submits answers or writes to Storage.
 */
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST=resolve(ROOT,"tests/speaking-s6/m10-l21-e2e-evidence.json");
export const CASE_COUNT=38;
export const STATUS_VALUES=new Set(["NOT_RUN","PASS","FAIL","BLOCKED"]);
const GROUP_TOTALS={"Release & access":12,"ADD-ONLY import":5,"Lesson/session":10,
  "Real recording & consent":7,"Deletion, privacy, cleanup":4};
const SIGNOFFS=["s5","teacher","audio","privacy","import"];

function filled(x){return typeof x==="string" && x.trim().length>0;}
export function auditManifest(manifest){
  const errors=[];
  if(!manifest || !Array.isArray(manifest.cases)){
    return {valid:false,errors:["Missing cases array"],total:0,counts:{},ready:false};
  }
  const counts={NOT_RUN:0,PASS:0,FAIL:0,BLOCKED:0};
  const groups=Object.fromEntries(Object.keys(GROUP_TOTALS).map(k=>[k,0]));
  if(manifest.cases.length!==CASE_COUNT)errors.push("Expected exactly 38 distinct cases");
  manifest.cases.forEach((entry,i)=>{
    const id="S6-E2E-"+String(i+1).padStart(2,"0");
    if(entry?.id!==id)errors.push("Unexpected or duplicate case ID at position "+(i+1));
    if(!STATUS_VALUES.has(entry?.status)){
      errors.push("Invalid status at "+id);return;
    }
    counts[entry.status]++;
    if(Object.hasOwn(groups,entry.area))groups[entry.area]++;
    else errors.push("Unknown test area: "+id);
    if(!filled(entry.scenario))errors.push("Missing scenario: "+id);
    if(entry.status==="PASS"){
      for(const key of ["expected","actual","evidence","reviewer","environment_id","run_at_utc"]){
        if(!filled(entry[key]))errors.push("PASS missing "+key+": "+id);
      }
      if(filled(entry.run_at_utc)&&Number.isNaN(Date.parse(entry.run_at_utc)))
        errors.push("Invalid run timestamp: "+id);
    }
    if(["FAIL","BLOCKED"].includes(entry.status)&&!filled(entry.actual))
      errors.push(entry.status+" requires actual reason: "+id);
  });
  for(const [k,n] of Object.entries(GROUP_TOTALS))
    if(groups[k]!==n)errors.push("Category total mismatch: "+k);
  const allPassed=counts.PASS===CASE_COUNT;
  const signed=SIGNOFFS.every(k=>{
    const s=manifest.signoffs?.[k];
    return s?.approved===true && filled(s.reviewer) && filled(s.evidence);
  });
  const ready=errors.length===0 && allPassed && signed
    && manifest.release_status==="REVIEWED_FOR_RELEASE";
  return {valid:errors.length===0,errors,total:manifest.cases.length,counts,ready,
    blockers:[...(allPassed?[]:["38/38 verified real-E2E PASS required"]),
      ...(signed?[]:["Five independent signoffs required"]),
      ...(manifest.release_status==="REVIEWED_FOR_RELEASE"?[]:["Release review pending"])]};
}
export function auditStaticMigrations(read=(p)=>readFileSync(resolve(ROOT,p),"utf8")){
  const a=read("supabase/migrations/202611170003_speaking_s6_staging_l14.sql");
  const b=read("supabase/migrations/202611170004_speaking_s6_ui_progress_l15.sql");
  const c=read("supabase/migrations/202611170005_speaking_s6_s5_rls_l17.sql");
  const checks={
    default_gates_false:["s5_qa_verified","teacher_qa_verified","audio_qa_verified",
      "privacy_qa_verified","import_qa_verified"].every(f=>
        new RegExp("\\b"+f+"\\s+boolean\\s+not null\\s+default\\s+false","i").test(a)),
    private_audio_bucket:/values\s*\('speaking-s6-recordings','speaking-s6-recordings',false/i.test(a),
    no_private_bank_grants:/revoke all on public\.speaking_s6_private_revisions from anon,\s*authenticated/i.test(a),
    attempts_owner_read:/speaking_s6_attempt_read[\s\S]*?user_id\s*=\s*\(select auth\.uid\(\)\)/i.test(a),
    s5_starts_unverified:/s5_verified boolean not null default false/i.test(b),
    per_user_rls_after_l17:/speaking_s6_current_user_ready\(\)/i.test(c)
      && /create policy speaking_s6_published_read[\s\S]*?speaking_s6_current_user_ready\(\)/i.test(c)
  };
  return {static_only:true,checks,allPass:Object.values(checks).every(Boolean)};
}
export function validateStagingEnvironment(env=process.env){
  if(env.S6_STAGING_DISPOSABLE_CONFIRMATION!=="I_CONFIRM_DISPOSABLE_STAGING")
    throw new Error("Explicit disposable-staging confirmation required");
  const given=env.S6_STAGING_SUPABASE_URL,expected=env.S6_STAGING_EXPECTED_HOST;
  if(!filled(given)||!filled(expected)||!filled(env.S6_STAGING_SUPABASE_ANON_KEY))
    throw new Error("Missing isolated staging URL, exact expected host or anon key");
  const url=new URL(given);
  if(url.protocol!=="https:"||url.hostname!==expected||!url.hostname.endsWith(".supabase.co")
    ||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash)
    throw new Error("Refusing unmatched or nonstandard staging Supabase URL");
  return {url,key:env.S6_STAGING_SUPABASE_ANON_KEY};
}
export async function probeStagingAnon(env=process.env,fetcher=fetch){
  const {url,key}=validateStagingEnvironment(env);
  const paths=[
    {id:"anon_private_bank_grant",table:"speaking_s6_private_revisions"},
    {id:"anon_release_gates_grant",table:"speaking_s6_release_gates"},
    {id:"anon_revisions_grant",table:"speaking_s6_lesson_revisions"}
  ];
  const outputs=[];
  for(const p of paths){
    try{
      const u=new URL("rest/v1/"+p.table,url);
      u.searchParams.set("select","lesson_code");
      if(p.table==="speaking_s6_release_gates")u.searchParams.set("select","stage");
      u.searchParams.set("limit","1");
      const r=await fetcher(u,{method:"GET",redirect:"manual",
        headers:{"apikey":key,"Authorization":"Bearer "+key},
        signal:AbortSignal.timeout(12000)});
      outputs.push({id:p.id,status:r.status,
        result:[401,403].includes(r.status)?"PASS_DENIED":
          r.status===200?"FAIL_PUBLIC_READ":"BLOCKED_UNEXPECTED_HTTP"});
    }catch(e){
      outputs.push({id:p.id,status:null,result:"BLOCKED_NETWORK_ERROR"});
    }
  }
  return outputs;
}

async function main(){
  const manifest=JSON.parse(readFileSync(MANIFEST,"utf8"));
  const audit=auditManifest(manifest),schema=auditStaticMigrations();
  const output={milestone:"M10-L22",mode:"OFFLINE_PREFLIGHT",
    manifest:audit,source_checks:schema,
    live_staging_e2e_executed:0,release_authorized:false};
  if(process.argv.includes("--probe-staging")){
    output.mode="STAGING_ANON_READ_ONLY_PROBE";
    output.read_only_anon_probes=await probeStagingAnon();
  }
  console.log(JSON.stringify(output,null,2));
  if(!audit.valid||!schema.allPass||
    (output.read_only_anon_probes && output.read_only_anon_probes.some(x=>x.result!=="PASS_DENIED")))
    process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error("M10-L22 preflight blocked:",e.message);process.exitCode=2;});
}
