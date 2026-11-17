import {describe,it,expect} from "vitest";
import {RecordingEpoch,normalizedAudioMime,speakingS6UploadDescriptor,S6_MAX_AUDIO_BYTES,sameUploadedTake} from "./recording-policy";
const user="11111111-1111-4111-8111-111111111111";
const attempt="22222222-2222-4222-8222-222222222222";
describe("S6 local recording privacy policy",()=>{
 it("accepts browser codec parameters and exact allowed MIME",()=>{
  expect(normalizedAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
  expect(normalizedAudioMime(" AUDIO/MP4 ")).toBe("audio/mp4");
  expect(normalizedAudioMime("audio/ogg; codecs=opus")).toBe("audio/ogg");
  expect(normalizedAudioMime("video/mp4")).toBeNull();
  expect(normalizedAudioMime("audio/wav")).toBeNull();
 });
 it("produces a private, owner-namespaced path for browser formats",()=>{
  expect(speakingS6UploadDescriptor(user,attempt,"audio/mp4",100).path).toBe(user+"/"+attempt+".mp4");
  expect(speakingS6UploadDescriptor(user,attempt,"audio/webm;codecs=opus",100).contentType).toBe("audio/webm");
  expect(speakingS6UploadDescriptor(user,attempt,"audio/ogg",100).path).toMatch(/\.ogg$/);
 });
 it("rejects unsupported or oversized audio before touching storage",()=>{
  expect(()=>speakingS6UploadDescriptor(user,attempt,"audio/wav",100)).toThrow("S6_UNSUPPORTED_AUDIO_FORMAT");
  expect(()=>speakingS6UploadDescriptor(user,attempt,"audio/webm",0)).toThrow("S6_AUDIO_SIZE_INVALID");
  expect(()=>speakingS6UploadDescriptor(user,attempt,"audio/webm",S6_MAX_AUDIO_BYTES+1)).toThrow("S6_AUDIO_SIZE_INVALID");
 });
 it("rejects spoofed or unsafe path fragments",()=>{
  expect(()=>speakingS6UploadDescriptor("../another",attempt,"audio/mp4",100)).toThrow("S6_AUDIO_PATH_INVALID");
  expect(()=>speakingS6UploadDescriptor(user,"not-a-uuid","audio/mp4",100)).toThrow("S6_AUDIO_PATH_INVALID");
 });
 it("does not silently submit a new take against audio that was previously uploaded",()=>{
  const first=new Blob(["one"],{type:"audio/webm"}),second=new Blob(["two"],{type:"audio/webm"});
  expect(sameUploadedTake(attempt,attempt,first,first)).toBe(true);
  expect(sameUploadedTake(attempt,attempt,first,second)).toBe(false);
  expect(sameUploadedTake(attempt,"33333333-3333-4333-8333-333333333333",first,first)).toBe(false);
 });
 it("L31: a failed MediaRecorder epoch rejects late dataavailable/onstop callbacks",()=>{
  const epoch=new RecordingEpoch();
  const failedTake=epoch.next();
  expect(epoch.current(failedTake)).toBe(true);
  expect(epoch.fail(failedTake)).toBe(true);
  // A late onstop from the failed recorder MUST NOT publish a new Blob.
  expect(epoch.current(failedTake)).toBe(false);
  expect(epoch.fail(failedTake)).toBe(false);
  const newTake=epoch.next();
  expect(epoch.current(newTake)).toBe(true);
  expect(epoch.fail(failedTake)).toBe(false);
  expect(epoch.current(newTake)).toBe(true);
 });
 it("invalidates stale onstop callbacks when user cancels or starts a new take",()=>{
  const e=new RecordingEpoch();
  const first=e.next();expect(e.current(first)).toBe(true);
  e.next();expect(e.current(first)).toBe(false);
  const latest=e.next();expect(e.current(latest)).toBe(true);
  expect(e.current(first)).toBe(false);
 });
});
