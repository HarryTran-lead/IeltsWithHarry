/** M11-L89 code-only candidate derived from L88. RLS is the authorization boundary. */
export type PrivateRow=Readonly<{session_id:string;answer_index:number;storage_path:string}>;
export type PrivateFailure="AUTH_REQUIRED"|"OWNER_MISMATCH"|"PATH_INVALID"|"FORBIDDEN"|"NOT_FOUND"|"SESSION_EXPIRED"|"RETRY_EXHAUSTED"|"MEDIA_INVALID"|"STALE_REQUEST"|"NETWORK_OR_STORAGE";
export type PrivateFetch={ok:true;blob:Blob;owner:string}|{ok:false;code:PrivateFailure};
export interface PrivateClient {
 auth:{getUser():Promise<{data:{user:{id:string}|null};error:unknown|null}>;refreshSession():Promise<{error:unknown|null}>};
 storage:{from(bucket:string):{download(path:string):Promise<{data:Blob|null;error:unknown|null}>}};
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTS=["webm","mp4","ogg"] as const;
export function ownedRecordingPath(owner:string,row:PrivateRow):string|null {
 if(!UUID.test(owner)||!UUID.test(row.session_id)||!Number.isInteger(row.answer_index)||row.answer_index<0||row.answer_index>49)return null;
 for(const ext of EXTS){const path=`${owner}/${row.session_id}/${row.answer_index}.${ext}`;if(row.storage_path===path)return path;}
 return null;
}
function status(error:unknown):number|null {
 if(!error||typeof error!=="object")return null;
 const e=error as {status?:unknown;statusCode?:unknown;code?:unknown};
 for(const raw of [e.statusCode,e.status,e.code]){const s=Number(raw);if(s===401||s===403||s===404)return s;}
 return null;
}
function validAudio(blob:Blob,path:string):boolean {
 const ext=path.split(".").at(-1);if(blob.size<=0||blob.size>10*1024*1024||!ext)return false;
 const mime=blob.type.split(";")[0].toLowerCase();return mime===""||mime===`audio/${ext}`;
}
/** Verify owner before/after private download, with at most one 401 refresh. */
export async function fetchPrivateAudio(client:PrivateClient,row:PrivateRow,isCurrent:()=>boolean):Promise<PrivateFetch>{
 const stale=():PrivateFetch=>({ok:false,code:"STALE_REQUEST"});
 const getOwner=async()=>{try{const result=await client.auth.getUser();return result.error?null:result.data.user?.id??null;}catch{return null;}};
 const owner=await getOwner();if(!isCurrent())return stale();if(!owner)return {ok:false,code:"AUTH_REQUIRED"};
 const path=ownedRecordingPath(owner,row);if(!path)return {ok:false,code:"PATH_INVALID"};
 const download=async()=>{try{return await client.storage.from("speaking-recordings").download(path);}catch{return {data:null,error:{code:"NETWORK"}};}};
 let result=await download();if(!isCurrent())return stale();
 if(result.error&&status(result.error)===401){
  let refreshed=false;try{const r=await client.auth.refreshSession();refreshed=!r.error;}catch{/* expired */}
  if(!isCurrent())return stale();if(!refreshed)return {ok:false,code:"SESSION_EXPIRED"};
  const renewed=await getOwner();if(!isCurrent())return stale();
  if(!renewed)return {ok:false,code:"SESSION_EXPIRED"};if(renewed!==owner)return {ok:false,code:"OWNER_MISMATCH"};
  result=await download();if(!isCurrent())return stale();
  if(result.error&&status(result.error)===401)return {ok:false,code:"RETRY_EXHAUSTED"};
 }
 if(result.error){const s=status(result.error);return {ok:false,code:s===403?"FORBIDDEN":s===404?"NOT_FOUND":"NETWORK_OR_STORAGE"};}
 if(!result.data||!validAudio(result.data,path))return {ok:false,code:"MEDIA_INVALID"};
 const after=await getOwner();if(!isCurrent())return stale();
 if(!after)return {ok:false,code:"SESSION_EXPIRED"};if(after!==owner)return {ok:false,code:"OWNER_MISMATCH"};
 return {ok:true,blob:result.data,owner};
}