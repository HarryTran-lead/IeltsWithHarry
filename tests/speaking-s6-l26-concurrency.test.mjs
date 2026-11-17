import {describe,it,expect} from "vitest";
import {
  validateL26Config,readL26Preconditions,runL26ConcurrentRpc,
  assessL26Concurrency,executeL26
} from "../scripts/speaking-s6-l26-concurrency.mjs";

const HOST="example-disposable-fixture.supabase.co";
const USER="11111111-1111-4111-8111-111111111111";
function env(){
  return {
    S6_L26_ISOLATED_STAGING_ACK:"I_CONFIRM_DISPOSABLE_STAGING_ONLY",
    S6_L26_DESTRUCTIVE_FIXTURE_ACK:"I_APPROVE_TEST_FIXTURE_CLEANUP",
    S6_L26_SUPABASE_URL:"https://"+HOST+"/",
    S6_L26_EXPECTED_HOST:HOST,
    S6_L26_SERVICE_ROLE_KEY:"TEST-SECRET-NEVER-A-REAL-SERVICE-KEY",
    S6_L26_TEST_USER_ID:USER,
    S6_L26_STAGING_REVISION:"L26_TEST"
  };
}
function fakeApi({dirty=false,failCleanup=false,unexpected=false}={}){
  const calls=[];
  let active=0,cooldown=0,quota=0;
  const fake=async(url,opts)=>{
    const u=new URL(url),path=u.pathname.split("/").at(-1);
    calls.push({method:opts.method,path,redirect:opts.redirect,
      hasAuthorization:Boolean(opts.headers.Authorization)});
    const json=data=>({status:200,json:async()=>data});
    const err=(status,data)=>({status,json:async()=>data});
    if(opts.method==="GET"){
      if(path==="speaking_s6_release_gates")
        return json([{stage:"S6",s5_qa_verified:false,teacher_qa_verified:false,
          audio_qa_verified:false,privacy_qa_verified:false,import_qa_verified:false}]);
      if(path==="speaking_s6_lesson_revisions")
        return json([{lesson_code:"S6-001",revision:"L26_TEST",status:"staging"}]);
      if(path==="speaking_s6_attempts")
        return json(Array.from({length:dirty?1:active},()=>({user_id:USER})));
      if(path==="speaking_s6_start_quotas")
        return json(quota||dirty?[{hour_count:quota,day_count:quota}]:[]);
      if(path==="speaking_s6_activity_cooldowns")
        return json(Array.from({length:cooldown},()=>({user_id:USER})));
    }
    if(opts.method==="POST"){
      if(path!=="speaking_s6_start_attempt_l25")throw Error("Unexpected mutation");
      if(unexpected)return err(503,{message:"DB_TEMPORARY_ERROR"});
      if(active<3){
        active++;cooldown++;quota++;
        return json("22222222-2222-4222-8222-222222222222");
      }
      return err(400,{message:"S6_START_ACTIVE_LIMIT"});
    }
    if(opts.method==="DELETE"){
      if(failCleanup && path==="speaking_s6_start_quotas")return err(503,{message:"failure"});
      if(path==="speaking_s6_attempts")active=0;
      if(path==="speaking_s6_activity_cooldowns")cooldown=0;
      if(path==="speaking_s6_start_quotas")quota=0;
      return {status:204,json:async()=>null};
    }
    throw Error("Unexpected request");
  };
  return {calls,fake};
}
describe("M10-L26 guarded staging concurrency harness (MOCK HTTP only)",()=>{
  it("refuses unapproved staging and mismatched project hosts",()=>{
    expect(()=>validateL26Config({})).toThrow();
    const e=env();e.S6_L26_EXPECTED_HOST="production.supabase.co";
    expect(()=>validateL26Config(e)).toThrow();
    const f=env();delete f.S6_L26_DESTRUCTIVE_FIXTURE_ACK;
    expect(()=>validateL26Config(f)).toThrow();
  });
  it("verifies all five release flags false and a single staging revision",async()=>{
    const c=validateL26Config(env()),api=fakeApi();
    expect(await readL26Preconditions(c,api.fake)).toBe(true);
    expect(api.calls.every(x=>x.method==="GET")).toBe(true);
  });
  it("never mutates if fixture is dirty",async()=>{
    const c=validateL26Config(env()),api=fakeApi({dirty:true});
    await expect(executeL26(c,api.fake)).rejects.toThrow("TEST_USER_NOT_CLEAN");
    expect(api.calls.every(x=>x.method==="GET")).toBe(true);
  });
  it("fans six POST calls concurrently, admits three, then cleans up test rows",async()=>{
    const c=validateL26Config(env()),api=fakeApi();
    const r=await executeL26(c,api.fake);
    expect(r.status).toBe("PASS_SUBSET");
    expect(r.cleanup_complete).toBe(true);
    expect(r.concurrency).toMatchObject({
      status:"PASS",accepted:3,denied_active_limit:3,unexpected:0,
      db_attempts:3,db_cooldowns:3,hour_count:3,day_count:3
    });
    expect(api.calls.filter(x=>x.method==="POST")).toHaveLength(6);
    expect(api.calls.filter(x=>x.method==="DELETE")).toHaveLength(3);
    expect(api.calls.every(x=>x.redirect==="manual")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(c.key);
    expect(r.full_e2e_cases_certified).toBe(0);
    expect(r.release_authorized).toBe(false);
  });
  it("reports unexpected RPC responses as failed subset, not a false PASS",async()=>{
    const c=validateL26Config(env()),api=fakeApi({unexpected:true});
    const r=await executeL26(c,api.fake);
    expect(r.status).toBe("BLOCKED_OR_FAILED");
    expect(r.concurrency.status).toBe("FAIL");
    expect(r.concurrency.unexpected).toBe(6);
    expect(r.cleanup_complete).toBe(true);
  });
  it("never reports successful subset when cleanup was not successful",async()=>{
    const c=validateL26Config(env()),api=fakeApi({failCleanup:true});
    const r=await executeL26(c,api.fake);
    expect(r.status).toBe("BLOCKED_OR_FAILED");
    expect(r.cleanup_complete).toBe(false);
  });
  it("distinguishes admitted and denied attempts from persisted database counts",()=>{
    expect(assessL26Concurrency(
      {accepted:3,denied_active_limit:3,unexpected:0},
      {speaking_s6_attempts:4,speaking_s6_activity_cooldowns:3,
       quota_hour_count:3,quota_day_count:3}
    ).status).toBe("FAIL");
  });
});
