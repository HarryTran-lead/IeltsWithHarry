"use client";
import { useEffect, useMemo, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { demoLessonsKey } from "@/features/listening/youtube-lab";
import { YoutubePlayer } from "@/features/listening/youtube-player";
import { parseCaptions, validateQuestions, youtubeId, type Cue, type VideoLesson } from "@/lib/listening/youtube";
import { LoadingBlock } from "@/components/layout/loading-block";
import { Plus } from "lucide-react";
import { AdminCardHead, AdminNotice } from "./admin-ui";

const empty = { title: "", url: "", cefr: "B1", topic: "", rights_source: "", rights_license: "", captions: "", questions: "[]", published: false };
export function YoutubeLessonsAdmin() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [rows, setRows] = useState<VideoLesson[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [cues, setCues] = useState<Cue[]>([]);
  const [preview, setPreview] = useState(0);
  const [request, setRequest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { let alive = true; void (async () => {
    if (demoMode) { try { if (alive) setRows(JSON.parse(localStorage.getItem(demoLessonsKey) ?? "[]")); } catch { if (alive) setMessage("Không đọc được bài demo trong trình duyệt."); } }
    else { const result = await db!.from("youtube_listening_lessons").select("*").order("created_at", { ascending: false }); if (alive) { if (result.error) setMessage(result.error.message); else setRows(result.data as VideoLesson[]); } }
    if (alive) setLoading(false);
  })(); return () => { alive = false; }; }, [db]);
  function edit(row: VideoLesson) { setSelected(row.id); setForm({ title: row.title, url: `https://www.youtube.com/watch?v=${row.youtube_id}`, cefr: row.cefr, topic: row.topic, rights_source: row.rights_source, rights_license: row.rights_license, captions: row.transcript.map((cue, index) => `${index + 1}\n${new Date(cue.start * 1000).toISOString().slice(11, 23).replace(".", ",")} --> ${new Date(cue.end * 1000).toISOString().slice(11, 23).replace(".", ",")}\n${cue.text}`).join("\n\n"), questions: JSON.stringify(row.questions, null, 2), published: row.published }); setCues(row.transcript); setMessage(""); }
  async function importFile(file: File | undefined) { if (!file) return; if (!/\.(srt|vtt)$/i.test(file.name) || file.size > 400_000) { setMessage("Chọn tệp SRT/VTT nhỏ hơn 400 KB."); return; } try { const raw = await file.text(); const parsed = parseCaptions(raw); setForm((current) => ({ ...current, captions: raw })); setCues(parsed); setMessage(`Đã kiểm tra ${parsed.length} câu phụ đề có mốc thời gian.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Phụ đề không hợp lệ."); } }
  async function save(publish = form.published) {
    setMessage("");
    const id = youtubeId(form.url);
    if (!id || !form.title.trim() || !form.topic.trim()) { setMessage("Cần tiêu đề, chủ đề và một URL YouTube HTTPS hợp lệ."); return; }
    let transcript: Cue[] = [], questions;
    try { transcript = form.captions.trim() ? parseCaptions(form.captions) : []; questions = validateQuestions(form.questions); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Dữ liệu bài học không hợp lệ."); return; }
    if (publish && transcript.length > 0 && (!form.rights_source.trim() || !form.rights_license.trim())) { setMessage("Muốn xuất bản bài có phụ đề, hãy ghi nguồn và căn cứ quyền sử dụng."); return; }
    const data = { title: form.title.trim(), youtube_id: id, cefr: form.cefr, topic: form.topic.trim(), transcript, questions, rights_source: form.rights_source.trim(), rights_license: form.rights_license.trim(), published: publish };
    setBusy(true);
    if (demoMode) { const row = { ...data, id: selected ?? crypto.randomUUID() }; const updated = selected ? rows.map((item) => item.id === selected ? row : item) : [row, ...rows]; localStorage.setItem(demoLessonsKey, JSON.stringify(updated)); setRows(updated); setSelected(row.id); setMessage("Đã lưu bài demo trong trình duyệt này."); }
    else { const result = selected ? await db!.from("youtube_listening_lessons").update({ ...data, updated_at: new Date().toISOString() }).eq("id", selected).select("*").single() : await db!.from("youtube_listening_lessons").insert(data).select("*").single(); if (result.error) setMessage(result.error.message); else { const row = result.data as VideoLesson; setRows((current) => selected ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]); setSelected(row.id); setMessage("Đã lưu bài học."); } }
    setBusy(false);
  }
  const id = youtubeId(form.url);
  return <div className="admin-split">
    <section className="card admin-card admin-split-list">
      <AdminCardHead title="Bài nghe video" count={rows.length}><button type="button" className="button primary" onClick={() => { setSelected(null); setForm(empty); setCues([]); setMessage(""); }}><Plus size={15} /> Bài mới</button></AdminCardHead>
      {loading ? <LoadingBlock label="Đang tải…" /> : rows.length ? <div className="admin-pick-list">{rows.map((row) => <button type="button" key={row.id} className={selected === row.id ? "active" : ""} onClick={() => edit(row)}><strong>{row.title}</strong><small><span className={row.published ? "status-pill live" : "status-pill draft"}><i aria-hidden="true" />{row.published ? "Đã xuất bản" : "Bản nháp"}</span> · {row.cefr} · {row.topic}</small></button>)}</div> : <p className="admin-empty-line">Chưa có bài nghe video nào.</p>}
    </section>
    <section className="card admin-card">
      <AdminCardHead title={selected ? "Chỉnh sửa bài nghe video" : "Tạo bài nghe video"} description="Chỉ dùng transcript do dự án sở hữu hoặc được cấp phép. Trình phát YouTube cung cấp video; hệ thống chỉ lưu phụ đề và câu hỏi của bạn." />
      {message && <AdminNotice>{message}</AdminNotice>}
      <div className="admin-form">
        <label className="wide">Tiêu đề<input value={form.title} maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="wide">URL YouTube<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></label>
        <label>CEFR<select value={form.cefr} onChange={(event) => setForm({ ...form, cefr: event.target.value })}>{["A1","A2","B1","B2","C1","C2"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Chủ đề<input value={form.topic} maxLength={80} onChange={(event) => setForm({ ...form, topic: event.target.value })} /></label>
        <label>Nguồn / chủ sở hữu transcript<input value={form.rights_source} maxLength={500} onChange={(event) => setForm({ ...form, rights_source: event.target.value })} /></label>
        <label>Giấy phép hoặc căn cứ cho phép<input value={form.rights_license} maxLength={160} onChange={(event) => setForm({ ...form, rights_license: event.target.value })} placeholder="VD: nội dung gốc của dự án, CC BY 4.0, văn bản cho phép" /></label>
        <label className="wide">Tải phụ đề SRT/VTT đã được cấp phép<input type="file" accept=".srt,.vtt,text/vtt" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
        <label className="wide">Phụ đề<textarea rows={8} value={form.captions} onChange={(event) => { setForm({ ...form, captions: event.target.value }); setCues([]); }} placeholder="WEBVTT hoặc SRT có đánh số" /></label>
        <div className="wide admin-form-actions"><button type="button" className="button subtle" onClick={() => { try { const parsed = parseCaptions(form.captions); setCues(parsed); setMessage(`Đã kiểm tra ${parsed.length} câu phụ đề có mốc thời gian.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Phụ đề không hợp lệ."); } }}>Kiểm tra mốc thời gian</button></div>
        <label className="wide">Câu hỏi của giáo viên (JSON: prompt, options, answer index)<textarea className="is-code" rows={6} value={form.questions} onChange={(event) => setForm({ ...form, questions: event.target.value })} /></label>
      </div>
      <div className="admin-form-actions admin-form-footer"><button type="button" className="button subtle" disabled={busy} onClick={() => void save(false)}>Lưu nháp</button>{selected && form.published && <button type="button" className="button subtle" disabled={busy} onClick={() => void save(false)}>Gỡ xuất bản</button>}<button type="button" className="button primary" disabled={busy} onClick={() => void save(true)}>Xuất bản</button></div>
      {id && cues.length > 0 && <div className="yt-admin-preview"><h3>Xem trước đồng bộ phụ đề</h3><YoutubePlayer id={id} segment={request ? cues[preview] : null} request={request} /><div>{cues.slice(0, 30).map((cue, index) => <button type="button" key={index} onClick={() => { setPreview(index); setRequest((value) => value + 1); }}>{cue.start.toFixed(1)}s · {cue.text}</button>)}</div></div>}
    </section>
  </div>;
}
