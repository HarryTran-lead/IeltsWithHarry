import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({viewer:vi.fn(),bankClient:vi.fn()}));
vi.mock("@/lib/ielts-bank/server",()=>({
 viewer:mocks.viewer,bankClient:mocks.bankClient,
 requestError:(e:unknown)=>Response.json({error:e instanceof Error?e.message:String(e)},{status:400})
}));
import {DELETE} from "@/app/api/speaking/s6/session/route";

const OWNER="11111111-1111-4111-8111-111111111111";
const SESSION="22222222-2222-4222-8222-222222222222";
const request=()=>new Request("https://staging.invalid/api/speaking/s6/session?attemptId="+SESSION,{method:"DELETE",headers:{"Origin":"https://staging.invalid"}});
const builder=(item:{id:string}|null)=>{
 const q={select:vi.fn(),eq:vi.fn(),is:vi.fn(),not:vi.fn(),update:vi.fn(),delete:vi.fn(),
  maybeSingle:vi.fn().mockResolvedValue({data:item,error:null}),error:null};
 q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.is.mockReturnValue(q);q.not.mockReturnValue(q);q.update.mockReturnValue(q);q.delete.mockReturnValue(q);
 return q;
};
describe("S6 learner privacy deletion API — mocked Supabase",()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.viewer.mockResolvedValue({id:OWNER});});
 it("deletes only the owning learner's three possible audio paths and session",async()=>{
  const q=builder({id:SESSION}),remove=vi.fn().mockResolvedValue({error:null}),storageFrom=vi.fn().mockReturnValue({remove});
  const from=vi.fn().mockReturnValue(q);
  mocks.bankClient.mockReturnValue({from,storage:{from:storageFrom}});
  const response=await DELETE(request());
  expect(response.status).toBe(200);
  expect(remove).toHaveBeenCalledWith([
   OWNER+"/"+SESSION+".webm",OWNER+"/"+SESSION+".mp4",OWNER+"/"+SESSION+".ogg"
  ]);
  expect(q.eq).toHaveBeenCalledWith("user_id",OWNER);
  expect(q.update).toHaveBeenCalledWith(expect.objectContaining({deletion_requested_at:expect.any(String)}));
  expect(q.is).toHaveBeenCalledWith("deletion_requested_at",null);
  expect(q.not).toHaveBeenCalledWith("deletion_requested_at","is",null);
  expect(q.delete).toHaveBeenCalledOnce();
 });
 it("never touches Storage if the attempt is not owned",async()=>{
  const q=builder(null),remove=vi.fn();
  mocks.bankClient.mockReturnValue({from:vi.fn().mockReturnValue(q),storage:{from:vi.fn().mockReturnValue({remove})}});
  const response=await DELETE(request());
  expect(response.status).toBe(404);
  expect(remove).not.toHaveBeenCalled();
  expect(q.delete).not.toHaveBeenCalled();
 });
 it("keeps the session row when audio deletion fails, so the user can retry",async()=>{
  const q=builder({id:SESSION}),remove=vi.fn().mockResolvedValue({error:{message:"storage unavailable"}});
  mocks.bankClient.mockReturnValue({from:vi.fn().mockReturnValue(q),storage:{from:vi.fn().mockReturnValue({remove})}});
  const response=await DELETE(request());
  expect(response.status).not.toBe(200);
  expect(q.delete).not.toHaveBeenCalled();
  expect(q.update).toHaveBeenCalledOnce();
 });
 it("retries an already-marked deletion without resetting the tombstone",async()=>{
  const q=builder({id:SESSION,deletion_requested_at:"2026-11-17T00:00:00Z"} as {id:string});
  const remove=vi.fn().mockResolvedValue({error:null});
  mocks.bankClient.mockReturnValue({from:vi.fn().mockReturnValue(q),storage:{from:vi.fn().mockReturnValue({remove})}});
  const response=await DELETE(request());
  expect(response.status).toBe(200);
  expect(q.update).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledOnce();
 });
});
