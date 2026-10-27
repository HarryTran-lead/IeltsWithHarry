"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, CircleAlert, Clock3, Flag, Headphones, ListChecks, Maximize2, Mic, Minimize2, NotebookPen, RotateCcw, ShieldCheck, Square, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { ExamContent, ExamQuestion } from "@/lib/ielts-bank/schema";
import { catalogGroups, type CatalogSkill } from "@/lib/ielts-bank/catalog";
import { librarySkills } from "./bank-library";
import "./bank-exam.css";

export type BankExam = { id: string; title: string; skill: string; practice_type?: string; format: string; mode: string; duration_minutes: number; attribution: string; license: string; license_url: string; source_url: string; ai_generated: boolean; topic?: string | null; content?: ExamContent };
export type ReviewItem = { id: string; given: string; correct: boolean; answers: string[]; explanation: string };

export const toneOf = (skill: string) => librarySkills[skill as CatalogSkill]?.tone ?? "reading";

/** "true_false_not_given" → "True / False / Not Given", "form_completion" → "Form completion". */
export function typeLabel(type: string) {
  if (/true[_-]false/.test(type)) return "True / False / Not Given";
  if (/yes[_-]no/.test(type)) return "Yes / No / Not Given";
  if (/multiple[_-]answers/.test(type)) return "Multiple choice · nhiều đáp án";
  if (/multiple[_-]choice/.test(type)) return "Multiple choice";
  const words = type.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function practiceLabel(exam: BankExam) {
  return catalogGroups[exam.skill as CatalogSkill]?.find((group) => group.id === exam.practice_type)?.label ?? exam.skill;
}

/** Bold (**text**), line breaks and answer blanks (____) from source prompts. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\n/);
  return <span className={className}>{lines.map((line, lineIndex) => <span key={lineIndex}>
    {lineIndex > 0 && <br />}
    {line.split(/(\*\*[^*]+\*\*|_{3,})/g).map((part, index) => part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : /^_{3,}$/.test(part) ? <span key={index} className="bx-blank" aria-label="chỗ trống" /> : part)}
  </span>)}</span>;
}

function examQuestions(content?: ExamContent) {
  return content?.sections.flatMap((section) => section.questions) ?? [];
}

const skillIcon = { Reading: ListChecks, Listening: Headphones, Writing: NotebookPen, Speaking: Mic } as const;

const beforeYouStart: Record<string, string[]> = {
  Reading: ["Đồng hồ chạy ngay khi bắt đầu; hết giờ bài được nộp tự động.", "Bài đọc ở bên trái, câu hỏi bên phải — dùng phím ← → để chuyển câu.", "Đánh dấu câu chưa chắc để quay lại trước khi nộp."],
  Listening: ["Đeo tai nghe và kiểm tra âm lượng trước khi bắt đầu.", "Đọc trước câu hỏi trong lúc chờ đoạn ghi âm phát.", "Viết đúng số từ yêu cầu; chính tả được tính khi chấm."],
  Writing: ["Dành vài phút đọc đề và lập dàn ý trước khi viết.", "Bộ đếm từ cho biết bạn đã đạt số từ tối thiểu chưa.", "Bài được lưu tự động; Writing cần người chấm, không có điểm tự động."],
  Speaking: ["Cho phép trình duyệt dùng micro để ghi âm câu trả lời.", "Bản ghi âm chỉ phát lại trên máy của bạn, không tải lên.", "Ghi ý chính vào ô bên dưới để lưu lại và ôn sau."],
};

/** The exam's cover page: what it is, what to expect, and when to practise it. */
export function ExamIntro({ exam, backHref, busy, error, onStart, scheduleSlot }: { exam: BankExam; backHref: string; busy: boolean; error: string; onStart: () => void; scheduleSlot: ReactNode }) {
  const questions = examQuestions(exam.content);
  const types = [...new Set(questions.map((question) => typeLabel(question.type)))];
  const Icon = skillIcon[exam.skill as keyof typeof skillIcon] ?? ListChecks;
  const preview = exam.skill === "Speaking" ? questions.slice(0, 3).map((question) => question.prompt) : [];
  return <main className={`bx-page bl-tone-${toneOf(exam.skill)}`}>
    <nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> {exam.skill}</Link><span>/</span>{practiceLabel(exam)}</nav>
    <section className="bx-hero">
      <div className="bx-hero-art"><TopicArt topic={`${(exam.topic ?? "").replace(/^topic_/, "")} ${exam.title}`} className="bx-art" /><span className="bx-hero-icon"><Icon size={22} /></span></div>
      <div className="bx-hero-copy">
        <span className="bx-kicker">{exam.skill} · {practiceLabel(exam)}</span>
        <h1>{exam.title}</h1>
        <div className="bx-facts">
          <span><Clock3 size={15} /> {exam.duration_minutes} phút</span>
          {questions.length > 0 && <span><ListChecks size={15} /> {questions.length} câu hỏi</span>}
          {exam.skill !== "Speaking" && <span>{exam.format.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())}</span>}
          {exam.ai_generated && <span>Nội dung AI đã duyệt</span>}
        </div>
        {types.length > 0 && exam.skill !== "Speaking" && <div className="bx-types">{types.slice(0, 6).map((type) => <span key={type}>{type}</span>)}</div>}
        {exam.content?.prompt && exam.skill === "Writing" && <p className="bx-prompt-preview"><RichText text={exam.content.prompt.split(/\n\n/)[0]} /></p>}
        {preview.length > 0 && <ul className="bx-question-preview">{preview.map((question) => <li key={question}>{question}</li>)}</ul>}
        <div className="bx-hero-actions">
          <button type="button" className="bx-start" disabled={busy} onClick={onStart}>{busy ? "Đang mở đề…" : "Bắt đầu làm bài"} <ArrowRight size={18} /></button>
          <span>Bài làm được lưu tự động</span>
        </div>
        {error && <p className="bx-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      </div>
    </section>
    <div className="bx-intro-grid">
      <section className="bx-card"><h2><Check size={17} /> Trước khi bắt đầu</h2><ul className="bx-tips">{(beforeYouStart[exam.skill] ?? beforeYouStart.Reading).map((tip) => <li key={tip}>{tip}</li>)}</ul></section>
      <section className="bx-card"><h2><CalendarPlus size={17} /> Lên lịch luyện</h2><p>Thêm đề này vào Study Planner để nhắc bạn luyện vào ngày đã chọn.</p>{scheduleSlot}</section>
      <section className="bx-card bx-source"><h2><ShieldCheck size={17} /> Nguồn đề</h2><p>Nội dung luyện tập, không liên kết với tổ chức IELTS.</p><p><a href={exam.source_url} target="_blank" rel="noreferrer">{exam.attribution}</a> · <a href={exam.license_url} target="_blank" rel="noreferrer">{exam.license}</a></p></section>
    </div>
  </main>;
}

/** The fixed bar above an attempt: title, progress, timer, fullscreen and submit. */
export function ExamBar({ exam, answered, total, remaining, busy, saveState, onSubmit }: { exam: BankExam; answered: number; total: number; remaining: number; busy: boolean; saveState: "idle" | "saving" | "saved" | "error"; onSubmit: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const minutes = Math.floor(remaining / 60), seconds = remaining % 60;
  const tone = remaining <= 60 ? "is-danger" : remaining <= 300 ? "is-warning" : "";
  return <header className="bx-bar">
    <div className="bx-bar-title"><span className="bx-skill-chip">{exam.skill}</span><div><strong>{exam.title}</strong><small>{total ? `Đã làm ${answered}/${total} câu` : "Bài viết tự do"} · {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Chưa lưu được" : "Tự động lưu"}</small></div></div>
    <span className={`bx-timer ${tone}`} role="timer" aria-label={`Còn ${minutes} phút ${seconds} giây`}><Clock3 size={16} /> {minutes}:{String(seconds).padStart(2, "0")}</span>
    <div className="bx-bar-actions">
      <button type="button" className="bx-ghost" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }} aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{fullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span></button>
      <button type="button" className="bx-submit" disabled={busy} onClick={onSubmit}>Nộp bài</button>
    </div>
  </header>;
}

export function QuestionNav({ questions, active, answers, flags, onPick }: { questions: ExamQuestion[]; active: number; answers: Record<string, string>; flags: string[]; onPick: (index: number) => void }) {
  return <nav className="bx-nav" aria-label="Chọn câu hỏi">{questions.map((question, index) => <button
    type="button"
    key={question.id}
    aria-current={active === index ? "step" : undefined}
    className={`${answers[question.id] ? "is-answered" : ""} ${flags.includes(question.id) ? "is-flagged" : ""}`}
    onClick={() => onPick(index)}
    aria-label={`Câu ${index + 1}${answers[question.id] ? ", đã trả lời" : ""}${flags.includes(question.id) ? ", đã đánh dấu" : ""}`}
  >{index + 1}</button>)}</nav>;
}

/** Choice buttons for options, True/False/Not Given and Yes/No/Not Given; a text field otherwise. */
export function AnswerInput({ question, value, onChange, index }: { question: ExamQuestion; value: string; onChange: (value: string) => void; index: number }) {
  const fixed = /true[_-]false/.test(question.type) ? ["TRUE", "FALSE", "NOT GIVEN"] : /yes[_-]no/.test(question.type) ? ["YES", "NO", "NOT GIVEN"] : [];
  const options = question.options.length ? question.options : fixed;
  if (options.length) {
    const many = /multiple[_-]answers/.test(question.type);
    const picked = many ? value.split(",").filter(Boolean) : [value];
    return <div className={`bx-options ${fixed.length && !question.options.length ? "is-inline" : ""}`} role={many ? "group" : "radiogroup"} aria-label={`Đáp án câu ${index + 1}`}>
      {options.map((option, optionIndex) => {
        const on = picked.includes(option);
        return <button type="button" key={option} role={many ? "checkbox" : "radio"} aria-checked={on} className={on ? "is-on" : ""} onClick={() => onChange(many ? (on ? picked.filter((item) => item !== option) : [...picked, option]).join(",") : option)}>
          {question.options.length > 0 && <b>{String.fromCharCode(65 + optionIndex)}</b>}<span>{option}</span>{on && <Check size={15} />}
        </button>;
      })}
    </div>;
  }
  return <label className="bx-text-answer"><span>Câu trả lời{question.wordLimit ? ` · ${question.wordLimit}` : ""}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Gõ câu trả lời…" aria-label={`Câu trả lời câu ${index + 1}`} /></label>;
}

/** Records a spoken answer for playback on this device only, beside a box for key ideas. */
export function SpeakingAnswer({ value, onChange, index }: { value: string; onChange: (value: string) => void; index: number }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const url = useRef("");
  useEffect(() => { if (!recording) return; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [recording]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); if (url.current) URL.revokeObjectURL(url.current); }, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Trình duyệt chưa hỗ trợ ghi âm."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(stream);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" }));
        setAudio(url.current);
        setRecording(false);
      };
      recorder.current = next;
      next.start();
      setSeconds(0);
      setRecording(true);
      setError("");
    } catch { setError("Không mở được micro. Kiểm tra quyền truy cập của trình duyệt."); }
  }
  return <div className="bx-speaking">
    <div className={`bx-recorder ${recording ? "is-live" : ""}`}>
      {recording ? <button type="button" onClick={() => recorder.current?.stop()}><Square size={16} /> Dừng · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</button>
        : <button type="button" onClick={() => void start()}>{audio ? <RotateCcw size={16} /> : <Mic size={16} />} {audio ? "Ghi lại" : "Ghi âm câu trả lời"}</button>}
      {audio && !recording && <audio controls src={audio} aria-label={`Bản ghi câu ${index + 1}`} />}
      {error && <small role="alert">{error}</small>}
    </div>
    <label className="bx-text-answer"><span>Ý chính / dàn ý của bạn</span><textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Ví dụ: ý 1 – lý do – ví dụ…" aria-label={`Ý chính cho câu ${index + 1}`} /></label>
  </div>;
}

export function WritingEditor({ value, onChange, minimum }: { value: string; onChange: (value: string) => void; minimum: number }) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const ratio = Math.min(1, words / Math.max(1, minimum));
  return <section className="bx-question bx-writing">
    <div className="bx-question-head"><span>Bài viết của bạn</span><b className={words >= minimum ? "is-done" : ""}>{words} / {minimum} từ</b></div>
    <div className="bx-meter" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /></div>
    <textarea aria-label="Bài viết" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Bắt đầu bằng một câu giới thiệu lại đề bài, rồi một đoạn tổng quan…" spellCheck />
    <details className="bx-checklist"><summary>Checklist trước khi nộp</summary><ul><li>Có đoạn tổng quan nêu xu hướng/đặc điểm chính</li><li>So sánh số liệu quan trọng, không liệt kê hết</li><li>Đủ {minimum} từ, kiểm tra chính tả và thì động từ</li></ul></details>
  </section>;
}

/** Asks before submitting, with what is still unanswered or flagged. */
export function SubmitDialog({ unanswered, flagged, busy, onCancel, onConfirm }: { unanswered: number; flagged: number; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirm.current?.focus(); const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onCancel]);
  return <div className="bx-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="bx-submit-title">
    <button type="button" className="bx-dialog-backdrop" aria-label="Đóng" tabIndex={-1} onClick={onCancel} />
    <div className="bx-dialog">
      <button type="button" className="bx-dialog-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
      <h2 id="bx-submit-title">Nộp bài ngay?</h2>
      {unanswered || flagged ? <ul>{unanswered > 0 && <li><CircleAlert size={16} /> Còn <b>{unanswered}</b> câu chưa trả lời</li>}{flagged > 0 && <li><Flag size={16} /> <b>{flagged}</b> câu đang đánh dấu xem lại</li>}</ul> : <p>Bạn đã trả lời tất cả câu hỏi.</p>}
      <div className="bx-dialog-actions"><button type="button" className="bx-ghost" onClick={onCancel}>Làm tiếp</button><button ref={confirm} type="button" className="bx-submit" disabled={busy} onClick={onConfirm}>{busy ? "Đang nộp…" : "Nộp bài"}</button></div>
    </div>
  </div>;
}

/** Score, a short verdict and a filterable review of every question. */
export function ExamResult({ title, skill, score, total, review, response, backHref, retryHref, onRetry }: { title: string; skill: string; score: number | null; total: number; review: ReviewItem[]; response?: string; backHref: string; retryHref?: string; onRetry?: () => void }) {
  const [filter, setFilter] = useState<"all" | "wrong" | "right">("all");
  const percent = total && score !== null ? Math.round((score / total) * 100) : null;
  const verdict = percent === null ? "Đã lưu bài làm" : percent >= 80 ? "Rất tốt! Giữ phong độ này." : percent >= 50 ? "Khá ổn — xem lại các câu sai bên dưới." : "Cần luyện thêm — đọc kỹ giải thích từng câu.";
  const shown = review.filter((item) => filter === "all" || (filter === "right" ? item.correct : !item.correct));
  return <main className={`bx-page bl-tone-${toneOf(skill)}`}>
    <nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> {skill}</Link><span>/</span>Kết quả</nav>
    <section className="bx-result-hero">
      <span className="bx-ring" style={{ "--ratio": percent === null ? 1 : percent / 100 } as React.CSSProperties}>{percent === null ? <Check size={34} /> : <><b>{score}</b><small>/{total}</small></>}</span>
      <div>
        <span className="bx-kicker">{skill} · Kết quả bài luyện</span>
        <h1>{title}</h1>
        <p className="bx-verdict">{verdict}</p>
        <p className="bx-muted">{total ? "Điểm thô của bài luyện tập, không phải band IELTS chính thức." : "Writing/Speaking cần người chấm; bài của bạn đã được lưu để xem lại."}</p>
        <div className="bx-hero-actions">{onRetry ? <button type="button" className="bx-start" onClick={onRetry}><RotateCcw size={17} /> Làm lại</button> : retryHref && <Link className="bx-start" href={retryHref}><RotateCcw size={17} /> Làm lại</Link>}<Link className="bx-ghost" href={backHref}>Về ngân hàng đề <ArrowRight size={16} /></Link></div>
      </div>
    </section>
    {response && <section className="bx-card bx-response"><h2><NotebookPen size={17} /> Bài làm của bạn</h2><p>{response}</p></section>}
    {review.length > 0 && <section className="bx-review">
      <div className="bx-review-head"><h2>Xem lại từng câu</h2><div className="bl-chips" role="group" aria-label="Lọc câu">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả <b>{review.length}</b></button>
        <button type="button" aria-pressed={filter === "wrong"} onClick={() => setFilter("wrong")}>Cần xem lại <b>{review.filter((item) => !item.correct).length}</b></button>
        <button type="button" aria-pressed={filter === "right"} onClick={() => setFilter("right")}>Đúng <b>{review.filter((item) => item.correct).length}</b></button>
      </div></div>
      <ol className="bx-review-list">{shown.map((item) => {
        const number = review.indexOf(item) + 1;
        return <li key={item.id} className={item.correct ? "is-right" : item.given ? "is-wrong" : "is-empty"}>
          <span className="bx-review-no">{number}</span>
          <div><b>{item.correct ? "Đúng" : item.given ? "Chưa đúng" : "Chưa trả lời"}</b>
            <p>Bạn trả lời: <span>{item.given || "—"}</span></p>
            <p>Đáp án: <strong>{item.answers.join(" / ") || "Cần chấm thủ công"}</strong></p>
            {item.explanation && <p className="bx-explain">{item.explanation}</p>}
          </div>
        </li>;
      })}</ol>
    </section>}
  </main>;
}

