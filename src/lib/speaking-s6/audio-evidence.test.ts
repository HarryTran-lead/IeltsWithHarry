import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fingerprintS6StoredAudio } from "./audio-evidence";

const USER="11111111-1111-4111-8111-111111111111";
const ATTEMPT="22222222-2222-4222-8222-222222222222";
const cases=[
  {ext:"webm",head:[0x1a,0x45,0xdf,0xa3],mime:"audio/webm"},
  {ext:"ogg",head:[0x4f,0x67,0x67,0x53],mime:"audio/ogg"},
  {ext:"mp4",head:[0,0,0,24,0x66,0x74,0x79,0x70],mime:"audio/mp4"}
] as const;
const bytes=(head:readonly number[])=>{
  const v=new Uint8Array(512);
  v.set(head);v.fill(11,Math.max(head.length,12));
  return v;
};
function mockStorage({
 ext="webm",head=[0x1a,0x45,0xdf,0xa3],name=ATTEMPT+".webm",
 names=[name],size=512,listError=false,downloadError=false,mime
}:{
 ext?:string;head?:readonly number[];name?:string;names?:string[];
 size?:number;listError?:boolean;downloadError?:boolean;mime?:string
}={}) {
 const content=bytes(head);
 const list=vi.fn().mockResolvedValue(listError?
   {data:null,error:{message:"Storage unavailable"}}:
   {data:names.map(n=>({name:n,metadata:{size,mimetype:mime??"audio/"+ext}})),error:null});
 const download=vi.fn().mockResolvedValue(downloadError?
   {data:null,error:{message:"Storage unavailable"}}:
   {data:new Blob([content],{type:"audio/"+ext}),error:null});
 const from=vi.fn().mockReturnValue({list,download});
 return {from,list,download};
}
describe("M10-L27 consented audio byte integrity (mock Storage; not a speech detector)",()=>{
 for(const fixture of cases)it("hashes an actual "+fixture.mime+" blob with matching header",async()=>{
   const storage=mockStorage({
     ext:fixture.ext,name:ATTEMPT+"."+fixture.ext,names:[ATTEMPT+"."+fixture.ext],
     head:fixture.head
   });
   const evidence=await fingerprintS6StoredAudio(storage as never,USER,ATTEMPT);
   expect(evidence).toMatchObject({
     audio_evidence_state:"stored_hash_recorded",
     audio_evidence_bytes:512,audio_evidence_mime:fixture.mime,
     audio_evidence_sha256:createHash("sha256").update(bytes(fixture.head)).digest("hex")
   });
   expect(storage.list).toHaveBeenCalledWith(USER,{search:ATTEMPT,limit:100});
   expect(storage.download).toHaveBeenCalledWith(USER+"/"+ATTEMPT+"."+fixture.ext);
 });
 it("rejects a missing upload without inventing an audio proof",async()=>{
   const storage=mockStorage({names:[]});
   await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_UPLOAD_REQUIRED"});
   expect(storage.download).not.toHaveBeenCalled();
 });
 it("rejects ambiguous upload files for the same attempt",async()=>{
   const storage=mockStorage({names:[ATTEMPT+".webm",ATTEMPT+".ogg"]});
   await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_FILE_AMBIGUOUS"});
   expect(storage.download).not.toHaveBeenCalled();
 });
 it("rejects a MIME/extension mismatch before a download",async()=>{
   const storage=mockStorage({mime:"audio/ogg"});
   await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_INVALID_FORMAT"});
   expect(storage.download).not.toHaveBeenCalled();
 });
 it("rejects file header spoofing inconsistent with declared format",async()=>{
   const storage=mockStorage({head:[0,0,0,0]});
   await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_INVALID_FORMAT"});
 });
 it("rejects missing/oversized/undersized files without confirming evidence",async()=>{
   const tiny=mockStorage({size:100});
   await expect(fingerprintS6StoredAudio(tiny as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_TOO_LARGE"});
   const huge=mockStorage({size:11*1024*1024});
   await expect(fingerprintS6StoredAudio(huge as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_TOO_LARGE"});
 });
 it("returns a controlled error when Storage is down",async()=>{
   for(const storage of [mockStorage({listError:true}),mockStorage({downloadError:true})]){
     await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
       .rejects.toMatchObject({code:"AUDIO_STORAGE_UNAVAILABLE"});
   }
 });
 it("does not incorrectly confuse a UUID prefix with the exact attempt filename",async()=>{
   const storage=mockStorage({names:[ATTEMPT+"-extra.webm"]});
   await expect(fingerprintS6StoredAudio(storage as never,USER,ATTEMPT))
     .rejects.toMatchObject({code:"AUDIO_UPLOAD_REQUIRED"});
 });
});
