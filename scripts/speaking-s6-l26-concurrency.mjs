#!/usr/bin/env node
/**
 * M10-L26 multi-request admission proof using REAL Supabase PostgREST.
 * Operator-opt-in only, with service-role access limited to a disposable
 * staging project and a dedicated clean test account. Never run in CI.
 * Never logs authorization headers, user IDs, response bodies, or secrets.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITY_IDS=[
  ["S6-001-G01","guided"],["S6-001-G02","guided"],
  ["S6-001-G03","guided"],["S6-001-G04","guided"],
  ["S6-001-I01","independent"],["S6-001-I02","independent"]
];
const RELEASE_FLAGS=[
  "s5_qa_verified","teacher_qa_verified","audio_qa_verified",
  "privacy_qa_verified","import_qa_verified"
];
const errorOf=(err)=>err instanceof Error?err.message:"UNKNOWN";
const nonblank=x=>typeof x==="string"&&x.trim().length>0;

export function validateL26Config(env=process.env){
  if(env.S6_L26_ISOLATED_STAGING_ACK!=="I_CONFIRM_DISPOSABLE_STAGING_ONLY"
    || env.S6_L26_DESTRUCTIVE_FIXTURE_ACK!=="I_APPROVE_TEST_FIXTURE_CLEANUP")
    throw Error("Two explicit disposable-staging/cleanup acknowledgements are required");
  const raw=env.S6_L26_SUPABASE_URL,host=env.S6_L26_EXPECTED_HOST;
  if(!nonblank(raw)||!nonblank(host)||!nonblank(env.S6_L26_SERVICE_ROLE_KEY))
    throw Error("Missing disposable staging endpoint or service-role key");
  let url;try{url=new URL(raw);}catch{throw Error("Invalid staging URL");}
  if(url.protocol!=="https:"||url.hostname!==host||!host.endsWith(".supabase.co")||
    url.pathname!=="/"||url.search||url.hash||url.port||url.username||url.password)
    throw Error("Staging origin does not exactly match allowlisted host");
  const uid=env.S6_L26_TEST_USER_ID;
  if(!UUID.test(uid??""))throw Error("Dedicated disposable test account UUID required");
  const revision=env.S6_L26_STAGING_REVISION;
  if(!nonblank(revision)||!/^[A-Za-z0-9_-]{3,40}$/.test(revision))
    throw Error("Dedicated staging lesson revision required");
  return {url,uid:uid.toLowerCase(),revision,key:env.S6_L26_SERVICE_ROLE_KEY};
}

async function requestDb(config,fetcher,table,opts={}){
  const {method="GET",params={},body,prefer}=opts;
  const endpoint=table.startsWith("rpc/")?"rest/v1/"+table:"rest/v1/"+table;
  const url=new URL(endpoint,config.url);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  const response=await fetcher(url,{
    method,redirect:"manual",
    headers:{
      apikey:config.key,Authorization:"Bearer "+config.key,
      ...(body!==undefined?{"Content-Type":"application/json"}:{}),
      ...(prefer?{Prefer:prefer}:{})
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(15000)
  });
  let data=null;
  try{data=await response.json();}catch{/* empty DELETE response */}
  return {status:response.status,data};
}
const eq=x=>"eq."+x;
export async function readL26Preconditions(config,fetcher=fetch){
  const gates=await requestDb(config,fetcher,"speaking_s6_release_gates",{
    params:{select:["stage",...RELEASE_FLAGS].join(","),stage:"eq.S6"}});
  if(gates.status!==200||!Array.isArray(gates.data)||gates.data.length!==1||
    RELEASE_FLAGS.some(flag=>gates.data[0][flag]!==false))
    throw Error("STAGING_RELEASE_GATES_NOT_FALSE");

  const revision=await requestDb(config,fetcher,"speaking_s6_lesson_revisions",{
    params:{select:"lesson_code,revision,status",lesson_code:"eq.S6-001",
      revision:eq(config.revision),status:"eq.staging",limit:"2"}});
  if(revision.status!==200||!Array.isArray(revision.data)||revision.data.length!==1)
    throw Error("STAGING_LESSON_FIXTURE_NOT_UNIQUE");

  const checks=[
    ["speaking_s6_attempts",{user_id:eq(config.uid),preview:"eq.true"}],
    ["speaking_s6_start_quotas",{user_id:eq(config.uid),preview:"eq.true"}],
    ["speaking_s6_activity_cooldowns",{user_id:eq(config.uid),preview:"eq.true"}]
  ];
  for(const [table,filter] of checks){
    const r=await requestDb(config,fetcher,table,{params:{select:"user_id",...filter,limit:"1"}});
    if(r.status!==200||!Array.isArray(r.data)||r.data.length!==0)
      throw Error("TEST_USER_NOT_CLEAN_"+table.toUpperCase());
  }
  return true;
}
export async function runL26ConcurrentRpc(config,fetcher=fetch){
  const started=Date.now();
  const outcomes=await Promise.all(ACTIVITY_IDS.map(async([activity,mode])=>{
    try{
      const result=await requestDb(config,fetcher,"rpc/speaking_s6_start_attempt_l25",{
        method:"POST",body:{
          p_user_id:config.uid,p_lesson_code:"S6-001",p_revision:config.revision,
          p_activity_id:activity,p_mode:mode,p_preview:true,p_audio_storage_consent:false
        }
      });
      if(result.status===200&&UUID.test(result.data??""))
        return {type:"accepted"};
      if(result.status===400 && result.data?.message==="S6_START_ACTIVE_LIMIT")
        return {type:"denied_active_limit"};
      return {type:"unexpected",http:result.status};
    }catch{return {type:"network_error"};}
  }));
  return {elapsed_ms:Date.now()-started,outcomes,
    accepted:outcomes.filter(x=>x.type==="accepted").length,
    denied_active_limit:outcomes.filter(x=>x.type==="denied_active_limit").length,
    unexpected:outcomes.filter(x=>!["accepted","denied_active_limit"].includes(x.type)).length};
}
export async function readL26Postconditions(config,fetcher=fetch){
  const tables=[
    ["speaking_s6_attempts",{user_id:eq(config.uid),preview:"eq.true",
      lesson_code:"eq.S6-001",revision:eq(config.revision)}],
    ["speaking_s6_activity_cooldowns",{user_id:eq(config.uid),preview:"eq.true"}]
  ];
  const counts={};
  for(const [table,filter] of tables){
    const r=await requestDb(config,fetcher,table,{params:{select:"user_id",...filter,limit:"10"}});
    if(r.status!==200||!Array.isArray(r.data))throw Error("POSTCHECK_UNAVAILABLE");
    counts[table]=r.data.length;
  }
  const q=await requestDb(config,fetcher,"speaking_s6_start_quotas",{
    params:{select:"hour_count,day_count",user_id:eq(config.uid),preview:"eq.true"}});
  if(q.status!==200||!Array.isArray(q.data)||q.data.length>1)
    throw Error("QUOTA_POSTCHECK_UNAVAILABLE");
  // A completely failed RPC fanout may leave no quota row. Treat that as
  // zero, yielding a clear FAIL report instead of falsely treating it as PASS.
  const quota=q.data[0]??{hour_count:0,day_count:0};
  return {...counts,quota_hour_count:quota.hour_count,
    quota_day_count:quota.day_count};
}
export function assessL26Concurrency(run,post){
  const safe=run.accepted===3&&run.denied_active_limit===3&&run.unexpected===0
    &&post.speaking_s6_attempts===3
    &&post.speaking_s6_activity_cooldowns===3
    &&post.quota_hour_count===3&&post.quota_day_count===3;
  return {status:safe?"PASS":"FAIL",
    total_http_attempts:ACTIVITY_IDS.length,
    accepted:run.accepted,denied_active_limit:run.denied_active_limit,
    unexpected:run.unexpected,db_attempts:post.speaking_s6_attempts,
    db_cooldowns:post.speaking_s6_activity_cooldowns,
    hour_count:post.quota_hour_count,day_count:post.quota_day_count};
}
export async function cleanupL26Fixture(config,fetcher=fetch){
  // Caller prechecked *zero* rows in all three tables for the dedicated
  // test user. Delete only that account's preview=true test rows.
  const specs=[
    ["speaking_s6_attempts",{user_id:eq(config.uid),preview:"eq.true",
      lesson_code:"eq.S6-001",revision:eq(config.revision)}],
    ["speaking_s6_activity_cooldowns",{user_id:eq(config.uid),preview:"eq.true"}],
    ["speaking_s6_start_quotas",{user_id:eq(config.uid),preview:"eq.true"}]
  ];
  const results=[];
  for(const [table,filter] of specs){
    try {
      const r=await requestDb(config,fetcher,table,{
        method:"DELETE",params:filter});
      results.push({table,ok:[200,204].includes(r.status)});
    }catch{results.push({table,ok:false});}
  }
  // HTTP 204 alone does not prove cleanup. Re-read the three
  // fixture tables AND five release flags before treating cleanup as complete.
  let verified=false;
  if(results.every(x=>x.ok)){
    try { verified=await readL26Preconditions(config,fetcher); }
    catch { verified=false; }
  }
  return {cleaned:results.every(x=>x.ok)&&verified,verified,results};
}
export async function executeL26(config,fetcher=fetch){
  await readL26Preconditions(config,fetcher); // Never mutate if prerequisites fail.
  let run=null,post=null,failedReason=null,cleanup=null;
  try {
    run=await runL26ConcurrentRpc(config,fetcher);
    post=await readL26Postconditions(config,fetcher);
  }catch(e){failedReason=errorOf(e);}
  finally {cleanup=await cleanupL26Fixture(config,fetcher);}
  const audit=run&&post?assessL26Concurrency(run,post):null;
  return {milestone:"M10-L26",mode:"REAL_DISPOSABLE_STAGING_RPC",
    concurrency:audit,
    cleanup_complete:cleanup?.cleaned===true,
    cleanup_tables:cleanup?.results.map(x=>({table:x.table,ok:x.ok})),
    run_error:failedReason?"RUN_BLOCKED_OR_FAILED":null,
    // A PASS here is only the quota concurrency subset; it cannot certify
    // the 38 signed full E2E cases or classroom release.
    full_e2e_cases_certified:0,release_authorized:false,
    status:(audit?.status==="PASS"&&cleanup?.cleaned===true)?"PASS_SUBSET":"BLOCKED_OR_FAILED"};
}
async function main(){
  if(!process.argv.includes("--run-explicit-disposable-staging"))
    throw Error("Offline by default; explicit flag and isolated staging approval required");
  const config=validateL26Config();
  const result=await executeL26(config);
  console.log(JSON.stringify(result,null,2));
  if(result.status!=="PASS_SUBSET")process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    // Never print Fetch errors because they can echo request headers.
    console.error("M10-L26 BLOCKED:",errorOf(e).replace(/[A-Za-z0-9_-]{45,}/g,"[redacted]"));
    process.exitCode=2;
  });
}
