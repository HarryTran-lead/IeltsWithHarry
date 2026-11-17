import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  viewer:vi.fn(),bankClient:vi.fn(),s6AccessAllowed:vi.fn()
}));
vi.mock("@/lib/ielts-bank/server",()=>({
  viewer:mocks.viewer,bankClient:mocks.bankClient,
  requestError:(e:unknown)=>Response.json({error:String(e)},{status:400})
}));
vi.mock("@/lib/speaking-s6/access",()=>({
  s6AccessAllowed:mocks.s6AccessAllowed
}));
import {POST as sessionPOST,DELETE as sessionDELETE} from "@/app/api/speaking/s6/session/route";
import {POST as progressPOST} from "@/app/api/speaking/s6/progress/route";
import {POST as importPOST} from "@/app/api/admin/speaking-s6/import/route";

const paths=[
  ["/api/speaking/s6/session",sessionPOST],
  ["/api/speaking/s6/progress",progressPOST],
  ["/api/admin/speaking-s6/import",importPOST]
] as const;
function req(path:string,headers:Record<string,string>,method:"POST"|"DELETE"="POST"){
  return new Request("https://staging.invalid"+path,{
    method,headers,body:method==="POST"?"{}":undefined
  });
}
describe("M10-L25 real S6 routes use early fail-closed CSRF guards",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("rejects cross-origin POST on session, progress and import before auth/DB",async()=>{
   for(const [path,handler] of paths){
     const r=await handler(req(path,{
       Origin:"https://attacker.invalid","Content-Type":"application/json",
       "Sec-Fetch-Site":"cross-site"
     }));
     expect(r.status).toBe(403);
     expect(r.headers.get("Cache-Control")).toContain("no-store");
   }
   expect(mocks.viewer).not.toHaveBeenCalled();
   expect(mocks.bankClient).not.toHaveBeenCalled();
 });
 it("rejects JSON POST without browser provenance on all three routes",async()=>{
   for(const [path,handler] of paths){
     const r=await handler(req(path,{"Content-Type":"application/json"}));
     expect(r.status).toBe(403);
   }
   expect(mocks.viewer).not.toHaveBeenCalled();
 });
 it("requires application/json for all S6 POST endpoints",async()=>{
   for(const [path,handler] of paths){
     const r=await handler(req(path,{
       Origin:"https://staging.invalid","Content-Type":"text/plain"
     }));
     expect(r.status).toBe(415);
   }
   expect(mocks.viewer).not.toHaveBeenCalled();
 });
 it("denies cross-origin attempt DELETE before Storage or database access",async()=>{
   const r=await sessionDELETE(req(
     "/api/speaking/s6/session?attemptId=11111111-1111-4111-8111-111111111111",
     {Origin:"https://attacker.invalid"},"DELETE"
   ));
   expect(r.status).toBe(403);
   expect(mocks.viewer).not.toHaveBeenCalled();
   expect(mocks.bankClient).not.toHaveBeenCalled();
 });
});
