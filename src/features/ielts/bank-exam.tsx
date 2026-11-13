"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, CircleAlert, Clock3, Flag, Headphones, ListChecks, Maximize2, Mic, Minimize2, NotebookPen, RotateCcw, ShieldCheck, Square, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { ExamContent, ExamQuestion, FiveStep } from "@/lib/ielts-bank/schema";
import { estimateBand } from "@/lib/ielts-bank/band";
import { typeLabel } from "@/lib/ielts-bank/labels";
import { listeningFullMinutes, listeningPartMinutes, readingFullMinutes, readingPassageMinutes } from "@/lib/ielts-bank/schema";
import { catalogGroups, type CatalogSkill } from "@/lib/ielts-bank/catalog";
import { displayExamTitle } from "@/lib/ielts-bank/display-title";
import { librarySkills } from "./bank-library";
import { writingFacets, writingSticker } from "./bank-writing-library";
import { TaskFigure } from "./writing-figure";
import { Sticker } from "@/components/stickers/stickers";
import { RichText } from "./rich-text";
import "./bank-exam.css";

export { RichText };

export type BankExam = { id: string; title: string; skill: string; practice_type?: string; format: string; mode: string; duration_minutes: number; attribution: string; license: string; license_url: string; source_url: string; ai_generated: boolean; topic?: string | null; content?: ExamContent };
export type ReviewItem = { id: string; given: string; correct: boolean; answers: string[]; explanation: string; type?: string; evidence?: { quote: string; paragraph: string } | null; fiveStep?: FiveStep; evidenceLines?: number[] };

export const toneOf = (skill: string) => librarySkills[skill as CatalogSkill]?.tone ?? "reading";

export { typeLabel };

function practiceLabel(exam: BankExam) {
  return catalogGroups[exam.skill as CatalogSkill]?.find((group) => group.id === exam.practice_type)?.label ?? exam.skill;
}

function examQuestions(content?: ExamContent) {
  return content?.sections.flatMap((section) => section.questions) ?? [];
}

const skillIcon = { Reading: ListChecks, Listening: Headphones, Writing: NotebookPen, Speaking: Mic } as const;

const beforeYouStart: Record<string, string[]> = {
  Reading: ["Đồng hồ chạy ngay khi bắt đầu; hết giờ bài được nộp tự động.", "Bài đọc ở bên trái, câu hỏi bên phải — dùng phím ← → để chuyển câu.", "Đánh dấu câu chưa chắc để quay lại trước khi nộp."],
  Listening: ["Đeo tai nghe và kiểm tra âm lượng trước khi bắt đầu.", "Đọc trước câu hỏi trong lúc chờ đoạn ghi âm phát.", "Viết đúng số từ yêu cầu; chính tả được tính khi chấm."],
  Writing: ["Dành vài phút đọc đề và lập dàn ý trước khi viết.", "Bộ đếm từ cho biết bạn đã đạt số từ tối thiểu chưa.", "Sau khi nộp bài, bấm Gửi bài để chấm để nhận band luyện tập ước lượng từ AI."],
  Speaking: ["Cho phép trình duyệt dùng micro để ghi âm câu trả lời.", "Bản ghi âm chỉ phát lại trên máy của bạn, không tải lên.", "Ghi ý chính vào ô bên dưới để lưu lại và ôn sau."],
};

/** "Passage 3: Should Public Data…" → "Should Public Data…"; a bare "Passage 3" gives "". */
function bareTitle(title: string) {
  return title.replace(/^(?:reading\s+)?(?:passage|part|section)\s*\d+\s*(?:[:\-–—]\s*)?/i, "").trim();
}

/**
 * A Writing task's cover: Task 1 shows its own figure (the image, or the chart
 * drawn from its data), Task 2 a sticker for the essay theme, never a stock picture.
 */
function WritingHeroArt({ exam }: { exam: BankExam }) {
  const content = exam.content;
  const facets = writingFacets({ title: exam.title, topic: exam.topic, practice_type: exam.practice_type ?? "task2", prompt_preview: content?.prompt ?? null, visual: (content?.visual as Record<string, unknown> | undefined) ?? null, task_type: content?.taskType ?? null });
  if (exam.practice_type === "task1_academic") return <div className="bx-hero-art is-figure">
    {/* The figure is the task itself, hosted wherever the source keeps it. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {content?.imageUrl ? <img src={content.imageUrl} alt={content.figureDescription || "Hình của đề"} /> : content?.visual ? <TaskFigure visual={content.visual} /> : <Sticker name="chart" size={120} tilt={-5} pop={false} />}
    <b className="bx-hero-kind">{facets.kindLabel}</b>
  </div>;
  const sticker = writingSticker(facets.topic);
  return <div className="bx-hero-art is-sticker" style={{ background: sticker.tone }}>
    <Sticker name={sticker.name} size={150} tilt={-6} pop={false} />
    <b className="bx-hero-kind">{facets.topicLabel}</b>
  </div>;
}

/** The exam's cover page: what it is, what to expect, and when to practise it. */
export type ResumableAttempt = { id: string; part: number; minutesLeft: number };

export function ExamIntro({ exam, backHref, busy, error, onStart, scheduleSlot, resumable = [] }: { exam: BankExam; backHref: string; busy: boolean; error: string; onStart: (scope?: { section: string; ids: string[] }, options?: { view: "practice" | "exam"; minutes?: number }) => void; scheduleSlot: ReactNode; resumable?: ResumableAttempt[] }) {
  const searchParams = useSearchParams();
  const parts = (exam.content?.sections ?? []).filter((section) => section.questions.length);
  const partNumber = Number(searchParams.get("part"));
  const [readingPart, setReadingPart] = useState(Number.isInteger(partNumber) && partNumber > 0 ? partNumber : 0);
  const [readingView, setReadingView] = useState<"practice" | "exam">("practice");
  const [readingMinutes, setReadingMinutes] = useState<number>(exam.skill === "Listening" ? 40 : 60);
  const [passageMinutes, setPassageMinutes] = useState<number>(20);
  const selectedPart = (exam.skill === "Reading" || exam.skill === "Listening") && Number.isInteger(partNumber) && partNumber > 0 ? parts[partNumber - 1] : undefined;
  const partName = (index: number) => exam.skill === "Listening" ? `Part ${index + 1}` : `Passage ${index + 1}`;
  const questions = selectedPart?.questions ?? examQuestions(exam.content);
  const selectedLabel = selectedPart ? partName(partNumber - 1) : practiceLabel(exam);
  const duration = selectedPart ? exam.skill === "Reading" ? 20 : 10 : exam.duration_minutes;
  const types = [...new Set(questions.map((question) => typeLabel(question.type)))];
  const Icon = skillIcon[exam.skill as keyof typeof skillIcon] ?? ListChecks;
  const preview = exam.skill === "Speaking" ? questions.slice(0, 3).map((question) => question.prompt) : [];
  if (exam.skill === "Reading" || exam.skill === "Listening") {
    const listening = exam.skill === "Listening";
    const fullTimes = listening ? listeningFullMinutes : readingFullMinutes;
    const partTimes = listening ? listeningPartMinutes : readingPassageMinutes;
    const chosen = readingPart > 0 ? parts[readingPart - 1] : undefined;
    const count = chosen ? chosen.questions.length : examQuestions(exam.content).length;
    return <main className={`bx-reading-launch bl-tone-${toneOf(exam.skill)}`}>
      <div className="br-launch-dialog" role="dialog" aria-modal="true" aria-labelledby="br-launch-title">
        <header className="br-launch-head"><div><span className="bx-kicker">IELTS {exam.skill}{chosen ? ` · ${displayExamTitle(exam.title)}` : ""}</span><h1 id="br-launch-title">{chosen ? `${partName(readingPart - 1)}: ${bareTitle(chosen.title)}` : displayExamTitle(exam.title)}</h1></div><Link href={backHref} aria-label="Đóng và về danh sách đề"><X size={19} /></Link></header>
        {(() => {
          // An unfinished attempt of the part being chosen (or of any part) is offered before starting again.
          const open = resumable.find((item) => item.part === readingPart) ?? resumable[0];
          if (!open) return null;
          const what = open.part ? partName(open.part - 1) : "Full test";
          return <div className="br-launch-resume" role="status"><span>Bạn có một lượt làm dở <b>{what}</b> · {open.minutesLeft > 0 ? `còn ${open.minutesLeft} phút` : "đã hết giờ, mở để nộp"}.</span><Link href={`/app/question-bank/attempt/${open.id}`}>Làm tiếp <ArrowRight size={15} /></Link></div>;
        })()}
        <div className="br-launch-scroll">
          <section className="br-launch-card"><h2>Bước 1: Chọn chế độ luyện tập</h2><div className="br-launch-choices">
            <div className={`br-launch-choice ${readingPart === 0 ? "is-on" : ""}`}><div className="br-launch-choice-head"><strong>Làm full test</strong><select value={readingMinutes} onChange={(event) => setReadingMinutes(Number(event.target.value))} aria-label="Thời gian làm full đề">{fullTimes.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}</select></div><small>Làm toàn bộ bài {exam.skill}</small><label><input type="radio" name="exam-part" checked={readingPart === 0} onChange={() => setReadingPart(0)} /><span>Full test</span><em>{examQuestions(exam.content).length} câu</em></label></div>
            <div className={`br-launch-choice br-launch-parts ${readingPart > 0 ? "is-on" : ""}`}><div className="br-launch-choice-head"><strong>Luyện từng phần</strong><select value={passageMinutes} onChange={(event) => setPassageMinutes(Number(event.target.value))} aria-label="Thời gian làm từng phần">{partTimes.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}</select></div><small>Chọn phần bạn muốn luyện</small>{parts.map((part, index) => <label key={part.id}><input type="radio" name="exam-part" checked={readingPart === index + 1} onChange={() => setReadingPart(index + 1)} /><span>{partName(index)}{bareTitle(part.title) && <small className="br-launch-part-title">{bareTitle(part.title)}</small>}</span><em>{part.questions.length} câu</em></label>)}</div>
          </div></section>
          <section className="br-launch-card"><h2>Bước 2: Chọn giao diện làm bài</h2><div className="br-launch-choices">
            <label className={`br-launch-choice br-launch-view ${readingView === "practice" ? "is-on" : ""}`}><div className="br-launch-preview is-practice"><i /><span /><span /><b /></div><div><input type="radio" name="exam-view" checked={readingView === "practice"} onChange={() => setReadingView("practice")} /><strong>Giao diện Luyện tập</strong></div><small>{listening ? "Có điều khiển âm thanh, ghi chú và chuyển Part để luyện." : "Có tô sáng và điều chỉnh cỡ chữ. Bài đọc và câu hỏi ở hai khung."}</small></label>
            <label className={`br-launch-choice br-launch-view ${readingView === "exam" ? "is-on" : ""}`}><div className="br-launch-preview is-exam"><i /><span /><span /><b /></div><div><input type="radio" name="exam-view" checked={readingView === "exam"} onChange={() => setReadingView("exam")} /><strong>Giao diện Thi thật</strong></div><small>{listening ? "Bố cục thi máy tập trung vào âm thanh, câu hỏi và đồng hồ." : "Bố cục thi máy gọn, tập trung vào đồng hồ, bài đọc và câu hỏi."}</small></label>
          </div></section>
        </div>
        <footer className="br-launch-footer"><span>{count} câu · {chosen ? passageMinutes : readingMinutes} phút · {readingView === "practice" ? "Luyện tập" : "Thi thật"}</span><button type="button" className="bx-start" disabled={busy} onClick={() => onStart(chosen ? { section: chosen.id, ids: chosen.questions.map((question) => question.id) } : undefined, { view: readingView, minutes: chosen ? passageMinutes : readingMinutes })}>{busy ? "Đang mở đề…" : resumable.some((item) => item.part === readingPart) ? "Bắt đầu lượt mới" : "Bắt đầu làm bài"} <ArrowRight size={18} /></button></footer>
        {error && <p className="bx-error" role="alert">{error}</p>}
      </div>
    </main>;
  }
  return <main className={`bx-page bl-tone-${toneOf(exam.skill)}`}>
    <nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> {exam.skill}</Link><span>/</span>{selectedLabel}</nav>
    <section className="bx-hero">
      {exam.skill === "Writing" ? <WritingHeroArt exam={exam} />
        : <div className="bx-hero-art"><TopicArt topic={`${(exam.topic ?? "").replace(/^topic_/, "")} ${exam.title}`} className="bx-art" /><span className="bx-hero-icon"><Icon size={22} /></span></div>}
      <div className="bx-hero-copy">
        <span className="bx-kicker">{exam.skill} · {selectedLabel}</span>
        <h1>{selectedPart && !/^(?:reading\s+)?passage\s*\d+\s*$|^(?:listening\s+)?(?:section|part)\s*\d+\s*$/i.test(selectedPart.title) ? selectedPart.title : displayExamTitle(exam.title)}</h1>
        <div className="bx-facts">
          <span><Clock3 size={15} /> {duration} phút</span>
          {questions.length > 0 && <span><ListChecks size={15} /> {questions.length} câu hỏi</span>}
          {exam.skill !== "Speaking" && <span>{exam.format.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())}</span>}
          {exam.ai_generated && <span>Nội dung AI đã duyệt</span>}
        </div>
        {types.length > 0 && exam.skill !== "Speaking" && <div className="bx-types">{types.slice(0, 6).map((type) => <span key={type}>{type}</span>)}</div>}
        {exam.content?.prompt && exam.skill === "Writing" && <p className="bx-prompt-preview"><RichText text={exam.content.prompt.split(/\n\n/)[0]} /></p>}
        {preview.length > 0 && <ul className="bx-question-preview">{preview.map((question) => <li key={question}>{question}</li>)}</ul>}
        <div className="bx-hero-actions">
          <button type="button" className="bx-start" disabled={busy} onClick={() => onStart(selectedPart ? { section: selectedPart.id, ids: selectedPart.questions.map((question) => question.id) } : undefined)}>{busy ? "Đang mở đề…" : selectedPart ? `Luyện ${selectedLabel}` : "Bắt đầu làm bài"} <ArrowRight size={18} /></button>
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
export function ExamBar({ exam, answered, total, remaining, busy, saveState, onSubmit, onExit }: { exam: BankExam; answered: number; total: number; remaining: number; busy: boolean; saveState: "idle" | "saving" | "saved" | "error"; onSubmit: () => void; onExit?: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const minutes = Math.floor(remaining / 60), seconds = remaining % 60;
  const tone = remaining <= 60 ? "is-danger" : remaining <= 300 ? "is-warning" : "";
  return <header className={`bx-bar ${exam.skill === "Reading" && onExit ? "bx-test-bar" : ""}`}>
    <div className="bx-bar-title">{onExit && exam.skill === "Reading" ? <span className="bx-test-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ieltswithharry-mascot.webp" alt="" />
      <span>Ielts<b>WithHarry</b></span>
    </span> : <span className="bx-skill-chip">{exam.skill}</span>}<div><strong>{displayExamTitle(exam.title)}</strong><small>{total ? `Đã làm ${answered}/${total} câu` : "Bài viết tự do"} · {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Chưa lưu được" : "Tự động lưu"}</small></div></div>
    <span className={`bx-timer ${tone}`} role="timer" aria-label={`Còn ${minutes} phút ${seconds} giây`}><Clock3 size={16} /> {minutes}:{String(seconds).padStart(2, "0")}</span>
    <div className="bx-bar-actions">
      {onExit && <button type="button" className="bx-ghost bx-exit" disabled={busy} onClick={onExit}><ArrowLeft size={17} /><span>Rời bài</span></button>}
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
    // A grouped "Choose TWO" item asks one letter per question; an ungrouped one ticks every letter at once.
    const many = /multiple[_-]answers/.test(question.type) && !question.group;
    const picked = many ? value.split(",").filter(Boolean) : [value];
    const lettersOnly = question.options.length > 0 && question.options.every((option) => /^[A-Z]$/.test(option));
    return <div className={`bx-options ${fixed.length && !question.options.length ? "is-inline" : ""} ${lettersOnly ? "is-letters" : ""}`} role={many ? "group" : "radiogroup"} aria-label={`Đáp án câu ${index + 1}`}>
      {options.map((option, optionIndex) => {
        const on = picked.includes(option);
        const letter = String.fromCharCode(65 + optionIndex);
        // Lettered options ("C — text", or just "C" on a map) already get the letter badge, so drop the repeat.
        const display = /multiple[_-]choice/.test(question.type)
          ? option.replace(/^\s*[A-D]\s+—\s*/i, "").replace(/^\s*[A-D][).]\s*/i, "")
          : option.startsWith(`${letter} — `) ? option.slice(letter.length + 3) : option;
        return <button type="button" key={option} role={many ? "checkbox" : "radio"} aria-checked={on} className={on ? "is-on" : ""} onClick={() => onChange(many ? (on ? picked.filter((item) => item !== option) : [...picked, option]).join(",") : option)}>
          {question.options.length > 0 && <b>{letter}</b>}{!(question.options.length > 0 && display === letter) && <span>{display}</span>}{on && <Check size={15} />}
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

/** Asks before submitting, with what is still unanswered or flagged. */
export type QuestionRef = { id: string; number: number };

/** Asks before submitting, with what is still unanswered or flagged; with `onJump`, each number opens that question. */
export function SubmitDialog({ unanswered, flagged, busy, onCancel, onConfirm, answered, unansweredList, flaggedList, onJump }: { unanswered: number; flagged: number; busy: boolean; onCancel: () => void; onConfirm: () => void; answered?: number; unansweredList?: QuestionRef[]; flaggedList?: QuestionRef[]; onJump?: (id: string) => void }) {
  const confirm = useRef<HTMLButtonElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { (unanswered || flagged ? continueButton : confirm).current?.focus(); const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onCancel, unanswered, flagged]);
  const numbers = (list: QuestionRef[], tone: string) => <div className="bx-jump-list">{list.map((item) => <button type="button" key={item.id} className={tone} onClick={() => onJump?.(item.id)} aria-label={`Mở câu ${item.number}`}>{item.number}</button>)}</div>;
  const detailed = Boolean(onJump && (unansweredList?.length || flaggedList?.length));
  return <div className="bx-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="bx-submit-title">
    <button type="button" className="bx-dialog-backdrop" aria-label="Đóng" tabIndex={-1} onClick={onCancel} />
    <div className={`bx-dialog ${detailed ? "is-detailed" : ""}`}>
      <button type="button" className="bx-dialog-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
      <h2 id="bx-submit-title">Nộp bài ngay?</h2>
      {detailed ? <>
        <div className="bx-submit-stats">
          {answered !== undefined && <span className="is-done"><b>{answered}</b>đã làm</span>}
          <span className="is-empty"><b>{unanswered}</b>còn trống</span>
          <span className="is-flag"><b>{flagged}</b>đang đánh dấu</span>
        </div>
        {unansweredList && unansweredList.length > 0 && <div className="bx-jump-group"><strong>Câu còn trống</strong>{numbers(unansweredList, "is-empty")}</div>}
        {flaggedList && flaggedList.length > 0 && <div className="bx-jump-group"><strong>Đang đánh dấu xem lại</strong>{numbers(flaggedList, "is-flag")}</div>}
        <p className="bx-jump-hint">Bấm một số để đóng hộp này và mở câu đó.</p>
      </> : unanswered || flagged ? <ul>{unanswered > 0 && <li><CircleAlert size={16} /> Còn <b>{unanswered}</b> câu chưa trả lời</li>}{flagged > 0 && <li><Flag size={16} /> <b>{flagged}</b> câu đang đánh dấu xem lại</li>}</ul> : <p>Bạn đã trả lời tất cả câu hỏi.</p>}
      <div className="bx-dialog-actions"><button ref={continueButton} type="button" className="bx-ghost" onClick={onCancel}>Làm tiếp</button><button ref={confirm} type="button" className="bx-submit" disabled={busy} onClick={onConfirm}>{busy ? "Đang nộp…" : unanswered ? "Vẫn nộp bài" : "Nộp bài"}</button></div>
    </div>
  </div>;
}

export { estimateBand };

/** Score, band, per-question-type table and a filterable review of every question. */
export function ExamResult({ title, skill, format = "Academic", score, total, review, response, backHref, retryHref, onRetry, numberOf, extra }: { title: string; skill: string; format?: string; score: number | null; total: number; review: ReviewItem[]; response?: string; backHref: string; retryHref?: string; onRetry?: () => void; numberOf?: (id: string) => number; extra?: ReactNode }) {
  const [filter, setFilter] = useState<"all" | "wrong" | "right">("all");
  const percent = total && score !== null ? Math.round((score / total) * 100) : null;
  const band = score !== null ? estimateBand(skill, format, score, total) : null;
  const wrong = review.filter((item) => !item.correct && item.given).length;
  const skipped = review.filter((item) => !item.given).length;
  const verdict = percent === null ? "Đã lưu bài làm" : percent >= 80 ? "Rất tốt! Giữ phong độ này." : percent >= 50 ? "Khá ổn — xem lại các câu sai bên dưới." : "Đề hơi khó — mình cố thêm nhé, đọc kỹ giải thích từng câu.";
  const shown = review.filter((item) => filter === "all" || (filter === "right" ? item.correct : !item.correct));
  const byType = [...review.reduce((map, item) => {
    const key = typeLabel(item.type ?? "other");
    const row = map.get(key) ?? { total: 0, right: 0, wrong: 0, skipped: 0 };
    row.total++; if (item.correct) row.right++; else if (item.given) row.wrong++; else row.skipped++;
    return map.set(key, row);
  }, new Map<string, { total: number; right: number; wrong: number; skipped: number }>())];
  return <main className={`bx-page bl-tone-${toneOf(skill)}`}>
    <nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> {skill}</Link><span>/</span>Kết quả</nav>
    <section className={`bx-result-hero${skill === "Writing" ? " bx-writing-result-hero" : ""}`}>
      {band !== null ? <span className="bx-band"><small>Band ước tính</small><b>{band.toFixed(1)}</b></span> : null}
      {skill !== "Writing" && <span className="bx-ring" style={{ "--ratio": percent === null ? 1 : percent / 100 } as React.CSSProperties}>{percent === null ? <Check size={34} /> : <><b>{score}</b><small>/{total}</small></>}</span>}
      <div>
        <span className="bx-kicker">{skill} · Kết quả bài luyện</span>
        <h1>{title}</h1>
        <p className="bx-verdict">{verdict}</p>
        {total > 0 && <div className="bx-tally"><span className="is-right">Đúng <b>{score}</b></span><span className="is-wrong">Sai <b>{wrong}</b></span><span>Bỏ qua <b>{skipped}</b></span></div>}
        <p className="bx-muted">{total ? `Band quy đổi theo bảng điểm IELTS${total !== 40 ? ", ước tính từ số câu bạn đã làm" : ""}; đây là bài luyện tập, không phải điểm chính thức.` : "Bài của bạn đã được lưu để xem lại."}</p>
        <div className="bx-hero-actions">{skill === "Writing" && <a className="bx-ghost" href="#writing-review">Xem đánh giá ↓</a>}{onRetry ? <button type="button" className="bx-start" onClick={onRetry}><RotateCcw size={17} /> Làm lại</button> : retryHref && <Link className="bx-start" href={retryHref}><RotateCcw size={17} /> Làm lại</Link>}<Link className="bx-ghost" href={backHref}>Về ngân hàng đề <ArrowRight size={16} /></Link></div>
      </div>
    </section>
    {extra}
    {response && !extra && <section className="bx-card bx-response"><h2><NotebookPen size={17} /> Bài làm của bạn</h2><p>{response}</p></section>}
    {byType.length > 0 && <section className="bx-card bx-types-table"><h2><ListChecks size={17} /> Bảng dữ liệu chi tiết</h2><div className="bq-table-wrap"><table>
      <thead><tr><th>Loại câu hỏi</th><th>Số câu</th><th className="is-right">Đúng</th><th className="is-wrong">Sai</th><th>Bỏ qua</th></tr></thead>
      <tbody>{byType.map(([type, row]) => <tr key={type}><th>{type}</th><td>{row.total}</td><td><span className="is-right">{row.right}</span></td><td><span className="is-wrong">{row.wrong}</span></td><td><span>{row.skipped}</span></td></tr>)}</tbody>
    </table></div></section>}
    {review.length > 0 && <section className="bx-review">
      <div className="bx-review-head"><h2>Xem giải thích từng câu</h2><div className="bl-chips" role="group" aria-label="Lọc câu">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả <b>{review.length}</b></button>
        <button type="button" aria-pressed={filter === "wrong"} onClick={() => setFilter("wrong")}>Cần xem lại <b>{review.filter((item) => !item.correct).length}</b></button>
        <button type="button" aria-pressed={filter === "right"} onClick={() => setFilter("right")}>Đúng <b>{review.filter((item) => item.correct).length}</b></button>
      </div></div>
      <ol className="bx-review-list">{shown.map((item) => {
        const number = numberOf?.(item.id) || review.indexOf(item) + 1;
        return <li key={item.id} className={item.correct ? "is-right" : item.given ? "is-wrong" : "is-empty"}>
          <span className="bx-review-no">{number}</span>
          <div><b>{item.correct ? "Đúng" : item.given ? "Chưa đúng" : "Chưa trả lời"}</b>{item.type && <small className="bx-review-type">{typeLabel(item.type)}</small>}
            <p>Bạn trả lời: <span>{item.given || "—"}</span></p>
            <p>Đáp án: <strong>{item.answers.join(" / ") || "Cần chấm thủ công"}</strong></p>
            {item.explanation && <p className="bx-explain">{item.explanation}</p>}
          </div>
        </li>;
      })}</ol>
    </section>}
  </main>;
}
