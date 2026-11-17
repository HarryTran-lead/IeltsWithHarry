"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { RecordingEpoch,normalizedAudioMime } from "@/lib/speaking-s6/recording-policy";

export function useLocalRecording(){
 const [recording,setRecording]=useState(false);
 const [blob,setBlob]=useState<Blob|null>(null);
 const [url,setUrl]=useState("");
 const [seconds,setSeconds]=useState(0);
 const [error,setError]=useState("");
 const epoch=useRef(new RecordingEpoch());
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const urlRef=useRef("");
 const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const stopTracks=useCallback(()=>{
   if(timer.current){clearInterval(timer.current);timer.current=null;}
   stream.current?.getTracks().forEach(track=>track.stop());
   stream.current=null;
 },[]);
 const clearUrl=useCallback(()=>{
   if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current="";}
   setUrl("");
 },[]);
 const invalidate=useCallback(()=>{
   epoch.current.next();
   const old=recorder.current;
   recorder.current=null;
   if(old && old.state!=="inactive"){try{old.stop();}catch{/* already stopped */}}
   stopTracks();
   if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current="";}
 },[stopTracks]);
 const reset=useCallback(()=>{
   invalidate();
   setBlob(null);setUrl("");setSeconds(0);setError("");setRecording(false);
 },[invalidate]);
 const stop=useCallback(()=>{
   if(recorder.current?.state==="recording"){try{recorder.current.stop();}catch{/* recorder already inactive */}}
 },[]);
 useEffect(()=>()=>{invalidate();},[invalidate]);
 const start=useCallback(async()=>{
   reset();
   if(typeof navigator==="undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined"){
     setError("Trình duyệt chưa hỗ trợ ghi âm. Hãy sử dụng HTTPS và cấp quyền micro.");return;
   }
   const token=epoch.current.next();
   let media:MediaStream|null=null;
   try{
     media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
     if(!epoch.current.current(token)){
       media.getTracks().forEach(track=>track.stop());return;
     }
     const types=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus","audio/webm"];
     const chosen=types.find(type=>MediaRecorder.isTypeSupported(type));
     const rec=new MediaRecorder(media,chosen?{mimeType:chosen}:undefined);
     const contentType=normalizedAudioMime(rec.mimeType);
     if(!contentType)throw new Error("Trình duyệt ghi ra định dạng chưa được hỗ trợ.");
     const started=Date.now();
     const parts:BlobPart[]=[];
     stream.current=media;
     recorder.current=rec;
     rec.ondataavailable=event=>{if(epoch.current.current(token)&&event.data.size>0)parts.push(event.data);};
     rec.onerror=()=>{
       if(!epoch.current.current(token))return;
       setError("Ghi âm thất bại. Hãy thử lại.");
       recorder.current=null;stopTracks();setRecording(false);
     };
     rec.onstop=()=>{
       if(!epoch.current.current(token))return;
       recorder.current=null;
       stopTracks();
       const made=new Blob(parts,{type:contentType});
       if(!made.size){setError("Bản ghi trống. Hãy kiểm tra micro.");}
       else{
         clearUrl();
         const link=URL.createObjectURL(made);
         urlRef.current=link;setBlob(made);setUrl(link);
       }
       setSeconds(Math.max(1,Math.ceil((Date.now()-started)/1000)));
       setRecording(false);
     };
     rec.start(250);setRecording(true);
     timer.current=setInterval(()=>{
       if(!epoch.current.current(token))return;
       const elapsed=Math.ceil((Date.now()-started)/1000);
       setSeconds(elapsed);
       if(elapsed>=120&&rec.state==="recording"){try{rec.stop();}catch{/* noop */}}
     },250);
   }catch(e){
     if(media)media.getTracks().forEach(track=>track.stop());
     if(!epoch.current.current(token))return;
     stopTracks();recorder.current=null;setRecording(false);
     setError(e instanceof Error?e.message:"Không mở được micro. Kiểm tra quyền truy cập.");
   }
 },[reset,stopTracks,clearUrl]);
 return {recording,blob,url,seconds,error,start,stop,reset};
}
