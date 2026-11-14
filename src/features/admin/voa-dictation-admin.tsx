"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { AdminCardHead, AdminNotice, AdminStat } from "./admin-ui";

type Lesson = { id:string; source_url:string; source_audio_url:string|null; source_group:string; source_published_at:string|null; third_party_warning:boolean; title:string; topic:string; cefr:string|null; transcript:string; audio_object_key:string|null; audio_bytes:number|null; status:string; rights_verified:boolean; transcript_verified:boolean; audio_verified:boolean; timings_verified:boolean; cefr_reviewed:boolean; r2_verified:boolean; rights_basis:string; review_notes:string; reviewer_id:string|null; reviewed_at:string|null };
type Segment = { id?:string; lesson_id:string; ordinal:number; start_ms:number; end_ms:number; reference_text:string; speaker:string };
const statusNames: Record<string, string> = { discovered: "Mới phát hiện", needs_review: "Chờ duyệt", approved: "Đã duyệt", uploaded: "Đã tải audio", preview: "Thử nghiệm", published: "Đã xuất bản", blocked: "Bị chặn", rejected: "Từ chối" };
const checks = [["rights_verified","Quyền VOA đã kiểm tra"],["transcript_verified","Transcript khớp audio"],["audio_verified","Đã nghe và kiểm tra MP3"],["timings_verified","Các mốc thời gian đã kiểm tra"],["cefr_reviewed","CEFR đã duyệt"]] as const;

export function VoaDictationAdmin() {
  const db=useMemo(()=>createClient(),[]);
  const [rows,setRows]=useState<Lesson[]>([]); const [draft,setDraft]=useState<Lesson|null>(null);
  const [segments,setSegments]=useState<Segment[]>([]); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const lessonId=draft?.id;
  const load=useCallback(async()=>{ const {data,error}=await db.from("voa_dictation_lessons").select("*").order("created_at",{ascending:false}).limit(500); if(error)setMessage(error.message);else setRows((data??[]) as Lesson[]); },[db]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  useEffect(()=>{if(!lessonId)return;let live=true;void db.from("voa_dictation_segments").select("*").eq("lesson_id",lessonId).order("ordinal").then(({data,error})=>{if(live){if(error)setMessage(error.message);else setSegments((data??[]) as Segment[]);}});return()=>{live=false;};},[db,lessonId]);
  const counts=rows.reduce<Record<string,number>>((result,row)=>{result[row.status]=(result[row.status]??0)+1;return result;},{});
  function patch<K extends keyof Lesson>(key:K,value:Lesson[K]){setDraft((current)=>current?{...current,[key]:value}:null);}
  async function save(){if(!draft)return;setBusy(true);setMessage("");const {data:{user}}=await db.auth.getUser();const payload={title:draft.title.trim(),topic:draft.topic.trim(),cefr:draft.cefr,transcript:draft.transcript.trim(),rights_basis:draft.rights_basis.trim(),review_notes:draft.review_notes.trim(),rights_verified:draft.rights_verified,transcript_verified:draft.transcript_verified,audio_verified:draft.audio_verified,timings_verified:draft.timings_verified,cefr_reviewed:draft.cefr_reviewed,reviewer_id:user?.id??null,reviewed_at:new Date().toISOString()};const result=await db.from("voa_dictation_lessons").update(payload).eq("id",draft.id);setBusy(false);if(result.error)setMessage(result.error.message);else{setMessage("Đã lưu bản nháp kiểm duyệt.");await load();}}
  async function saveSegments(){if(!draft)return;setBusy(true);setMessage("");for(const row of segments){const payload={lesson_id:draft.id,ordinal:row.ordinal,start_ms:Number(row.start_ms),end_ms:Number(row.end_ms),reference_text:row.reference_text.trim(),speaker:row.speaker.trim()};const result=row.id?await db.from("voa_dictation_segments").update(payload).eq("id",row.id):await db.from("voa_dictation_segments").insert(payload);if(result.error){setMessage(result.error.message);setBusy(false);return;}}const refreshed=await db.from("voa_dictation_segments").select("*").eq("lesson_id",draft.id).order("ordinal");if(refreshed.error)setMessage(refreshed.error.message);else{setSegments((refreshed.data??[]) as Segment[]);setMessage("Đã lưu các câu.");}setBusy(false);}
  async function publish(status:"published"|"uploaded"){if(!draft)return;setBusy(true);setMessage("");const result=await db.from("voa_dictation_lessons").update({status}).eq("id",draft.id);setBusy(false);if(result.error)setMessage(result.error.message);else{setDraft({...draft,status});setMessage(status==="published"?"Bài đã xuất bản.":"Đã gỡ bài khỏi học viên.");await load();}}
  const statusLabel = (status: string) => statusNames[status] ?? status;
  return <div className="admin-stack">
    <div className="admin-stats-row">{Object.keys(counts).length ? Object.entries(counts).map(([status, count]) => <AdminStat key={status} label={statusLabel(status)} value={count} tone={status === "published" ? "teal" : status === "preview" ? "sky" : "amber"} />) : <AdminStat label="Ứng viên" value={0} hint="Worker chưa nhập bài nào" />}</div>
    <AdminNotice>Worker nhập metadata và MP3 vào R2 trước. Bài thử nghiệm có nhãn riêng; chỉ bài đã nghe duyệt mới được xuất bản. Học viên không phát audio từ nguồn bên ngoài.</AdminNotice>
    {message && <AdminNotice tone={/lỗi|error|failed|không/i.test(message) ? "error" : "success"}>{message}</AdminNotice>}
    <div className="admin-split">
      <section className="card admin-card admin-split-list">
        <AdminCardHead title="Bài Dictation" count={rows.length} />
        <div className="admin-pick-list">{rows.map((row) => <button key={row.id} type="button" className={draft?.id === row.id ? "active" : ""} onClick={() => { setDraft(row); setMessage(""); }}><strong>{row.title}</strong><small><span className={row.status === "published" ? "status-pill live" : "status-pill draft"}><i aria-hidden="true" />{statusLabel(row.status)}</span> · {row.cefr ?? "Chưa có CEFR"}</small></button>)}{!rows.length && <p className="admin-empty-line">Chưa có ứng viên.</p>}</div>
      </section>
      {draft ? <section className="card admin-card">
        <AdminCardHead title={draft.title} description={<>Nguồn: {draft.source_group} · Ngày nguồn: {draft.source_published_at ? new Date(draft.source_published_at).toLocaleDateString("vi-VN") : "Chưa rõ"} · R2: {draft.audio_object_key ? `${Math.round((draft.audio_bytes ?? 0) / 1024)} KB` : "chưa tải lên"}{draft.r2_verified ? " · đã xác nhận" : ""}</>}>
          <a className="button subtle" href={draft.source_url} target="_blank" rel="noreferrer">Bài gốc VOA ↗</a>{draft.source_audio_url && <a className="button subtle" href={draft.source_audio_url} target="_blank" rel="noreferrer">Audio ứng viên ↗</a>}
        </AdminCardHead>
        {draft.third_party_warning && <AdminNotice tone="warning">Có dấu hiệu nội dung bên thứ ba. Chỉ duyệt khi đã xác minh và ghi rõ “third-party-cleared” cùng căn cứ trong ghi chú.</AdminNotice>}
        <div className="admin-form">
          <label>Tiêu đề<input value={draft.title} onChange={(e)=>patch("title",e.target.value)}/></label>
          <label>Chủ đề<input value={draft.topic} onChange={(e)=>patch("topic",e.target.value)}/></label>
          <label>CEFR<select value={draft.cefr??""} onChange={(e)=>patch("cefr",e.target.value||null)}><option value="">Chưa duyệt</option>{["A1","A2","B1","B2","C1","C2"].map((x)=><option key={x}>{x}</option>)}</select></label>
          <label className="wide">Transcript đúng theo bản ghi<textarea rows={8} value={draft.transcript} onChange={(e)=>patch("transcript",e.target.value)}/></label>
          <label>Căn cứ quyền sử dụng<textarea rows={3} value={draft.rights_basis} onChange={(e)=>patch("rights_basis",e.target.value)}/></label>
          <label>Ghi chú kiểm duyệt<textarea rows={3} value={draft.review_notes} onChange={(e)=>patch("review_notes",e.target.value)}/></label>
          <fieldset className="wide admin-checks"><legend>Danh sách kiểm tra</legend>{checks.map(([key,label])=><label key={key} className="admin-check"><input type="checkbox" checked={draft[key]} onChange={(e)=>patch(key,e.target.checked)}/>{label}</label>)}</fieldset>
        </div>
        <div className="admin-form-actions admin-form-footer"><button type="button" className="button subtle" disabled={busy} onClick={()=>void save()}>Lưu kiểm duyệt</button>{(draft.status==="published"||draft.status==="preview")&&<><button type="button" className="button subtle" disabled={busy} onClick={()=>void publish("uploaded")}>Gỡ khỏi học viên</button><Link prefetch={false} className="button subtle" href="/app/dictation">Xem bài học →</Link></>}<button type="button" className="button primary" disabled={busy||draft.status==="published"} onClick={()=>void publish("published")}>Xuất bản</button></div>
        <div className="admin-subsection">
          <AdminCardHead title="Câu và mốc audio" count={segments.length} description="Nhập mili giây theo MP3; nghe từng câu trước khi đánh dấu “Các mốc thời gian đã kiểm tra”." />
          {draft.audio_object_key&&<audio className="admin-audio" controls src={`/api/voa/audio/${draft.id}`} />}
          <div className="admin-segments">{segments.length > 0 && <div className="admin-segment-row is-head"><span>#</span><span>Bắt đầu (ms)</span><span>Kết thúc (ms)</span><span>Transcript</span></div>}{segments.map((row,index)=><div key={row.id??`new-${index}`} className="admin-segment-row"><b>{index+1}</b><input aria-label={`Bắt đầu câu ${index+1} (ms)`} type="number" min="0" value={row.start_ms} onChange={(e)=>setSegments((all)=>all.map((s,i)=>i===index?{...s,start_ms:Number(e.target.value)}:s))}/><input aria-label={`Kết thúc câu ${index+1} (ms)`} type="number" min="1" value={row.end_ms} onChange={(e)=>setSegments((all)=>all.map((s,i)=>i===index?{...s,end_ms:Number(e.target.value)}:s))}/><textarea rows={2} aria-label={`Transcript câu ${index+1}`} value={row.reference_text} onChange={(e)=>setSegments((all)=>all.map((s,i)=>i===index?{...s,reference_text:e.target.value}:s))}/></div>)}</div>
          <div className="admin-form-actions"><button type="button" className="button subtle" disabled={busy||draft.status==="published"} onClick={()=>setSegments((all)=>[...all,{lesson_id:draft.id,ordinal:all.length+1,start_ms:0,end_ms:1000,reference_text:"",speaker:""}])}>+ Thêm câu</button><button type="button" className="button primary" disabled={busy||draft.status==="published"} onClick={()=>void saveSegments()}>Lưu các câu</button></div>
        </div>
      </section> : <section className="card admin-card"><div className="admin-empty-state"><div><h3>Chọn một bài để kiểm duyệt</h3><p>Chọn bài ở danh sách bên trái để sửa transcript, CEFR, mốc thời gian và xuất bản.</p></div></div></section>}
    </div>
  </div>;
}
