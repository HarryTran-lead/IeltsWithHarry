import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {auditL29Supplement,assessL29Readiness} from "../scripts/speaking-s6-l29-release-gate.mjs";

const base=JSON.parse(readFileSync("tests/speaking-s6/m10-l21-e2e-evidence.json","utf8"));
const extra=JSON.parse(readFileSync("tests/speaking-s6/m10-l29-e2e-addendum.json","utf8"));
const clone=x=>structuredClone(x);
const SHA="abcdef0123456789abcdef0123456789abcdef01";
const EVIDENCE="ev:private-reference-12345";
function approvedFixture(){
 const a=clone(base),b=clone(extra);
 const stamp="2026-11-17T03:00:00.000Z";
 for(const x of [...a.cases,...b.cases]){
   x.status="PASS";x.expected="No unsafe access";x.actual="Observed expected result";
   x.evidence=EVIDENCE;x.environment_id="disposable-s6-qa-1";
   x.reviewer="Independent reviewer";x.run_at_utc=stamp;
 }
 a.release_status="REVIEWED_FOR_RELEASE";
 a.signoffs=Object.fromEntries(["s5","teacher","audio","privacy","import"].map(
   key=>[key,{approved:true,reviewer:"Independent reviewer",evidence:EVIDENCE}]
 ));
 const review={
   candidate_sha:SHA,production_untouched:true,
   ci:{commit_sha:SHA,conclusion:"success",
     run_url:"https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/100001"},
   staging:{
     kind:"disposable_supabase",environment_id:"disposable-s6-qa-1",
     not_production:true,migrations_l14_to_l28_verified:true,
     cleanup:{attempts_zero:true,audio_objects_zero:true,test_accounts_removed:true,
       release_gates:{s5:false,teacher:false,audio:false,privacy:false,import:false}}
   }
 };
 return {a,b,review};
}
describe("M10-L29 evidence gate (synthetic fixtures, no actual E2E)",()=>{
 it("keeps the real manifest at HOLD: 38 + 12 unexecuted",()=>{
   expect(auditL29Supplement(extra)).toMatchObject({
     valid:true,ready:false,counts:{NOT_RUN:12,PASS:0}
   });
   const got=assessL29Readiness(base,extra,{});
   expect(got).toMatchObject({
     status:"HOLD",release_authorized:false,
     s7_unlock_authorized:false,actual_live_e2e_passes:0,expected_real_e2e_cases:50
   });
 });
 it("rejects wrong supplementary sequence, group totals and duplicates",()=>{
   const b=clone(extra);b.cases[1].id=b.cases[0].id;
   expect(auditL29Supplement(b).valid).toBe(false);
   const c=clone(extra);c.cases[0].area="Made-up";
   expect(auditL29Supplement(c).valid).toBe(false);
 });
 it("rejects PASS without actual evidence and exact redacted reference",()=>{
   const b=clone(extra);b.cases[0].status="PASS";
   expect(auditL29Supplement(b).valid).toBe(false);
   b.cases[0].expected="denied";b.cases[0].actual="denied";
   b.cases[0].environment_id="temp";b.cases[0].reviewer="QA";
   b.cases[0].run_at_utc="2026-11-17T03:00:00Z";
   b.cases[0].evidence="https://storage.example.com/private?token=leaked";
   expect(auditL29Supplement(b).valid).toBe(false);
 });
 it("requires 50 cases, five signoffs, disposal proof and exact CI commit",()=>{
   const {a,b,review}=approvedFixture();
   const out=assessL29Readiness(a,b,review);
   expect(out.status).toBe("READY_FOR_INDEPENDENT_HUMAN_REVIEW");
   expect(out.release_authorized).toBe(false);
   expect(out.s7_unlock_authorized).toBe(false);
   expect(out.actual_live_e2e_passes).toBe(50);
 });
 it("blocks candidates whose CI SHA differs from release candidate",()=>{
   const {a,b,review}=approvedFixture();review.ci.commit_sha="f".repeat(40);
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
 });
 it("blocks candidates with leftovers or open QA gates after cleanup",()=>{
   const {a,b,review}=approvedFixture();
   review.staging.cleanup.release_gates.privacy=true;
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
   review.staging.cleanup.release_gates.privacy=false;
   review.staging.cleanup.audio_objects_zero=false;
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
 });
 it("blocks staging evidence tied to multiple environments and unlocked S7",()=>{
   const {a,b,review}=approvedFixture();b.cases[0].environment_id="some-other-environment";
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
   b.cases[0].environment_id="disposable-s6-qa-1";
   a.s7_locked=false;
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
 });
 it("does not accept merely signed but otherwise unexecuted E2E cases",()=>{
   const {a,b,review}=approvedFixture();
   b.cases[3].status="NOT_RUN";
   expect(assessL29Readiness(a,b,review).status).toBe("HOLD");
 });
});
