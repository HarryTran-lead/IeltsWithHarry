import {describe,it,expect} from "vitest";
import {
  decodeStagingLearnerToken,validateL23Environment,planL23Probes,
  assessL23Response,inspectStudentContent,runL23Audit
} from "../scripts/speaking-s6-l23-rls-audit.mjs";

const HOST="disposable-speaking-s6.supabase.co";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const ATTEMPT_A="33333333-3333-4333-8333-333333333333";
const ATTEMPT_B="44444444-4444-4444-8444-444444444444";
const jwt=(sub,role="authenticated",host=HOST)=>[
 "eyJhbGciOiJIUzI1NiJ9",
 Buffer.from(JSON.stringify({sub,role,iss:"https://"+host+"/auth/v1",
   aud:"authenticated",exp:4102444800})).toString("base64url"),
 "signature-placeholder"
].join(".");
function env(mode="locked"){
 return {
  S6_STAGING_DISPOSABLE_CONFIRMATION:"I_CONFIRM_DISPOSABLE_STAGING",
  S6_STAGING_SUPABASE_URL:"https://"+HOST+"/",
  S6_STAGING_EXPECTED_HOST:HOST,
  S6_STAGING_SUPABASE_ANON_KEY:"fake-anon-test-only",
  S6_L23_LEARNER_A_JWT:jwt(A),
  S6_L23_LEARNER_B_JWT:jwt(B),
  S6_L23_ATTEMPT_A:ATTEMPT_A,
  S6_L23_ATTEMPT_B:ATTEMPT_B,
  S6_L23_REVISION:"R11",
  S6_L23_ACCESS_MODE:mode,
  S6_L23_DISPOSABLE_RELEASE_WINDOW:mode==="eligible"?"I_CONFIRMED_STAGING_ONLY_RELEASE":""
 };
}
describe("M10-L23 Speaking S6 authenticated RLS probe safety (mock transport, NOT live E2E)",()=>{
 it("rejects expired, foreign project and service-role tokens",()=>{
  expect(()=>decodeStagingLearnerToken(jwt(A,"service_role"),HOST)).toThrow();
  expect(()=>decodeStagingLearnerToken(jwt(A,"authenticated","other.supabase.co"),HOST)).toThrow();
  expect(()=>decodeStagingLearnerToken(jwt(A),HOST,4102444801*1000)).toThrow();
 });
 it("requires two distinct learner identities and seeded fixture IDs",()=>{
  const e=env();e.S6_L23_LEARNER_B_JWT=jwt(A);
  expect(()=>validateL23Environment(e)).toThrow();
  const f=env();f.S6_L23_ATTEMPT_A=f.S6_L23_ATTEMPT_B;
  expect(()=>validateL23Environment(f)).toThrow();
 });
 it("denies eligible-mode operation without separate staging-only approval",()=>{
  const e=env("eligible");delete e.S6_L23_DISPOSABLE_RELEASE_WINDOW;
  expect(()=>validateL23Environment(e)).toThrow();
  expect(validateL23Environment(env("eligible")).mode).toBe("eligible");
 });
 it("builds 16 read-only role/owner assertions, no mutation endpoints",()=>{
  const probes=planL23Probes(validateL23Environment(env()));
  expect(probes).toHaveLength(16);
  expect(probes.filter(p=>p.expectation==="DENIED")).toHaveLength(6);
  expect(probes.filter(p=>p.expectation==="ONE")).toHaveLength(4);
  expect(probes.filter(p=>p.expectation==="ZERO")).toHaveLength(6);
  expect(probes.every(p=>p.table.startsWith("speaking_s6_"))).toBe(true);
 });
 it("flags owner cross-access and forbidden Mastery answer fields",()=>{
  const probe={id:"A-OTHER-ATTEMPT",expectation:"ZERO"};
  expect(assessL23Response(probe,200,[{id:ATTEMPT_B}])).toBe("FAIL");
  const contents={guided:[],mastery:[{question_en:"A prompt",followup_en:"Secret follow-up"}]};
  expect(inspectStudentContent(contents).safe).toBe(false);
  expect(assessL23Response({expectation:"ONE",checkSecrets:true},200,[{student_content:contents}])).toBe("FAIL");
  expect(inspectStudentContent({guided:[{question_en:"A prompt"}]}).safe).toBe(true);
 });
 it("refuses 200 even with empty body for private bank, because grant should be revoked",()=>{
  expect(assessL23Response({expectation:"DENIED"},200,[])).toBe("FAIL");
  expect(assessL23Response({expectation:"DENIED"},403,null)).toBe("PASS");
 });
 it("makes exactly 16 GET requests, no redirect; reports PASS only for mocked probes",async()=>{
  const config=validateL23Environment(env());
  const calls=[];
  const transport=async(url,options)=>{
    const u=new URL(url);calls.push({method:options.method,redirect:options.redirect,uri:u.pathname,query:u.searchParams});
    const table=u.pathname.split("/").at(-1);
    const role=options.headers.Authorization==="Bearer "+config.a.token?"a":
      options.headers.Authorization==="Bearer "+config.b.token?"b":"anon";
    if(["speaking_s6_private_revisions","speaking_s6_release_gates"].includes(table))
      return {status:403};
    if(table==="speaking_s6_lesson_revisions")return {status:200,json:async()=>[]};
    const own=table==="speaking_s6_attempts"?
      (role==="a"?ATTEMPT_A:role==="b"?ATTEMPT_B:null):
      (role==="a"?A:role==="b"?B:null);
    const id=u.searchParams.get(table==="speaking_s6_attempts"?"id":"user_id");
    const data=id==="eq."+own?[{lesson_code:"S6-001"}]:[];
    return {status:200,json:async()=>data};
  };
  const report=await runL23Audit(config,transport);
  expect(report.test_count).toBe(16);
  expect(report.counts).toEqual({PASS:16,FAIL:0,BLOCKED:0});
  expect(report.full_e2e_cases_certified).toBe(0);
  expect(report.release_authorized).toBe(false);
  expect(calls).toHaveLength(16);
  expect(calls.every(x=>x.method==="GET"&&x.redirect==="manual")).toBe(true);
 });
});
