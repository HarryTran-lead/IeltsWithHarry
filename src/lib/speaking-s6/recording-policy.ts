/** Pure safety checks for microphone recordings before optional private upload. */
export const S6_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export type S6AudioMime = "audio/webm" | "audio/mp4" | "audio/ogg";
export function normalizedAudioMime(mimeType:string):S6AudioMime|null {
 const short=mimeType.toLowerCase().split(";")[0].trim();
 return short==="audio/webm" || short==="audio/mp4" || short==="audio/ogg" ? short : null;
}
export function speakingS6UploadDescriptor(userId:string,attemptId:string,mime:string,size:number){
 const kind=normalizedAudioMime(mime);
 if(!kind)throw new Error("S6_UNSUPPORTED_AUDIO_FORMAT");
 if(!Number.isSafeInteger(size)||size<=0||size>S6_MAX_AUDIO_BYTES)throw new Error("S6_AUDIO_SIZE_INVALID");
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(userId)||!uuid.test(attemptId))throw new Error("S6_AUDIO_PATH_INVALID");
 const extension=kind==="audio/mp4"?"mp4":kind==="audio/ogg"?"ogg":"webm";
 return {path:userId+"/"+attemptId+"."+extension,contentType:kind};
}
/** A recorder event is valid only for the capture that produced it.
 * Clearing a take increments the epoch so late onstop/ondataavailable are discarded.
 */
export class RecordingEpoch {
 private number=0;
 next(){return ++this.number;}
 current(token:number){return token===this.number;}
}
