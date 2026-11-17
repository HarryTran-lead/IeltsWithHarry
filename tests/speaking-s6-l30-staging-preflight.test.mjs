import {describe,it,expect} from "vitest";
import {validateL30StagingConfig,L30_PROBES,assessL30Probe,
 runL30ReadOnlyPreflight} from "../scripts/speaking-s6-l30-staging-preflight.mjs";

const HOST="s6-disposable-fixture.supabase.co";
const PROD="s6-real-prod.supabase.co";
const env=()=>({
 S6_L30_DISPOSABLE_ACK:"I_VERIFIED_NEW_DISPOSABLE_STAGING",
 S6_L30_NONPRODUCTION_ACK:"I_VERIFIED_STAGING_DIFFERS_FROM_PRODUCTION",
 S6_L30_SUPABASE_URL:"https://"+HOST+"/",
 S6_L30_EXPECTED_HOST:HOST,
 S6_L30_PRODUCTION_HOST:PROD,
 S6_L30_ENVIRONMENT_ALIAS:"disposable-s6-sandbox",
 S6_L30_STAGING_SERVICE_ROLE_KEY:"fake-staging-service-role-credential",
 S6_L30_STAGING_ANON_KEY:"fake-staging-anon-key"
});
const gates={stage:"S6",s5_qa_verified:false,teacher_qa_verified:false,
  audio_qa_verified:false,privacy_qa_verified:false,import_qa_verified:false};
const bucket={id:"speaking-s6-recordings",public:false,file_size_limit:10485760,
  allowed_mime_types:["audio/webm","audio/mp4","audio/ogg"]};
function mocked({openGates=false,publicBucket=false,exposedBank=false,failedSchema=false}={}){
 const calls=[];
 const fake=async(url,opts)=>{
   const u=new URL(url);const anon=opts.headers.Authorization.endsWith("fake-staging-anon-key");
   calls.push({path:u.pathname,method:opts.method,redirect:opts.redirect,anon});
   if(anon) return {status:exposedBank&&u.pathname.endsWith("private_revisions")?200:403,
     json:async()=>[]};
   if(u.pathname.includes("/bucket/"))
     return {status:200,json:async()=>({...bucket,public:publicBucket})};
   if(u.pathname.endsWith("speaking_s6_release_gates"))
     return {status:200,json:async()=>[{...gates,
       ...(openGates?{privacy_qa_verified:true}:{})}]};
   if(failedSchema&&u.pathname.endsWith("speaking_s6_activity_cooldowns"))
     return {status:404};
   return {status:200,json:async()=>[]};
 };
 return {calls,fake};
}
describe("M10-L30 read-only staging prerequisites (mock transport, NOT real E2E)",()=>{
 it("requires independent production host and two staging attestations",()=>{
   expect(()=>validateL30StagingConfig({})).toThrow();
   const a=env();a.S6_L30_PRODUCTION_HOST=HOST;
   expect(()=>validateL30StagingConfig(a)).toThrow();
   const b=env();b.S6_L30_NONPRODUCTION_ACK="";
   expect(()=>validateL30StagingConfig(b)).toThrow();
 });
 it("refuses unexpected endpoint paths and misleading production aliases",()=>{
   const a=env();a.S6_L30_SUPABASE_URL="https://"+HOST+"/rest/v1/";
   expect(()=>validateL30StagingConfig(a)).toThrow();
   const b=env();b.S6_L30_ENVIRONMENT_ALIAS="production-qa";
   expect(()=>validateL30StagingConfig(b)).toThrow();
   const c=env();c.S6_L30_EXPECTED_HOST=PROD;
   expect(()=>validateL30StagingConfig(c)).toThrow();
 });
 it("plans ten read-only probes, including private bank and release gate checks",()=>{
   expect(L30_PROBES).toHaveLength(10);
   expect(L30_PROBES.filter(p=>p.check==="deny")).toHaveLength(2);
   expect(L30_PROBES.some(p=>p.id==="ATTEMPT_L28_FIELDS")).toBe(true);
 });
 it("returns prerequisite PASS with correct mock gates, migrations and private bucket",async()=>{
   const m=mocked(),report=await runL30ReadOnlyPreflight(validateL30StagingConfig(env()),m.fake);
   expect(report.test_count).toBe(10);
   expect(report.counts).toEqual({PASS:10,FAIL:0,BLOCKED:0});
   expect(report.next_action).toBe("READY_TO_BEGIN_MANUAL_50_CASE_E2E");
   expect(report.live_e2e_cases_certified).toBe(0);
   expect(report.release_authorized).toBe(false);
   expect(m.calls.every(x=>x.method==="GET"&&x.redirect==="manual")).toBe(true);
   expect(m.calls.filter(x=>x.anon)).toHaveLength(2);
   expect(JSON.stringify(report)).not.toContain("fake-staging-service-role");
 });
 it("fails closed if any release flag is true or bucket becomes public",async()=>{
   const c=validateL30StagingConfig(env());
   for(const options of [{openGates:true},{publicBucket:true}]){
     const m=mocked(options);
     const report=await runL30ReadOnlyPreflight(c,m.fake);
     expect(report.counts.FAIL).toBeGreaterThan(0);
     expect(report.next_action).toBe("INVESTIGATE_STAGING_BEFORE_E2E");
   }
 });
 it("does not accept HTTP 200 with empty rows on the private bank",async()=>{
   expect(assessL30Probe({check:"deny"},200,[])).toBe("FAIL");
   const m=mocked({exposedBank:true});
   const report=await runL30ReadOnlyPreflight(validateL30StagingConfig(env()),m.fake);
   expect(report.results.find(r=>r.id==="ANON_PRIVATE_BANK_DENIED")?.result).toBe("FAIL");
 });
 it("does not pass if a migration table is absent",async()=>{
   const m=mocked({failedSchema:true});
   const report=await runL30ReadOnlyPreflight(validateL30StagingConfig(env()),m.fake);
   expect(report.results.find(r=>r.id==="L26_COOLDOWN_TABLE")?.result).toBe("BLOCKED");
   expect(report.next_action).toBe("INVESTIGATE_STAGING_BEFORE_E2E");
 });
 it("classifies a network failure as BLOCKED without echoing secrets",async()=>{
   const badFetch=async()=>{throw Error("Authorization:Bearer TOP_SECRET");};
   const report=await runL30ReadOnlyPreflight(validateL30StagingConfig(env()),badFetch);
   expect(report.counts.BLOCKED).toBe(10);
   expect(JSON.stringify(report)).not.toContain("TOP_SECRET");
 });
});
