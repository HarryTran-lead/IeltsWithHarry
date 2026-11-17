#!/usr/bin/env node
/**
 * M10-L23: authenticated Speaking S6 cross-account RLS audit.
 * EXPLICIT OPT-IN, DISPOSABLE STAGING ONLY. GET-only, no writes or credentials in logs.
 * These probes do not substitute for the complete 38-case real E2E matrix.
 */
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateStagingEnvironment} from "./speaking-s6-l22-preflight.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DANGEROUS=new Set([
  "model_answer_en","model_translation_vi","teacher_reasoning_vi",
  "followup_en","private_bank","privateLesson","private_lesson",
  "correct_answer","answer_key","private_answer","explanation_vi"
]);
function required(v,label) {
  if(typeof v!=="string"||!v.trim())throw Error("Missing "+label);
  return v.trim();
}
export function inspectStudentContent(value) {
  const hits=new Set();
  function visit(x,depth){
    if(depth>30)return;
    if(Array.isArray(x)){for(const item of x)visit(item,depth+1);return;}
    if(x&&typeof x==="object"){
      for(const [key,val] of Object.entries(x)){
        if(DANGEROUS.has(key))hits.add(key);
        visit(val,depth+1);
      }
    }
  }
  visit(value,0);
  return {safe:hits.size===0,forbiddenKeys:[...hits].sort()};
}
export function decodeStagingLearnerToken(token,host,now=Date.now()) {
  const raw=required(token,"learner access token");
  if(raw.startsWith("Bearer ")||raw.split(".").length!==3||raw.length>8000)
    throw Error("Expected one learner JWT, not service role or Bearer string");
  let claims;
  try {claims=JSON.parse(Buffer.from(raw.split(".")[1],"base64url").toString("utf8"));}
  catch {throw Error("Invalid learner token format");}
  if(claims?.role!=="authenticated"||!UUID.test(claims?.sub??""))
    throw Error("Learner JWT role or subject not permitted");
  if(claims.iss!=="https://"+host+"/auth/v1")
    throw Error("Learner JWT issuer does not match approved staging project");
  if(!Number.isFinite(claims.exp)||claims.exp*1000<=now)
    throw Error("Learner JWT expired or has no expiry");
  if(claims.aud!=="authenticated"&&!(Array.isArray(claims.aud)&&claims.aud.includes("authenticated")))
    throw Error("Learner JWT audience not permitted");
  // JWT payload decoding is a preflight guard, NOT signature verification.
  // Supabase verifies signature for every actual HTTP request.
  return {sub:claims.sub.toLowerCase(),token:raw};
}
export function validateL23Environment(env=process.env,now=Date.now()) {
  const {url,key}=validateStagingEnvironment(env);
  const a=decodeStagingLearnerToken(env.S6_L23_LEARNER_A_JWT,url.hostname,now);
  const b=decodeStagingLearnerToken(env.S6_L23_LEARNER_B_JWT,url.hostname,now);
  if(a.sub===b.sub)throw Error("Learner A and B must be different identities");
  const ownA=required(env.S6_L23_ATTEMPT_A,"A attempt fixture UUID");
  const ownB=required(env.S6_L23_ATTEMPT_B,"B attempt fixture UUID");
  if(!UUID.test(ownA)||!UUID.test(ownB)||ownA.toLowerCase()===ownB.toLowerCase())
    throw Error("Two distinct seeded attempt UUIDs are required");
  const rev=required(env.S6_L23_REVISION,"S6-001 fixture revision");
  if(!/^[A-Za-z0-9_-]{3,40}$/.test(rev))
    throw Error("Invalid fixture revision");
  const mode=env.S6_L23_ACCESS_MODE??"locked";
  if(mode!=="locked"&&mode!=="eligible")
    throw Error("Mode must be locked or eligible");
  if(mode==="eligible"&&env.S6_L23_DISPOSABLE_RELEASE_WINDOW!=="I_CONFIRMED_STAGING_ONLY_RELEASE")
    throw Error("Eligible mode needs explicit isolated staging-only release-window confirmation");
  return {url,key,a,b,attemptA:ownA.toLowerCase(),attemptB:ownB.toLowerCase(),revision:rev,mode};
}
export function planL23Probes(c) {
  const probes=[];
  const add=(id,role,table,select,filters,expectation,checkSecrets=false)=>{
    probes.push({id,role,table,select,filters,expectation,checkSecrets});
  };
  add("ANON-PRIVATE","anon","speaking_s6_private_revisions","lesson_code",{},"DENIED");
  add("ANON-GATES","anon","speaking_s6_release_gates","stage",{},"DENIED");
  add("A-PRIVATE","a","speaking_s6_private_revisions","lesson_code",{},"DENIED");
  add("B-PRIVATE","b","speaking_s6_private_revisions","lesson_code",{},"DENIED");
  add("A-GATES","a","speaking_s6_release_gates","stage",{},"DENIED");
  add("B-GATES","b","speaking_s6_release_gates","stage",{},"DENIED");
  const aa={id:"eq."+c.attemptA}, bb={id:"eq."+c.attemptB};
  add("A-OWN-ATTEMPT","a","speaking_s6_attempts","id",aa,"ONE");
  add("B-OWN-ATTEMPT","b","speaking_s6_attempts","id",bb,"ONE");
  add("A-OTHER-ATTEMPT","a","speaking_s6_attempts","id",bb,"ZERO");
  add("B-OTHER-ATTEMPT","b","speaking_s6_attempts","id",aa,"ZERO");
  const pA={user_id:"eq."+c.a.sub,lesson_code:"eq.S6-001",revision:"eq."+c.revision};
  const pB={user_id:"eq."+c.b.sub,lesson_code:"eq.S6-001",revision:"eq."+c.revision};
  add("A-OWN-PROGRESS","a","speaking_s6_study_progress","lesson_code",pA,"ONE");
  add("B-OWN-PROGRESS","b","speaking_s6_study_progress","lesson_code",pB,"ONE");
  add("A-OTHER-PROGRESS","a","speaking_s6_study_progress","lesson_code",pB,"ZERO");
  add("B-OTHER-PROGRESS","b","speaking_s6_study_progress","lesson_code",pA,"ZERO");
  add("A-LESSON","a","speaking_s6_lesson_revisions","lesson_code,student_content",
    {lesson_code:"eq.S6-001",status:"eq.published"},
    c.mode==="eligible"?"ONE":"ZERO",true);
  add("B-LESSON","b","speaking_s6_lesson_revisions","lesson_code",
    {lesson_code:"eq.S6-001",status:"eq.published"},"ZERO");
  return probes;
}
export function assessL23Response(probe,status,data){
  if(probe.expectation==="DENIED"){
    if(status===401||status===403)return "PASS";
    return status===200?"FAIL":"BLOCKED";
  }
  if(status!==200)return status===401||status===403?"FAIL":"BLOCKED";
  if(!Array.isArray(data))return "BLOCKED";
  if(probe.expectation==="ZERO")return data.length===0?"PASS":"FAIL";
  if(probe.expectation==="ONE"){
    if(data.length!==1)return "FAIL";
    if(probe.checkSecrets&&!inspectStudentContent(data[0].student_content).safe)return "FAIL";
    return "PASS";
  }
  return "BLOCKED";
}
export async function runL23Audit(config,fetcher=fetch){
  const probes=planL23Probes(config);
  const results=[];
  for(const probe of probes){
    const url=new URL("rest/v1/"+probe.table,config.url);
    url.searchParams.set("select",probe.select);
    for(const [key,val] of Object.entries(probe.filters))url.searchParams.set(key,val);
    url.searchParams.set("limit","2");
    const token=probe.role==="a"?config.a.token:probe.role==="b"?config.b.token:config.key;
    try {
      const response=await fetcher(url,{
        method:"GET",redirect:"manual",
        headers:{"apikey":config.key,"Authorization":"Bearer "+token,"Accept":"application/json"},
        signal:AbortSignal.timeout(12000)
      });
      // Read only the small, selected rows needed for test predicates.
      let data=null;
      if(response.status===200){
        try {data=await response.json();} catch {data=null;}
      }
      const result=assessL23Response(probe,response.status,data);
      results.push({id:probe.id,status:response.status,result});
    } catch {
      // Do not surface error messages: client errors can contain URLs or headers.
      results.push({id:probe.id,status:null,result:"BLOCKED"});
    }
  }
  const counts={PASS:0,FAIL:0,BLOCKED:0};
  for(const x of results)counts[x.result]++;
  return {milestone:"M10-L23",check_type:"AUTHENTICATED_RLS_READ_ONLY",
    test_count:results.length,counts,results,
    full_e2e_cases_certified:0,release_authorized:false};
}
async function main() {
  if(!process.argv.includes("--run-approved-staging"))
    throw Error("No network by default; use --run-approved-staging after confirming isolated fixture data");
  const config=validateL23Environment();
  const report=await runL23Audit(config);
  console.log(JSON.stringify(report,null,2));
  if(report.counts.FAIL>0||report.counts.BLOCKED>0)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(err=>{console.error("M10-L23 BLOCKED:",err.message);process.exitCode=2;});
}
