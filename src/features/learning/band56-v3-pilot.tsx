"use client";

import { useEffect, useRef, useState } from "react";
import { OpenResponsePractice, type PackageActivity, type PackageLesson } from "./course-package-practice";
import "./band56-v3-pilot.css";

type ReadingQuestion = { id: string; type: string; prompt: string; answer: string; options?: string[]; evidence: string };
type Pilot = PackageLesson & {
  reading?: { title: string; passage: [string, string][]; headings: string[]; questions: ReadingQuestion[] };
  listening?: { title: string; transcript: string; questions: ReadingQuestion[]; note: string };
  grammar?: { prompt: string; answer: string; explanation_vi: string }[];
  writing?: { task1: { data: { title: string; unit: string; years: string[]; rows: (string | number)[][] }; task: string; sample_answer: string; template: Record<string, string>; warnings: string[] }; task2_extension: { prompt: string; planning_points: string[] } };
  speaking?: { part1: string[]; part2: string; part3: string[] };
};

function activities(items: ReadingQuestion[]): PackageActivity[] {
  return items.map((item) => ({ id: item.id, type: item.type, prompt: item.prompt, answer: item.answer,
    // Headings use roman numerals. The shared practice widget expects the full
    // option text, so these remain short-answer entries with a visible heading bank.
    explanation: item.evidence, instruction: item.type === "tfng" ? "TRUE / FALSE / NOT GIVEN" : undefined }));
}

function WritingDraft({ content, lessonSlug }: { content: NonNullable<Pilot["writing"]>; lessonSlug: string }) {
  const [draft, setDraft] = useState("");
  const [showModel, setShowModel] = useState(false);
  const key = `band56-v3:writing:${lessonSlug}`;
  useEffect(() => { const timer = window.setTimeout(() => { try { setDraft(localStorage.getItem(key) ?? ""); } catch { /* Storage may be disabled. */ } }, 0); return () => window.clearTimeout(timer); }, [key]);
  const count = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return <div className="b56-writing">
    <h3>Writing Academic Task 1</h3><p>{content.task1.task}</p>
    <div className="b56-table"><table><caption>{content.task1.data.title} · {content.task1.data.unit}</caption><thead><tr><th>Mode</th>{content.task1.data.years.map((year) => <th key={year}>{year}</th>)}</tr></thead><tbody>{content.task1.data.rows.map((row) => <tr key={String(row[0])}>{row.map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
    <label htmlFor="b56-writing-draft">Bản nháp của bạn · {count} từ (tối thiểu 150)</label>
    <textarea id="b56-writing-draft" rows={12} value={draft} onChange={(event) => { const next = event.target.value; setDraft(next); try { localStorage.setItem(key, next); } catch { /* Keep in memory. */ } }} placeholder="Viết overview, so sánh số liệu và phát triển bài tại đây…" />
    <small>Tự lưu trên trình duyệt này. Chưa gửi bài hoặc chấm band tự động.</small>
    <button type="button" className="button subtle" onClick={() => setShowModel((value) => !value)}>{showModel ? "Ẩn bài mẫu" : "Xem bài mẫu sau khi viết"}</button>
    {showModel && <div className="lab-note"><h4>Bài mẫu để đối chiếu</h4><p>{content.task1.sample_answer}</p></div>}
    <details><summary>Task 2 mở rộng</summary><p>{content.task2_extension.prompt}</p><ul>{content.task2_extension.planning_points.map((point) => <li key={point}>{point}</li>)}</ul></details>
  </div>;
}

function SpeakingPractice({ content }: { content: NonNullable<Pilot["speaking"]> }) {
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setSeconds((value) => { if (value <= 1) { setRunning(false); return 0; } return value - 1; }), 1000); return () => window.clearInterval(timer); }, [running]);
  useEffect(() => () => { recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => () => { if (recordUrl) URL.revokeObjectURL(recordUrl); }, [recordUrl]);
  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = captured;
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(captured);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => { setRecordUrl(URL.createObjectURL(new Blob(chunks, { type: next.mimeType }))); captured.getTracks().forEach((track) => track.stop()); };
      recorder.current = next; next.start(); setRecording(true);
    } catch { setRecording(false); }
  }
  return <div className="b56-speaking"><h3>Speaking Part 1</h3><ol>{content.part1.map((prompt) => <li key={prompt}>{prompt}</li>)}</ol>
    <h3>Part 2 · Cue card</h3><p>{content.part2}</p>
    <div className="b56-timer"><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button type="button" className="button subtle" onClick={() => { setSeconds(60); setRunning(true); }}>Chuẩn bị 1 phút</button><button type="button" className="button subtle" onClick={() => { setSeconds(120); setRunning(true); }}>Nói 2 phút</button><button type="button" className="button subtle" onClick={() => setRunning(false)}>Dừng</button></div>
    <button type="button" className="button primary" onClick={() => void toggleRecording()} disabled={typeof MediaRecorder === "undefined"}>{recording ? "Dừng ghi âm" : "Cho phép micro và ghi âm trên máy"}</button>
    <small>Chỉ ghi sau khi bạn bấm nút. Bản ghi không tự tải lên máy chủ.</small>{recordUrl && <audio controls src={recordUrl} aria-label="Nghe lại phần nói của bạn" />}
    <h3>Part 3 · Thảo luận</h3><ol>{content.part3.map((prompt) => <li key={prompt}>{prompt}</li>)}</ol>
  </div>;
}

export function Band56PilotPractice({ content, mode, lessonSlug }: { content: PackageLesson; mode: "learn" | "practice" | "review"; lessonSlug: string }) {
  const pilot = content as Pilot;
  if (mode === "learn") return <div className="b56-pilot"><span className="eyebrow">IELTS BUILDER 5.0–6.0 · V3 PILOT</span><h3>{content.title}</h3><p>{content.instruction_vi}</p>
    {pilot.reading && <p>Bài Reading gốc gồm {pilot.reading.passage.length} đoạn, 12 câu; xem bài đọc và câu hỏi cùng lúc ở bước Thực hành.</p>}
    {pilot.listening && <p className="lab-note">{pilot.listening.note} Đây là bài phân tích lời thoại; chưa có audio, nên không được tính là bài kiểm tra kỹ năng nghe.</p>}
    {pilot.vocabulary && <p>Học {pilot.vocabulary.length} cụm từ theo ngữ cảnh, rồi tự gõ lại nghĩa tiếng Anh từ gợi ý tiếng Việt.</p>}
    {pilot.grammar && <p>Ôn present simple, present continuous và cách mô tả xu hướng trước khi làm 8 câu.</p>}
    {pilot.writing && <p>Đọc bảng số liệu, viết Task 1 ít nhất 150 từ và đối chiếu bài mẫu sau khi viết.</p>}
    {pilot.speaking && <p>Luyện câu hỏi Part 1–3; chuẩn bị 1 phút và có thể ghi âm cục bộ để tự nghe lại.</p>}
  </div>;
  if (mode === "review") return <div className="b56-pilot"><h3>Ghi nhớ</h3><p>{content.output}</p><p>Bài này là tài liệu luyện gốc trong Unit 1 pilot, không quy đổi thành band IELTS chính thức.</p></div>;
  return <div className="b56-pilot">
    {pilot.vocabulary && <><div className="b56-vocab">{pilot.vocabulary.map((word) => <div key={word.en}><strong>{word.en}</strong><span>{word.vi}</span><small>{word.example}</small></div>)}</div><OpenResponsePractice scoreKey="v3-vocabulary" title="Ghi nhớ 20 cụm từ" lessonSlug={lessonSlug} items={pilot.vocabulary.map((word, index) => ({ id: `v${index + 1}`, type: "short_answer", prompt: `Tiếng Anh của “${word.vi}” là gì?`, answer: word.en, explanation: word.example }))} /></>}
    {pilot.reading && <div className="b56-reading"><div className="b56-passage"><h3>{pilot.reading.title}</h3>{pilot.reading.passage.map(([label, text]) => <p key={label}><b>{label}.</b> {text}</p>)}</div><div className="b56-questions"><details open><summary>Danh sách headings</summary><ol>{pilot.reading.headings.map((heading) => <li key={heading}>{heading}</li>)}</ol></details><OpenResponsePractice scoreKey="v3-reading" lessonSlug={lessonSlug} title="12 câu Reading · kiểm tra từng câu" items={activities(pilot.reading.questions)} /></div></div>}
    {pilot.listening && <><p className="lab-note">Chưa có audio được duyệt. Dùng transcript để luyện nhận biết thông tin sửa đổi và đối chiếu đáp án; kết quả không tính là điểm Listening.</p><details className="b56-transcript"><summary>Mở lời thoại để phân tích</summary><p>{pilot.listening.transcript}</p></details><OpenResponsePractice scoreKey="v3-transcript" lessonSlug={lessonSlug} title="10 câu phân tích transcript" items={activities(pilot.listening.questions)} /></>}
    {pilot.grammar && <OpenResponsePractice scoreKey="v3-grammar" lessonSlug={lessonSlug} title="8 câu Grammar" items={pilot.grammar.map((item, index) => ({ id: `g${index + 1}`, type: "short_answer", prompt: item.prompt, answer: item.answer, explanation: item.explanation_vi }))} />}
    {pilot.writing && <WritingDraft content={pilot.writing} lessonSlug={lessonSlug} />}
    {pilot.speaking && <SpeakingPractice content={pilot.speaking} />}
  </div>;
}
