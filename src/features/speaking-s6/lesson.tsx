"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { reviewDueAt,reviewIsDue } from "@/lib/speaking-s6/review";
import "./lesson.css";

type Step={step:number;title_vi?:string;title_en?:string;instruction_vi?:string;instruction_en?:string;learner_action_vi?:string;learning_content?:Record<string,unknown>};
type Hint={level:number;kind:string;text_en?:string;text_vi?:string};
type Guided={activity_id:string;question_en:string;part?:string;cue_card_bullets_en?:string[]|null;hints:Hint[]};
type PrivateStub={activity_id:string;mode:string};
type Review={day_offset:number;task_vi?:string};
type Lesson={lesson_id:string;title_en:string;title_vi:string;steps:Step[];guided:Guided[];
 independent:PrivateStub[];mastery:PrivateStub[];spaced_review:Review[]};
type Progress={completed_steps:number[];current_step:number;review_anchor:string|null;completed_reviews:number[]};
type Attempt={attemptId:string;mode:"guided"|"independent"|"mastery";question:string;submitted:boolean;uploadAudioConsent:boolean};
type Feedback={model?:string;translation_vi?:string;explanation_en?:string;explanation_vi?:string};
type ApiError={error?:string};
type SessionReply={attemptId:string;mode:Attempt["mode"];question:string};

const base="/api/speaking/s6";
async function jsonRequest<T>(url:string,options?:RequestInit):Promise<T>{
 const response=await fetch(url,{cache:"no-store",...options});
 let body:Record<string,unknown>;
 try{body=await response.json() as Record<string,unknown>;}catch{throw Error("Không đọc được phản hồi máy chủ.");}
 if(!response.ok)throw Error(String(body.error??"REQUEST_FAILED")+" ("+response.status+")");
 return body as T;
}
const reqBody=(value:unknown):RequestInit=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});

function useLocalRecording(){
 const [recording,setRecording]=useState(false);
 const [blob,setBlob]=useState<Blob|null>(null);
 const [url,setUrl]=useState("");
 const [seconds,setSeconds]=useState(0);
 const [error,setError]=useState("");
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const urlRef=useRef("");
 const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const started=useRef(0);
 const clearUrl=useCallback(()=>{
   if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current="";}
   setUrl("");
 },[]);
 const cleanup=useCallback(()=>{
   if(timer.current){clearInterval(timer.current);timer.current=null;}
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
 },[]);
 const stop=useCallback(()=>{if(recorder.current?.state==="recording")recorder.current.stop();},[]);
 const reset=useCallback(()=>{
   stop();cleanup();clearUrl();setBlob(null);setSeconds(0);setError("");setRecording(false);
 },[stop,cleanup,clearUrl]);
 useEffect(()=>()=>{stop();cleanup();if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[stop,cleanup]);
 const start=useCallback(async()=>{
   if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
     setError("Trình duyệt không hỗ trợ ghi âm. Hãy thử HTTPS và cho phép dùng micro.");return;
   }
   try{
     stop();cleanup();clearUrl();setBlob(null);setSeconds(0);setError("");
     const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
     stream.current=media;
     const types=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus","audio/webm"];
     const chosen=types.find(type=>MediaRecorder.isTypeSupported(type));
     const rec=new MediaRecorder(media,chosen?{mimeType:chosen}:undefined);
     const parts:BlobPart[]=[];
     rec.ondataavailable=e=>{if(e.data.size>0)parts.push(e.data);};
     rec.onerror=()=>{setError("Ghi âm lỗi. Vui lòng thử lại.");cleanup();setRecording(false);};
     rec.onstop=()=>{
       const made=new Blob(parts,{type:rec.mimeType||"audio/webm"});
       if(made.size>0){const u=URL.createObjectURL(made);urlRef.current=u;setBlob(made);setUrl(u);}
       else setError("Bản ghi trống. Hãy kiểm tra micro.");
       setSeconds(Math.max(1,Math.ceil((Date.now()-started.current)/1000)));
       setRecording(false);cleanup();
     };
     recorder.current=rec;started.current=Date.now();rec.start(250);setRecording(true);
     timer.current=setInterval(()=>{
       const elapsed=Math.ceil((Date.now()-started.current)/1000);
       setSeconds(elapsed);
       if(elapsed>=120 && rec.state==="recording")rec.stop();
     },250);
   }catch{cleanup();setRecording(false);setError("Không mở được micro. Kiểm tra quyền truy cập micro và thử lại.");}
 },[stop,cleanup,clearUrl]);
 return {recording,blob,url,seconds,error,start,stop,reset};
}
function prettyError(error:unknown){
 const text=error instanceof Error?error.message:String(error);
 const labels:Record<string,string>={
  "S6_LOCKED":"Stage S6 chưa được mở khóa.","NOT_AVAILABLE":"Bài chưa được phát hành.",
  "ADD_ONLY_CONFLICT":"Bài đã tồn tại.","SUBMISSION_REQUIRED":"Cần nộp lượt nói đầu tiên trước.",
  "REVIEW_NOT_DUE":"Chưa đến ngày ôn.","FINISH_STEPS_FIRST":"Cần hoàn tất các bước học trước.",
  "ALREADY_SUBMITTED":"Lượt trả lời đã được nộp.","S6_NOT_PUBLISHED":"Bài hiện chưa mở cho học viên.",
  "STEP_OUT_OF_SEQUENCE":"Hãy đánh dấu hoàn thành bước trước đó trước khi tiếp tục."
 };
 const key=text.split(" (")[0];return labels[key]??text;
}
export function SpeakingS6Lesson({lessonId,preview}:{lessonId:string;preview:boolean}){
 const [lesson,setLesson]=useState<Lesson|null>(null);
 const [progress,setProgress]=useState<Progress|null>(null);
 const [step,setStep]=useState(1);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [active,setActive]=useState<Attempt|null>(null);
 const [feedback,setFeedback]=useState<Feedback|null>(null);
 const [followup,setFollowup]=useState<string|null>(null);
 const [selected,setSelected]=useState("");
 const [consent,setConsent]=useState(false);
 const [notes,setNotes]=useState("");
 const rec=useLocalRecording();
 const uploadedFor=useRef<string>("");
 const suffix=preview?"&preview=true":"&preview=false";
 const resetExercise=()=>{setActive(null);setFeedback(null);setFollowup(null);setSelected("");setNotes("");setConsent(false);uploadedFor.current="";rec.reset();};
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   setLoading(true);setError("");
   try{
    const [a,b]=await Promise.all([
     jsonRequest<{lesson:Lesson}>(base+"/lesson?lessonId="+encodeURIComponent(lessonId)+suffix),
     jsonRequest<{progress:Progress}>(base+"/progress?lessonId="+encodeURIComponent(lessonId)+suffix)
    ]);
    if(cancelled)return;
    setLesson(a.lesson);setProgress(b.progress);setStep(b.progress.current_step);
   }catch(e){if(!cancelled)setError(prettyError(e));}
   finally{if(!cancelled)setLoading(false);}
  })();
  return()=>{cancelled=true;};
 },[lessonId,suffix]);
 const markStep=async()=>{
  setBusy(true);setError("");setMessage("");
  try{
   const r=await jsonRequest<{progress:Progress}>(base+"/progress",reqBody({action:"completeStep",lessonId,preview,step}));
   setProgress(r.progress);setMessage("Đã lưu tiến độ tự học. Đây không phải kết quả chấm band.");
   setStep(Math.min(10,step+1));resetExercise();
  }catch(e){setError(prettyError(e));}finally{setBusy(false);}
 };
 const changeStep=(n:number)=>{
  if(rec.recording){setError("Hãy dừng ghi âm trước khi chuyển bước.");return;}
  setStep(n);resetExercise();setMessage("");setError("");
 };
 const group=step===6?"guided":step===7?"independent":step===8?"mastery":null;
 const activities=group&&lesson?lesson[group]:[];
 const selectedActivity=group==="guided"?lesson?.guided.find(x=>x.activity_id===selected):null;
 const begin=async(id:string)=>{
  if(rec.recording)return;
  setBusy(true);setError("");setMessage("");resetExercise();setSelected(id);
  try{
   const r=await jsonRequest<SessionReply>(base+"/session",reqBody({
     action:"start",lessonId,activityId:id,audioStorageConsent:consent,preview
   }));
   setActive({...r,submitted:false,uploadAudioConsent:consent});setMessage("Đề đã mở từ server. Hãy ghi âm rồi nộp.");
  }catch(e){setError(prettyError(e));}finally{setBusy(false);}
 };
 const submit=async()=>{
  if(!active||active.submitted||!rec.blob||rec.recording){setError("Cần ghi âm và dừng ghi trước khi nộp.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   if(active.uploadAudioConsent && uploadedFor.current!==active.attemptId){
    const browser=createClient();const auth=await browser.auth.getUser();const uid=auth.data.user?.id;
    if(auth.error||!uid)throw Error("Phiên đăng nhập không hợp lệ.");
    const mime=rec.blob.type.split(";")[0];
    const ext=mime==="audio/mp4"?"mp4":mime==="audio/ogg"?"ogg":"webm";
    const path=uid+"/"+active.attemptId+"."+ext;
    const result=await browser.storage.from("speaking-s6-recordings").upload(path,rec.blob,{contentType:mime,upsert:false});
    if(result.error)throw Error("Tải ghi âm lên storage thất bại: "+result.error.message);
    uploadedFor.current=active.attemptId;
   }
   await jsonRequest(base+"/session",reqBody({action:"submit",attemptId:active.attemptId,
     transcript:notes.trim(),durationSeconds:Math.max(1,Math.min(180,rec.seconds)),preview}));
   setActive({...active,submitted:true});
   setMessage("Đã nộp lượt nói. Không có chấm điểm band tự động.");
   if(active.mode==="guided"){
    const reply=await jsonRequest<Feedback>(base+"/session",reqBody({
      action:"guidedFeedback",attemptId:active.attemptId,preview
    }));
    setFeedback(reply);
   }
  }catch(e){setError(prettyError(e));}finally{setBusy(false);}
 };
 const getFollowup=async()=>{
  if(!active?.submitted)return;
  setBusy(true);setError("");
  try{
   const r=await jsonRequest<{followup:string|null}>(base+"/session",reqBody({
     action:"followup",attemptId:active.attemptId,preview
   }));
   setFollowup(r.followup??"Bài này không có câu hỏi phụ.");
  }catch(e){setError(prettyError(e));}finally{setBusy(false);}
 };
 const reviewDone=async(dayOffset:2|7|21)=>{
  if(rec.recording||!rec.blob||rec.seconds<10){setError("Hãy ghi âm ít nhất 10 giây trước khi đánh dấu ôn xong.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const r=await jsonRequest<{progress:Progress}>(base+"/progress",reqBody({
     action:"completeReview",lessonId,preview,dayOffset,recordingSeconds:rec.seconds
   }));
   setProgress(r.progress);setMessage("Đã lưu lần ôn (tự báo cáo, không phải chấm IELTS).");rec.reset();
  }catch(e){setError(prettyError(e));}finally{setBusy(false);}
 };
 if(loading)return <main className="s6-page"><p>Đang tải Speaking S6…</p></main>;
 if(!lesson)return <main className="s6-page"><h1>Speaking S6 chưa khả dụng</h1>
   <p role="alert">{error||"Chưa có nội dung."}</p><p>Stage S6 vẫn khóa cho học viên cho tới khi đủ điều kiện QA và S5.</p></main>;
 const current=lesson.steps.find(s=>s.step===step)??lesson.steps[step-1];
 return <main className="s6-page">
  <header className="s6-head">
   <div><p className="s6-eyebrow">{preview?"ADMIN STAGING PREVIEW":"SPEAKING S6 · SELF-STUDY"}</p>
    <h1>{lesson.lesson_id} — {lesson.title_vi}</h1><p>{lesson.title_en}</p></div>
   <span className="s6-status">{preview?"BẢN XEM THỬ · CHƯA PHÁT HÀNH":"Không chấm band tự động"}</span>
  </header>
  <p className="s6-disclaimer">Học viên học theo bước, luyện ghi âm và tự kiểm tra. Tiến độ không đồng nghĩa với chứng nhận IELTS hoặc quyền mở Stage S7.</p>
  <div className="s6-layout">
   <nav className="s6-steps" aria-label="10 bước tự học">
    <p><strong>Tiến độ: {progress?.completed_steps.length??0}/10 bước</strong></p>
    {lesson.steps.map(s=><button className={step===s.step?"s6-step active":"s6-step"} key={s.step}
     disabled={rec.recording} type="button" aria-current={step===s.step?"step":undefined}
     onClick={()=>changeStep(s.step)}>
      <span className="s6-step-number">{s.step}</span><span>{s.title_vi??s.title_en}</span>
      <span aria-label={progress?.completed_steps.includes(s.step)?"đã đánh dấu hoàn tất":""}>
       {progress?.completed_steps.includes(s.step)?"✓":""}</span>
    </button>)}
   </nav>
   <article className="s6-main">
    <div className="s6-step-head"><span>BƯỚC {step.toString().padStart(2,"0")} / 10</span>
     <h2>{current?.title_vi??current?.title_en}</h2>
     <p>{current?.instruction_vi}</p><p className="s6-muted">{current?.instruction_en}</p>
    </div>
    {current?.learning_content && Object.keys(current.learning_content).length>0 &&
      <LearningContent key={lessonId+"-"+step} content={current.learning_content} />}
    {step===2&&<section className="s6-card"><h3>Ghi âm chẩn đoán</h3>
      <p>Trả lời câu này trước khi xem lời giải:</p><blockquote>{lesson.guided[0]?.question_en}</blockquote>
      <RecorderControls rec={rec} />
      <p className="s6-muted">Bản ghi chẩn đoán chỉ ở trong trình duyệt tại thời điểm này, không tự tải lên server.</p>
    </section>}
    {(step===6||step===7||step===8)&&<section className="s6-card">
     <h3>{group==="guided"?"Guided — 4 câu có gợi ý":group==="independent"?"Independent — 3 câu độc lập":"Mastery — 2 câu chưa xem trước"}</h3>
     <p className="s6-muted">{group==="guided"?"Chọn câu, xem gợi ý từng tầng. Lời giải chỉ mở sau khi nộp lượt nói.":
       "Câu hỏi được gửi từ server sau khi bắt đầu. Không hiển thị đáp án trước bài đánh giá."}</p>
     <div className="s6-activity-list">{activities.map(a=><button type="button" key={a.activity_id}
       disabled={busy||rec.recording||Boolean(active&&!active.submitted)} className={a.activity_id===selected?"active":""}
       onClick={()=>begin(a.activity_id)}>{a.activity_id.split("-").at(-1)} {group==="guided"?"· "+(a as Guided).question_en:"· Bắt đầu câu chưa xem trước"}</button>)}</div>
     {!active&&<label className="s6-check"><input type="checkbox" checked={consent}
        onChange={e=>setConsent(e.target.checked)} disabled={busy}/> Đồng ý lưu bản ghi âm riêng tư lên Supabase Storage (không bắt buộc)</label>}
     {active&&<div className="s6-attempt">
      <p className="s6-eyebrow">Câu hỏi từ server · {active.mode}</p><blockquote>{active.question}</blockquote>
      {group==="guided"&&selectedActivity?.part==="P2"&&<CuePrep key={selectedActivity.activity_id} bullets={selectedActivity.cue_card_bullets_en??[]}/>}
      {group==="guided"&&selectedActivity&&<HintPanel key={selectedActivity.activity_id} hints={selectedActivity.hints}/>}
      <RecorderControls rec={rec}/>
      <label className="s6-note-label">Ghi chú hoặc bản chép tay (không thay thế bằng chứng âm thanh)
       <textarea value={notes} disabled={active.submitted} onChange={e=>setNotes(e.target.value)}
        rows={3} placeholder="Tự ghi lại ý hoặc lỗi cần sửa…"/></label>
      <button type="button" className="s6-primary" disabled={busy||active.submitted||!rec.blob||rec.recording}
       onClick={submit}>{busy?"Đang xử lý…":"Nộp lượt nói"}</button>
      {active.submitted&&<p className="s6-success">Đã nộp. Kết quả được lưu là bài thực hành, không có band score.</p>}
      {feedback&&<div className="s6-feedback"><h4>Lời giải sau khi nộp</h4>
       <p><strong>Model (EN):</strong> {feedback.model}</p>
       <p><strong>Dịch nghĩa (VI):</strong> {feedback.translation_vi}</p>
       <p><strong>Explanation (EN):</strong> {feedback.explanation_en}</p>
       <p><strong>Giải thích (VI):</strong> {feedback.explanation_vi}</p></div>}
      {active.submitted&&group==="mastery"&&<button type="button" onClick={getFollowup} disabled={busy||Boolean(followup)}>
        Mở câu hỏi phụ sau lượt nói đầu tiên</button>}
      {followup&&<blockquote>{followup}</blockquote>}
     </div>}
    </section>}
    {step===9&&<section className="s6-card"><h3>Nhật ký sửa lỗi</h3>
      <p>Nghe lại bản ghi: chọn một lỗi quan trọng, nói lại câu đúng, so sánh độ rõ và tính mạch lạc. Không cần tự sửa mọi lỗi giữa câu.</p>
      <textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder="Lỗi cụ thể → bằng chứng trong câu mình nói → cách sửa → bài luyện chuyển giao"/>
      <RecorderControls rec={rec}/>
    </section>}
    {step===10&&<section className="s6-card"><h3>Ôn cách quãng +2 / +7 / +21</h3>
      <p>Ngày ôn được tính sau khi hoàn tất bước 10. Mỗi lần ôn cần ghi âm câu mới và tự đánh giá.</p>
      <div className="s6-review-list">{lesson.spaced_review.map(r=>{
       const offset=r.day_offset as 2|7|21;
       const done=progress?.completed_reviews.includes(offset)??false;
       const due=progress?.review_anchor?reviewIsDue(progress.review_anchor,offset):false;
       return <div className="s6-review" key={offset}><div><strong>Ngày +{offset}</strong>
         <p>{r.task_vi}</p><small>{progress?.review_anchor?"Đến hạn: "+reviewDueAt(progress.review_anchor,offset).toLocaleDateString("vi-VN"):"Chưa bắt đầu lịch ôn"}</small></div>
         <button disabled={!due||done||busy||!rec.blob||rec.seconds<10||rec.recording} onClick={()=>reviewDone(offset)} type="button">
          {done?"Đã ôn":due?"Xác nhận ôn xong":"Chưa đến hạn"}</button></div>;
      })}</div><RecorderControls rec={rec}/>
    </section>}
    {message&&<p className="s6-success" role="status">{message}</p>}
    {error&&<p className="s6-error" role="alert">{error}</p>}
    <div className="s6-actions">
     <button type="button" onClick={()=>changeStep(Math.max(1,step-1))} disabled={step===1||busy||rec.recording}>Bước trước</button>
     <button className="s6-primary" type="button" onClick={markStep}
       disabled={busy||rec.recording||Boolean(active&&!active.submitted)}>
       {progress?.completed_steps.includes(step)?"Lưu tiến độ & tiếp tục":"Đánh dấu đã học bước này"}</button>
    </div>
   </article>
  </div>
 </main>;
}

type Recorder=ReturnType<typeof useLocalRecording>;
function RecorderControls({rec}:{rec:Recorder}){
 return <div className="s6-record">
  <div className="s6-record-actions">
   <button type="button" onClick={()=>void rec.start()} disabled={rec.recording}>● Bắt đầu ghi âm</button>
   <button type="button" onClick={rec.stop} disabled={!rec.recording}>■ Dừng ghi âm</button>
   <span>{rec.recording?"Đang ghi":"Thời lượng"} · {rec.seconds}s</span>
  </div>
  {rec.url&&<audio controls preload="metadata" src={rec.url} aria-label="Nghe lại bản ghi Speaking"/>}
  {rec.error&&<p className="s6-error" role="alert">{rec.error}</p>}
 </div>;
}
function HintPanel({hints}:{hints:Hint[]}){
 const [shown,setShown]=useState(0);
 const sorted=[...hints].sort((a,b)=>a.level-b.level);
 return <div className="s6-hints"><p>Gợi ý mở dần — không cần mở hết nếu đã tự nói được</p>
  {sorted.slice(0,shown).map(h=><p key={h.level}><strong>{h.kind}:</strong> {h.text_vi||h.text_en||"Lấy một ví dụ cụ thể."}</p>)}
  {shown<sorted.length&&<button type="button" onClick={()=>setShown(x=>Math.min(sorted.length,x+1))}>Mở gợi ý {shown+1}/3</button>}
 </div>;
}


const lessonFieldLabels:Record<string,string>={
 heading_vi:"Hướng dẫn",lesson_focus_en:"Kỹ năng mục tiêu (EN)",lesson_focus_vi:"Trọng tâm",
 observable_goal_vi:"Bằng chứng cần đạt",learner_action_vi:"Việc cần làm",
 diagnostic_prompt_en:"Câu hỏi chẩn đoán",duration_seconds:"Thời lượng (giây)",
 instructions_vi:"Cách thực hiện",self_check_vi:"Tự kiểm tra",data_policy_vi:"Quyền riêng tư",
 thinking_pattern_en:"Cách triển khai ý",step_by_step_vi:"Thực hiện theo thứ tự",
 rule_en:"Quy tắc (EN)",model_en:"Ví dụ (EN)",model_vi:"Dịch ví dụ (VI)",
 listener_success_vi:"Khi nào người nghe hiểu?",prompt_vi:"Hãy thử trước",
 mistake_en:"Câu chưa tốt",reason_vi:"Vì sao chưa tốt?",
 teacher_repair_en:"Cách sửa tham khảo (sau khi thử)",practice_vi:"Bài luyện",
 worked_model_en:"Bài mẫu phân tích (EN)",translation_vi:"Dịch nghĩa (VI)",
 analysis_vi:"Phân tích",transfer_not_memorisation_vi:"Tự diễn đạt",
 record_again_vi:"Ghi âm lại",four_activity_ids:"Bốn bài Guided",
 focus_vi:"Trọng tâm luyện",hint_protocol_vi:"Mở gợi ý theo từng mức",
 check_vi:"Tiêu chí tự kiểm tra",goal_vi:"Mục tiêu",
 procedure_vi:"Quy trình thực hiện",minimum_self_evidence_vi:"Bằng chứng tối thiểu",
 rules_vi:"Quy tắc",human_review_vi:"Đánh giá cần người kiểm duyệt",
 known_risk_en:"Lỗi thường gặp",why_it_matters_vi:"Tác động đến người nghe",
 targeted_repair_en:"Cách sửa tham khảo (sau khi thử)",
 repair_protocol_vi:"Các bước sửa",extra_practice_en:"Câu luyện chuyển giao",
 reviews:"Lịch ôn",self_evaluation_vi:"Tự đánh giá",outcome_vi:"Kết quả mong đợi",
 task_en:"Nhiệm vụ (EN)",task_vi:"Nhiệm vụ (VI)",day_offset:"Ngày ôn",
 minimum:"Tối thiểu",recommended:"Khuyến nghị"
};
const hiddenSystemFields=new Set(["not_a_band_claim","model_is_practice_not_answer_key",
 "do_not_show_private_models","no_unseen_prompt_in_payload","cannot_auto_certify"]);
const practiceRepairFields=new Set(["teacher_repair_en","targeted_repair_en"]);
function labelField(key:string){return lessonFieldLabels[key]??key.replace(/_/g," ")}
function ContentValue({value}:{value:unknown}){
 if(value===null||value===undefined)return null;
 if(typeof value==="string"||typeof value==="number")return <span>{value}</span>;
 if(typeof value==="boolean")return <span>{value?"Có":"Không"}</span>;
 if(Array.isArray(value))return <ol className="s6-content-list">{value.map((item,i)=><li key={i}><ContentValue value={item}/></li>)}</ol>;
 if(typeof value==="object")return <div className="s6-content-subfields">
  {Object.entries(value as Record<string,unknown>).filter(([key])=>!hiddenSystemFields.has(key))
   .map(([key,item])=><div key={key} className="s6-content-subfield">
    <strong>{labelField(key)}:</strong> <ContentValue value={item}/>
   </div>)}
 </div>;
 return null;
}
function LearningContent({content}:{content:Record<string,unknown>}){
 const [showRepair,setShowRepair]=useState(false);
 return <section className="s6-card s6-learning">
  <h3>{typeof content.heading_vi==="string"?content.heading_vi:"Học từng bước"}</h3>
  {Object.entries(content).filter(([key])=>key!=="heading_vi"&&!hiddenSystemFields.has(key))
   .map(([key,value])=>practiceRepairFields.has(key)
    ? <div className="s6-learning-field" key={key}>
       {showRepair?<><h4>{labelField(key)}</h4><ContentValue value={value}/></>:
        <button type="button" onClick={()=>setShowRepair(true)}>Đã thử sửa — xem gợi ý của giáo viên</button>}
      </div>
    : <div className="s6-learning-field" key={key}>
      <h4>{labelField(key)}</h4><ContentValue value={value}/>
     </div>)}
 </section>;
}

function CuePrep({bullets}:{bullets:string[]}){
 const [remaining,setRemaining]=useState(60);
 const [running,setRunning]=useState(false);
 useEffect(()=>{
  if(!running||remaining<=0)return;
  const t=window.setTimeout(()=>setRemaining(v=>Math.max(0,v-1)),1000);
  return ()=>window.clearTimeout(t);
 },[running,remaining]);
 return <div className="s6-cue-prep">
  <h4>IELTS Part 2 — Cue card</h4>
  {bullets.length>0?<><p>You should say:</p><ul>{bullets.map((b,i)=><li key={i}>{b}</li>)}</ul></>:
  <p className="s6-muted">Câu hỏi này chưa có các gạch đầu dòng. Hãy hỏi giáo viên bổ sung cue card trước khi sử dụng như bài thi Part 2.</p>}
  <div className="s6-cue-timer"><span role="timer" aria-label="Thời gian chuẩn bị">{remaining} giây chuẩn bị</span>
   <button type="button" onClick={()=>{setRemaining(60);setRunning(true);}} disabled={running&&remaining>0}>
    {remaining===0?"Luyện chuẩn bị lại":"Bắt đầu 1 phút"}
   </button>
  </div>
  {remaining===0&&<p className="s6-success">Hết giờ chuẩn bị. Hãy ghi âm 1–2 phút, không đọc bài mẫu.</p>}
 </div>;
}
