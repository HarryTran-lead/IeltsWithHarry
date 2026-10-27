"use client";
import { useEffect, useMemo, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { demoLessonsKey } from "@/features/listening/youtube-lab";
import { YoutubePlayer } from "@/features/listening/youtube-player";
import { parseCaptions, validateQuestions, youtubeId, type Cue, type VideoLesson } from "@/lib/listening/youtube";

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
    if (demoMode) { try { if (alive) setRows(JSON.parse(localStorage.getItem(demoLessonsKey) ?? "[]")); } catch { if (alive) setMessage("Demo lessons could not be read."); } }
    else { const result = await db!.from("youtube_listening_lessons").select("*").order("created_at", { ascending: false }); if (alive) { if (result.error) setMessage(result.error.message); else setRows(result.data as VideoLesson[]); } }
    if (alive) setLoading(false);
  })(); return () => { alive = false; }; }, [db]);
  function edit(row: VideoLesson) { setSelected(row.id); setForm({ title: row.title, url: `https://www.youtube.com/watch?v=${row.youtube_id}`, cefr: row.cefr, topic: row.topic, rights_source: row.rights_source, rights_license: row.rights_license, captions: row.transcript.map((cue, index) => `${index + 1}\n${new Date(cue.start * 1000).toISOString().slice(11, 23).replace(".", ",")} --> ${new Date(cue.end * 1000).toISOString().slice(11, 23).replace(".", ",")}\n${cue.text}`).join("\n\n"), questions: JSON.stringify(row.questions, null, 2), published: row.published }); setCues(row.transcript); setMessage(""); }
  async function importFile(file: File | undefined) { if (!file) return; if (!/\.(srt|vtt)$/i.test(file.name) || file.size > 400_000) { setMessage("Choose an SRT/VTT file under 400 KB."); return; } try { const raw = await file.text(); const parsed = parseCaptions(raw); setForm((current) => ({ ...current, captions: raw })); setCues(parsed); setMessage(`${parsed.length} timed cues validated.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Invalid captions."); } }
  async function save(publish = form.published) {
    setMessage("");
    const id = youtubeId(form.url);
    if (!id || !form.title.trim() || !form.topic.trim()) { setMessage("Title, topic and a valid HTTPS YouTube URL are required."); return; }
    let transcript: Cue[] = [], questions;
    try { transcript = form.captions.trim() ? parseCaptions(form.captions) : []; questions = validateQuestions(form.questions); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Invalid lesson data."); return; }
    if (publish && transcript.length > 0 && (!form.rights_source.trim() || !form.rights_license.trim())) { setMessage("Publishing caption activities requires recorded source and rights information."); return; }
    const data = { title: form.title.trim(), youtube_id: id, cefr: form.cefr, topic: form.topic.trim(), transcript, questions, rights_source: form.rights_source.trim(), rights_license: form.rights_license.trim(), published: publish };
    setBusy(true);
    if (demoMode) { const row = { ...data, id: selected ?? crypto.randomUUID() }; const updated = selected ? rows.map((item) => item.id === selected ? row : item) : [row, ...rows]; localStorage.setItem(demoLessonsKey, JSON.stringify(updated)); setRows(updated); setSelected(row.id); setMessage("Demo lesson saved in this browser."); }
    else { const result = selected ? await db!.from("youtube_listening_lessons").update({ ...data, updated_at: new Date().toISOString() }).eq("id", selected).select("*").single() : await db!.from("youtube_listening_lessons").insert(data).select("*").single(); if (result.error) setMessage(result.error.message); else { const row = result.data as VideoLesson; setRows((current) => selected ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]); setSelected(row.id); setMessage("Lesson saved."); } }
    setBusy(false);
  }
  const id = youtubeId(form.url);
  return <section className="card yt-admin"><h2>YouTube listening lessons</h2><p>Use only transcripts owned by the project or lawfully licensed for this use. The YouTube player supplies video; this tool stores only your subtitles and questions.</p>{message && <p role="status">{message}</p>}
    <div className="yt-admin-layout"><aside><button type="button" onClick={() => { setSelected(null); setForm(empty); setCues([]); setMessage(""); }}>+ New lesson</button>{loading ? <p>Loading…</p> : rows.length ? rows.map((row) => <button type="button" key={row.id} onClick={() => edit(row)}><strong>{row.title}</strong><small>{row.published ? "Published" : "Draft"} · {row.cefr}</small></button>) : <p>No video lessons yet.</p>}</aside>
      <div className="yt-admin-form"><label>Title<input value={form.title} maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>YouTube URL<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label><div className="yt-admin-pair"><label>CEFR<select value={form.cefr} onChange={(event) => setForm({ ...form, cefr: event.target.value })}>{["A1","A2","B1","B2","C1","C2"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Topic<input value={form.topic} maxLength={80} onChange={(event) => setForm({ ...form, topic: event.target.value })} /></label></div><label>Transcript source or owner<input value={form.rights_source} maxLength={500} onChange={(event) => setForm({ ...form, rights_source: event.target.value })} /></label><label>License or permission basis<input value={form.rights_license} maxLength={160} onChange={(event) => setForm({ ...form, rights_license: event.target.value })} placeholder="e.g. project original, CC BY 4.0, written permission" /></label><label>Upload licensed SRT/VTT<input type="file" accept=".srt,.vtt,text/vtt" onChange={(event) => void importFile(event.target.files?.[0])} /></label><label>Captions<textarea rows={8} value={form.captions} onChange={(event) => { setForm({ ...form, captions: event.target.value }); setCues([]); }} placeholder="WEBVTT or numbered SRT cues" /></label><button type="button" onClick={() => { try { const parsed = parseCaptions(form.captions); setCues(parsed); setMessage(`${parsed.length} timed cues validated.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Invalid captions."); } }}>Validate timestamps</button><label>Teacher questions (JSON: prompt, options, answer index)<textarea rows={6} value={form.questions} onChange={(event) => setForm({ ...form, questions: event.target.value })} /></label>
        <div className="yt-admin-actions"><button type="button" disabled={busy} onClick={() => void save(false)}>Save draft</button><button type="button" disabled={busy} onClick={() => void save(true)}>Publish</button>{selected && <button type="button" disabled={busy} onClick={() => void save(false)}>Unpublish</button>}</div>
        {id && cues.length > 0 && <div className="yt-admin-preview"><h3>Synchronization preview</h3><YoutubePlayer id={id} segment={request ? cues[preview] : null} request={request} /><div>{cues.slice(0, 30).map((cue, index) => <button type="button" key={index} onClick={() => { setPreview(index); setRequest((value) => value + 1); }}>{cue.start.toFixed(1)}s · {cue.text}</button>)}</div></div>}
      </div></div>
  </section>;
}
