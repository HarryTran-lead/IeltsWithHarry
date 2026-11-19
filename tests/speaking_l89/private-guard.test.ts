import {describe,it,expect} from "vitest";
import {fetchPrivateAudio,ownedRecordingPath,type PrivateClient} from "../../src/lib/speaking-l89-private-guard";
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const S="33333333-3333-4333-8333-333333333333";
const row=(id=A)=>({session_id:S,answer_index:2,storage_path:`${id}/${S}/2.webm`});
function harness(errors:number[]=[],refreshOk=true) {
 let id:string|null=A,n=0,refresh=0;let valid=true;
 const client:PrivateClient={
  auth:{getUser:async()=>({data:{user:id?{id}:null},error:null}),refreshSession:async()=>{refresh++;return {error:refreshOk?null:{status:401}}}},
  storage:{from:()=>({download:async()=>{n++;const status=errors.shift();return status?{data:null,error:{status}}:{data:new Blob(["hi"],{type:"audio/webm"}),error:null}}})}
 };
 return {client,get calls(){return n},get refreshes(){return refresh},switchTo:(next:string|null)=>{id=next},cancel:()=>{valid=false},current:()=>valid};
}
describe("L89 private playback adapter",()=>{
 it("rejects wrong owner and path traversal",()=>{expect(ownedRecordingPath(A,row(B))).toBeNull();expect(ownedRecordingPath(A,{...row(),storage_path:`${A}/../x`})).toBeNull()});
 it("accepts owned media",async()=>{const h=harness();expect((await fetchPrivateAudio(h.client,row(),h.current)).ok).toBe(true);expect(h.calls).toBe(1)});
 it("refreshes only once after 401",async()=>{const h=harness([401]);expect((await fetchPrivateAudio(h.client,row(),h.current)).ok).toBe(true);expect(h.calls).toBe(2);expect(h.refreshes).toBe(1)});
 it("does not retry 403",async()=>{const h=harness([403]);expect(await fetchPrivateAudio(h.client,row(),h.current)).toEqual({ok:false,code:"FORBIDDEN"});expect(h.refreshes).toBe(0)});
 it("no cross-account download",async()=>{const h=harness();h.switchTo(B);expect(await fetchPrivateAudio(h.client,row(A),h.current)).toEqual({ok:false,code:"PATH_INVALID"});expect(h.calls).toBe(0)});
 it("fails closed if refresh fails",async()=>{const h=harness([401],false);expect(await fetchPrivateAudio(h.client,row(),h.current)).toEqual({ok:false,code:"SESSION_EXPIRED"});expect(h.calls).toBe(1)});
 it("rejects stale response",async()=>{const h=harness();h.cancel();expect(await fetchPrivateAudio(h.client,row(),h.current)).toEqual({ok:false,code:"STALE_REQUEST"})});
 it("rejects missing account",async()=>{const h=harness();h.switchTo(null);expect(await fetchPrivateAudio(h.client,row(),h.current)).toEqual({ok:false,code:"AUTH_REQUIRED"})});
});