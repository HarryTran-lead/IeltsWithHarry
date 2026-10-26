"use client";
/* eslint-disable @next/next/no-img-element -- Lesson figures can use external hosts chosen by the editor. */

import { useEffect, useRef, useState } from "react";
import { compareSentence, countWords } from "@/lib/authored-content";
import type { SkillMaterial } from "@/lib/skill-material";
import { createClient } from "@/lib/supabase/browser";

export function SkillLesson({ material, lessonSlug, answersRevealed, passageInReader = false }: { material: SkillMaterial | null; lessonSlug: string; answersRevealed: boolean; passageInReader?: boolean }) {
  if (!material) return null;
  return <div className="skill-lesson">
    {material.figure.url && <figure className={`skill-figure ${material.skill === "Reading" ? "reading-figure" : ""}`}><img src={material.figure.url} alt={material.figure.alt} /></figure>}
    {material.skill === "Vocabulary" && material.introduction && <div className="lab-note"><h2>Chủ đề từ vựng</h2><p>{material.introduction}</p></div>}
    {material.skill === "Grammar" && <div className="lab-note"><h2>Quy tắc</h2><p>{material.rule}</p><p><strong>Ví dụ:</strong> {material.example}</p></div>}
    {material.skill === "Reading" && !passageInReader && <div className="lab-passage"><h2>Bài đọc</h2><p>{material.passage}</p></div>}
    {material.skill === "Listening" && <ListeningMaterial material={material} answersRevealed={answersRevealed} />}
    {material.skill === "Writing" && <WritingMaterial material={material} lessonSlug={lessonSlug} />}
    {material.skill === "Speaking" && <SpeakingMaterial material={material} />}
  </div>;
}

function ListeningMaterial({ material, answersRevealed }: { material: Extract<SkillMaterial, { skill: "Listening" }>; answersRevealed: boolean }) {
  const [showTranscript, setShowTranscript] = useState(false);
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  function playScript() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(material.transcript);
    utterance.lang = "en-US"; utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }
  return <div className="lab-stack"><h2>Nghe và trả lời</h2>{material.audioUrl ? <audio controls src={material.audioUrl} aria-label="Âm thanh bài nghe" /> : <button type="button" className="button primary" onClick={playScript}>▶ Phát giọng đọc trình duyệt</button>}{!answersRevealed && <button type="button" className="button subtle" onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? "Ẩn transcript" : "Mở transcript để ôn tập"}</button>}{(showTranscript || answersRevealed) && <div className="lab-passage"><h3>Transcript</h3><p>{material.transcript}</p></div>}</div>;
}

function WritingMaterial({ material, lessonSlug }: { material: Extract<SkillMaterial, { skill: "Writing" }>; lessonSlug: string }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.from("writing_drafts").select("body").eq("lesson_slug", lessonSlug).maybeSingle().then(({ data }) => { if (active && data?.body) setBody(data.body); });
    return () => { active = false; };
  }, [lessonSlug]);
  async function save() {
    setBusy(true); setStatus("");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setStatus("Vui lòng đăng nhập lại."); setBusy(false); return; }
    const result = await supabase.from("writing_drafts").upsert({ user_id: data.user.id, lesson_slug: lessonSlug, body, updated_at: new Date().toISOString() });
    setStatus(result.error ? result.error.message : "Đã lưu bản nháp vào sổ học của bạn."); setBusy(false);
  }
  const words = countWords(body);
  return <div className="lab-stack"><div className="lab-note"><h2>Đề Writing</h2><p>{material.prompt}</p></div><label htmlFor="lesson-writing">Bài viết của bạn · {words} / {material.minWords} từ tối thiểu</label><textarea id="lesson-writing" rows={10} maxLength={20000} value={body} onChange={(e) => { setBody(e.target.value); setStatus(""); }} /><div className="skill-actions"><button type="button" className="button primary" disabled={busy || !body.trim()} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu bản nháp"}</button><button type="button" className="button subtle" onClick={() => setShowModel(!showModel)}>{showModel ? "Ẩn bài mẫu" : "Xem bài mẫu & checklist"}</button></div>{status && <p role="status">{status}</p>}{showModel && <div className="lab-result"><strong>{words >= material.minWords ? "Đã đủ số từ tối thiểu" : `Cần thêm ${material.minWords - words} từ`}</strong><p><b>Bài mẫu:</b> {material.modelAnswer}</p><ul>{material.checklist.map((item) => <li key={item}><label><input type="checkbox" /> {item}</label></li>)}</ul><small>Checklist do bạn tự đánh dấu; hệ thống không tự chấm chất lượng bài viết.</small></div>}</div>;
}

function SpeakingMaterial({ material }: { material: Extract<SkillMaterial, { skill: "Speaking" }> }) {
  const [seconds, setSeconds] = useState(material.preparationSeconds);
  const [counting, setCounting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [showModel, setShowModel] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRef = useRef("");
  useEffect(() => { if (!counting || seconds <= 0) return; const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000); return () => window.clearTimeout(timer); }, [counting, seconds]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); if (audioRef.current) URL.revokeObjectURL(audioRef.current); }, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Trình duyệt chưa hỗ trợ ghi âm."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(stream);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => { stream.getTracks().forEach((track) => track.stop()); if (audioRef.current) URL.revokeObjectURL(audioRef.current); const url = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" })); audioRef.current = url; setAudioUrl(url); setRecording(false); };
      recorder.current = next; next.start(); setRecording(true); setError("");
    } catch { setError("Không mở được microphone. Kiểm tra quyền truy cập trình duyệt."); }
  }
  return <div className="lab-stack"><div className="lab-note"><h2>Đề Speaking</h2><p>{material.prompt}</p></div><div className="skill-actions"><span>Chuẩn bị: <b>{seconds}s</b></span><button type="button" className="button subtle" onClick={() => { setSeconds(material.preparationSeconds); setCounting(true); }}>Bắt đầu đếm giờ</button>{recording ? <button type="button" className="button primary" onClick={() => recorder.current?.stop()}>■ Dừng ghi âm</button> : <button type="button" className="button primary" onClick={() => void start()}>● Ghi âm</button>}</div>{error && <p role="alert" className="form-error">{error}</p>}{audioUrl && <audio controls src={audioUrl} aria-label="Nghe lại bài nói" />}<button type="button" className="button subtle" onClick={() => setShowModel(!showModel)}>{showModel ? "Ẩn câu mẫu" : "Xem câu mẫu & checklist"}</button>{showModel && <div className="lab-result"><p><b>Câu mẫu:</b> {material.modelAnswer}</p><ul>{material.checklist.map((item) => <li key={item}><label><input type="checkbox" /> {item}</label></li>)}</ul><small>Bản ghi ở tab hiện tại; hệ thống không tự chấm phát âm hay band IELTS.</small></div>}</div>;
}

export function SentencePractice({ prompt, accepted }: { prompt: string; accepted: string[] }) {
  const [answer, setAnswer] = useState(""); const [checked, setChecked] = useState(false);
  const result = compareSentence(answer, accepted);
  return <div className="sentence-practice"><strong>Đặt câu</strong><p>{prompt}</p><input aria-label="Câu tiếng Anh của bạn" value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); }} /><button type="button" className="button subtle" disabled={!answer.trim()} onClick={() => setChecked(true)}>So sánh với câu mẫu</button>{checked && <div className="lab-result" role="status"><strong>{result.exact ? "Khớp câu đã soạn ✓" : "Chưa khớp câu đã soạn"}</strong><p>Độ trùng từ: {result.similarity}% (không phải điểm chất lượng).</p><p><b>Câu tham khảo:</b> {accepted.join(" / ")}</p></div>}</div>;
}
