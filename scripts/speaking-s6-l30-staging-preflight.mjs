#!/usr/bin/env node
/**
 * M10-L30: STAGING-ONLY, READ-ONLY Supabase release prerequisite probes.
 *
 * No migrations, imports, release-flag writes, data cleanup or audio access.
 * Project identity cannot be established cryptographically from an operator
 * claim; a human must independently verify that credentials and host belong
 * to a new disposable staging project. Never run against production.
 */
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const GATES=["s5_qa_verified","teacher_qa_verified","audio_qa_verified",
  "privacy_qa_verified","import_qa_verified"];
const NONSECRET=/^[A-Za-z0-9_-]{5,64}$/;
const HTTPS_HOST=/^[a-z0-9-]+\.supabase\.co$/;
const ACK="I_VERIFIED_NEW_DISPOSABLE_STAGING";
const DIFFERENT="I_VERIFIED_STAGING_DIFFERS_FROM_PRODUCTION";
const required=(x,label)=>{
  if(typeof x!=="string"||!x.trim())throw Error("Missing "+label);
  return x.trim();
};

export function validateL30StagingConfig(env=process.env){
  if(env.S6_L30_DISPOSABLE_ACK!==ACK||
     env.S6_L30_NONPRODUCTION_ACK!==DIFFERENT)
    throw Error("Disposable-staging and production-separation attestations required");
  const raw=required(env.S6_L30_SUPABASE_URL,"isolated staging Supabase URL");
  const allowed=required(env.S6_L30_EXPECTED_HOST,"exact staging host");
  const production=required(env.S6_L30_PRODUCTION_HOST,"known production Supabase host");
  const alias=required(env.S6_L30_ENVIRONMENT_ALIAS,"non-secret staging alias");
  const key=required(env.S6_L30_STAGING_SERVICE_ROLE_KEY,"staging-only service role key");
  const anonKey=required(env.S6_L30_STAGING_ANON_KEY,"staging-only anon key");
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!==allowed||
     !HTTPS_HOST.test(allowed)||allowed===production||
     url.pathname!=="/"||url.port||url.search||url.hash||
     url.username||url.password||!NONSECRET.test(alias))
    throw Error("Staging endpoint or alias not isolated and exact");
  if(/^(prod|production|main|live)(-|_|$)/i.test(alias))
    throw Error("Staging alias must identify a disposable project");
  if(key===anonKey)throw Error("Staging service-role and anon keys must differ");
  return {url,alias,key,anonKey};
}

export const L30_PROBES=[
  {id:"GATES_FALSE",path:"rest/v1/speaking_s6_release_gates",key:"service",
    params:{select:["stage",...GATES].join(","),stage:"eq.S6",limit:"2"},check:"gates"},
  {id:"ATTEMPT_L28_FIELDS",path:"rest/v1/speaking_s6_attempts",key:"service",
    params:{select:"id,phase,deletion_requested_at,audio_evidence_state,audio_evidence_sha256",limit:"0"},check:"schema"},
  {id:"L25_QUOTA_TABLE",path:"rest/v1/speaking_s6_start_quotas",key:"service",
    params:{select:"hour_count,day_count",limit:"0"},check:"schema"},
  {id:"L26_COOLDOWN_TABLE",path:"rest/v1/speaking_s6_activity_cooldowns",key:"service",
    params:{select:"activity_id,last_started_at",limit:"0"},check:"schema"},
  {id:"S5_EVIDENCE_TABLE",path:"rest/v1/speaking_s6_s5_eligibility",key:"service",
    params:{select:"s5_verified,verified_at",limit:"0"},check:"schema"},
  {id:"LESSON_REVISION_SCHEMA",path:"rest/v1/speaking_s6_lesson_revisions",key:"service",
    params:{select:"lesson_code,status,revision",limit:"0"},check:"schema"},
  {id:"PRIVATE_BANK_SCHEMA",path:"rest/v1/speaking_s6_private_revisions",key:"service",
    params:{select:"lesson_code",limit:"0"},check:"schema"},
  {id:"PRIVATE_AUDIO_BUCKET",path:"storage/v1/bucket/speaking-s6-recordings",
    key:"service",params:{},check:"bucket"},
  {id:"ANON_PRIVATE_BANK_DENIED",path:"rest/v1/speaking_s6_private_revisions",
    key:"anon",params:{select:"lesson_code",limit:"1"},check:"deny"},
  {id:"ANON_RELEASE_GATES_DENIED",path:"rest/v1/speaking_s6_release_gates",
    key:"anon",params:{select:"stage",limit:"1"},check:"deny"}
];

export function assessL30Probe(probe,http,body){
  if(probe.check==="deny"){
    if(http===401||http===403)return "PASS";
    // RLS may return [] for an exposed table, but the grant itself MUST
    // be revoked for private banks and release flags.
    return http===200?"FAIL":"BLOCKED";
  }
  if(http!==200)return [400,401,403].includes(http)?"FAIL":"BLOCKED";
  if(probe.check==="gates"){
    if(!Array.isArray(body)||body.length!==1)return "FAIL";
    return body[0].stage==="S6"&&GATES.every(x=>body[0][x]===false)?"PASS":"FAIL";
  }
  if(probe.check==="schema")return Array.isArray(body)&&body.length===0?"PASS":"FAIL";
  if(probe.check==="bucket"){
    return body && !Array.isArray(body) &&
      body.id==="speaking-s6-recordings" && body.public===false &&
      body.file_size_limit<=10485760 &&
      Array.isArray(body.allowed_mime_types) &&
      ["audio/webm","audio/mp4","audio/ogg"].every(x=>body.allowed_mime_types.includes(x))
      ?"PASS":"FAIL";
  }
  return "BLOCKED";
}

export async function runL30ReadOnlyPreflight(config,fetcher=fetch){
  const results=[];
  for(const probe of L30_PROBES){
    const url=new URL(probe.path,config.url);
    for(const [k,v] of Object.entries(probe.params))url.searchParams.set(k,v);
    const token=probe.key==="service"?config.key:config.anonKey;
    try{
      const response=await fetcher(url,{
        method:"GET",redirect:"manual",
        headers:{"apikey":config.anonKey,"Authorization":"Bearer "+token,
          "Accept":"application/json"},
        signal:AbortSignal.timeout(12000)
      });
      let body=null;
      if(response.status===200){
        try{body=await response.json();}catch{body=null;}
      }
      results.push({id:probe.id,result:assessL30Probe(probe,response.status,body),
        http_status:response.status});
    }catch{
      results.push({id:probe.id,result:"BLOCKED",http_status:null});
    }
  }
  const counts={PASS:0,FAIL:0,BLOCKED:0};
  for(const row of results)counts[row.result]++;
  return {milestone:"M10-L30",environment_alias:config.alias,
    category:"STAGING_READ_ONLY_PREFLIGHT",test_count:results.length,
    counts,results,
    next_action:counts.PASS===results.length?
      "READY_TO_BEGIN_MANUAL_50_CASE_E2E":"INVESTIGATE_STAGING_BEFORE_E2E",
    live_e2e_cases_certified:0,release_authorized:false,s7_unlocked:false};
}

async function main(){
  if(!process.argv.includes("--approved-staging-read-only")){
    console.log(JSON.stringify({milestone:"M10-L30",status:"HOLD_NO_STAGING_EXECUTION",
      staging_http_requests:0,live_e2e_cases_certified:0,release_authorized:false}));
    return;
  }
  const config=validateL30StagingConfig();
  const report=await runL30ReadOnlyPreflight(config);
  console.log(JSON.stringify(report,null,2));
  if(report.counts.FAIL||report.counts.BLOCKED)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{
    // Do not log arbitrary Supabase errors; they can contain auth headers.
    console.error("M10-L30 staging preflight BLOCKED; inspect configuration locally");
    process.exitCode=2;
  });
}
