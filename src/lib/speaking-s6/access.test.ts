import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { s6AccessAllowed } from "./access";
type Db = Parameters<typeof s6AccessAllowed>[2];
const mock=(gate:unknown, s5:unknown, s5Error=false)=>{
  const rpc=vi.fn().mockResolvedValue({data:gate,error:null});
  const maybeSingle=vi.fn().mockResolvedValue({data:s5===null?null:{s5_verified:s5},error:s5Error?{message:"failure"}:null});
  const eq=vi.fn().mockReturnValue({maybeSingle});
  const select=vi.fn().mockReturnValue({eq});
  const from=vi.fn().mockReturnValue({select});
  return {db:{rpc,from} as unknown as Db,rpc,from,eq};
};
describe("S6 user-level gate (mock API; not real RLS)",()=>{
 it("admin preview is authorized upstream",async()=>{
  const d=mock(false,null);expect(await s6AccessAllowed("admin",true,d.db)).toBe(true);expect(d.rpc).not.toHaveBeenCalled();
 });
 it("global hold denies all learners",async()=>{expect(await s6AccessAllowed("u",false,mock(false,true).db)).toBe(false);});
 it("missing S5 evidence denies learner",async()=>{expect(await s6AccessAllowed("u",false,mock(true,null).db)).toBe(false);});
 it("false S5 denies learner",async()=>{expect(await s6AccessAllowed("u",false,mock(true,false).db)).toBe(false);});
 it("S5 query error denies learner",async()=>{expect(await s6AccessAllowed("u",false,mock(true,true,true).db)).toBe(false);});
 it("both global QA and S5 are needed",async()=>{
  const d=mock(true,true);expect(await s6AccessAllowed("user-a",false,d.db)).toBe(true);
  expect(d.eq).toHaveBeenCalledWith("user_id","user-a");
 });
});
describe("Direct Supabase RLS regression (static SQL, not DB execution)",()=>{
 const sql=readFileSync("supabase/migrations/202611170005_speaking_s6_s5_rls_l17.sql","utf8");
 it("uses auth.uid to verify S5",()=>{
  for(const phrase of ["auth.uid()","e.s5_verified","e.verified_at is not null","e.verified_by is not null","e.evidence_reference"])
   expect(sql).toContain(phrase);
 });
 it("replaces published row policy with S5+QA predicate",()=>{
  expect(sql).toContain("public.speaking_s6_release_ready()");
  expect(sql).toContain("drop policy if exists speaking_s6_published_read");
  expect(sql).toContain("status='published' and public.speaking_s6_current_user_ready()");
 });
 it("does not publish or expose secrets",()=>{
  expect(sql).not.toMatch(/grant\s+select\s+on\s+public\.speaking_s6_private_revisions\s+to\s+(?:authenticated|anon)/i);
  expect(sql).not.toMatch(/update\s+public\.speaking_s6_release_gates\s+set/i);
 });
});
