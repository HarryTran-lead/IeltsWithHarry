import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {auditManifest,auditStaticMigrations,validateStagingEnvironment,
  probeStagingAnon} from "../scripts/speaking-s6-l22-preflight.mjs";
const baseline=JSON.parse(readFileSync(new URL("./speaking-s6/m10-l21-e2e-evidence.json",import.meta.url),"utf8"));
const copy=()=>structuredClone(baseline);
describe("M10-L22 Speaking S6 evidence preflight: offline-only",()=>{
  it("recognizes all 38 planned scenarios without inventing a PASS",()=>{
    const x=auditManifest(copy());
    expect(x.valid).toBe(true);
    expect(x.total).toBe(38);
    expect(x.counts.NOT_RUN).toBe(38);
    expect(x.counts.PASS).toBe(0);
    expect(x.ready).toBe(false);
  });
  it("rejects skipped or duplicated case IDs",()=>{
    const x=copy();x.cases[1].id=x.cases[0].id;
    expect(auditManifest(x).valid).toBe(false);
  });
  it("rejects a PASS without dated, attributed, environment-specific evidence",()=>{
    const x=copy();x.cases[0].status="PASS";
    const r=auditManifest(x);
    expect(r.valid).toBe(false);
    expect(r.errors.some(s=>s.includes("PASS missing evidence"))).toBe(true);
  });
  it("rejects a BLOCKED or FAIL claim without a concrete reason",()=>{
    const x=copy();x.cases[0].status="BLOCKED";
    expect(auditManifest(x).valid).toBe(false);
    x.cases[0].actual="No disposable Supabase staging project was available";
    expect(auditManifest(x).valid).toBe(true);
  });
  it("checks all static migration guardrails but does not certify live staging",()=>{
    const x=auditStaticMigrations();
    expect(x.allPass).toBe(true);
    expect(x.static_only).toBe(true);
  });
  it("refuses remote probes without exact confirmation and host binding",()=>{
    expect(()=>validateStagingEnvironment({})).toThrow();
    const e={
      S6_STAGING_DISPOSABLE_CONFIRMATION:"I_CONFIRM_DISPOSABLE_STAGING",
      S6_STAGING_SUPABASE_URL:"https://project.supabase.co/",
      S6_STAGING_EXPECTED_HOST:"another.supabase.co",
      S6_STAGING_SUPABASE_ANON_KEY:"test-nonsecret-value"
    };
    expect(()=>validateStagingEnvironment(e)).toThrow();
  });
  it("allows only read-only GET requests and does not infer full E2E PASS from probes",async()=>{
    const env={
      S6_STAGING_DISPOSABLE_CONFIRMATION:"I_CONFIRM_DISPOSABLE_STAGING",
      S6_STAGING_SUPABASE_URL:"https://project.supabase.co/",
      S6_STAGING_EXPECTED_HOST:"project.supabase.co",
      S6_STAGING_SUPABASE_ANON_KEY:"test-only"
    };
    const calls=[];
    const fakeFetch=async(u,init)=>{calls.push({url:String(u),method:init.method,redirect:init.redirect});
      return {status:403};};
    const got=await probeStagingAnon(env,fakeFetch);
    expect(got).toHaveLength(3);
    expect(got.every(v=>v.result==="PASS_DENIED")).toBe(true);
    expect(calls.every(v=>v.method==="GET"&&v.redirect==="manual")).toBe(true);
    expect(auditManifest(copy()).ready).toBe(false);
  });
});
