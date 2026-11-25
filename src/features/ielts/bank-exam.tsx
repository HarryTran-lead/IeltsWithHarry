"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, CircleAlert, Clock3, Flag, Headphones, Lightbulb, ListChecks, Maximize2, Mic, Minimize2, Minus, Plus, NotebookPen, RotateCcw, ShieldCheck, Square, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { ExamContent, ExamQuestion, FiveStep } from "@/lib/ielts-bank/schema";
import { estimateBand } from "@/lib/ielts-bank/band";
import { typeLabel } from "@/lib/ielts-bank/labels";
import { customAttemptMinutes, untimedLimitMinutes } from "@/lib/ielts-bank/schema";
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
export type ResumableAttempt = { id: string; part: number; minutesLeft: number; untimed?: boolean };

function savedDuration(key: string) {
  try { return Number(window.localStorage.getItem(key)); } catch { return 0; }
}

function rememberDuration(key: string, minutes: number) {
  if (!customAttemptMinutes(minutes)) return;
  try { window.localStorage.setItem(key, String(minutes)); } catch { /* The current attempt still uses this choice. */ }
}

export function ExamIntro({ exam, backHref, busy, error, onStart, scheduleSlot, resumable = [] }: { exam: BankExam; backHref: string; busy: boolean; error: string; onStart: (scope?: { section: string; ids: string[] }, options?: { view: "practice" | "exam"; minutes?: number; untimed?: boolean }) => void; scheduleSlot: ReactNode; resumable?: ResumableAttempt[] }) {
  const searchParams = useSearchParams();
  const parts = (exam.content?.sections ?? []).filter((section) => section.questions.length);
  const partNumber = Number(searchParams.get("part"));
  const [readingPart, setReadingPart] = useState(Number.isInteger(partNumber) && partNumber > 0 ? partNumber : 0);
  const [readingView, setReadingView] = useState<"practice" | "exam">("practice");
  const [readingMinutes, setReadingMinutes] = useState<number>(exam.skill === "Listening" ? 40 : 60);
  const [passageMinutes, setPassageMinutes] = useState<number>(exam.skill === "Listening" ? 10 : 20);
  const [passageUntimed, setPassageUntimed] = useState(false);
  useEffect(() => {
    if (exam.skill !== "Reading" && exam.skill !== "Listening") return;
    const full = savedDuration(`ielts-${exam.skill}-full-minutes`);
    const part = savedDuration(`ielts-${exam.skill}-part-minutes`);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (customAttemptMinutes(full)) setReadingMinutes(full);
      if (customAttemptMinutes(part)) setPassageMinutes(part);
    });
    return () => { active = false; };
  }, [exam.skill]);
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
    const unit = listening ? "part" : "passage";
    const chosen = readingPart > 0 ? parts[readingPart - 1] : undefined;
    const total = examQuestions(exam.content).length;
    const count = chosen ? chosen.questions.length : total;
    // The IELTS timing for this scope; "Thi thật" always runs on it.
    const standard = chosen ? (listening ? 10 : 20) : (listening ? 40 : 60);
    const picked = chosen ? passageMinutes : readingMinutes;
    const examView = readingView === "exam";
    // No countdown: a single passage/part, practice view only.
    const untimed = Boolean(chosen) && !examView && passageUntimed;
    const minutes = examView ? standard : picked;
    const custom = !examView && !untimed && picked !== standard;
    const timeText = untimed ? "Tự do thời gian" : `${minutes} phút`;
    const setMinutes = (value: number) => {
      const next = Math.min(180, Math.max(5, value));
      setPassageUntimed(false);
      if (chosen) setPassageMinutes(next); else setReadingMinutes(next);
      rememberDuration(`ielts-${exam.skill}-${chosen ? "part" : "full"}-minutes`, next);
    };
    const openParts = new Set(resumable.map((item) => item.part));
    const open = resumable.find((item) => item.part === readingPart) ?? resumable[0];
    const scopeName = chosen ? partName(readingPart - 1) : "Full test";
    const practiceTags = listening ? ["Điều khiển âm thanh", "Ghi chú", "Chuyển Part"] : ["Tô sáng", "Chỉnh cỡ chữ", "Bài đọc + câu hỏi 2 khung"];
    return <main className={`bx-reading-launch bl-tone-${toneOf(exam.skill)}`}>
      <div className="br-launch-dialog brl" role="dialog" aria-modal="true" aria-labelledby="br-launch-title">
        <header className="br-launch-head brl-head">
          <div>
            <span className="brl-kicker"><b>{exam.skill}</b>{displayExamTitle(exam.title)} · {scopeName}</span>
            <h1 id="br-launch-title">{chosen ? bareTitle(chosen.title) || scopeName : displayExamTitle(exam.title)}</h1>
            <p>{chosen ? scopeName : `${parts.length} ${unit}`} · {count} câu hỏi · {timeText}</p>
          </div>
          <Link href={backHref} aria-label="Đóng và về danh sách đề"><X size={19} /></Link>
        </header>
        <div className="br-launch-scroll brl-scroll">
          {open && <div className="brl-resume" role="status">
            <span className="brl-resume-icon" aria-hidden="true"><Clock3 size={18} /></span>
            <span>Bạn đang làm dở <b>{open.part ? partName(open.part - 1) : "Full test"}</b> · {open.untimed ? "tự do thời gian" : open.minutesLeft > 0 ? `còn ${open.minutesLeft} phút` : "đã hết giờ, mở để nộp"}</span>
            <Link href={`/app/question-bank/attempt/${open.id}`}>Làm tiếp <ArrowRight size={15} /></Link>
          </div>}
          {chosen ? <section className="brl-pick" aria-label="Bài bạn sẽ làm">
            <span className="brl-badge" aria-hidden="true">P{readingPart}</span>
            <div className="brl-pick-body">
              <small>Bài bạn sẽ làm</small>
              <div className="brl-chips"><span><ListChecks size={15} /> {count} câu hỏi</span><span><Clock3 size={15} /> {timeText}</span>{openParts.has(readingPart) && <em className="brl-tag is-open">Đang làm dở</em>}</div>
              {parts.length > 1 && <div className="brl-switch"><small>Đổi sang:</small>{parts.map((part, index) => index + 1 === readingPart ? null : <button type="button" key={part.id} onClick={() => setReadingPart(index + 1)}>{partName(index)}</button>)}</div>}
            </div>
            <button type="button" className="brl-link" onClick={() => setReadingPart(0)}>Làm cả đề ({total} câu)</button>
          </section>
            : <section className="brl-structure" aria-label="Cấu trúc đề">
              <div className="brl-structure-head"><small>Cấu trúc đề · làm liên tục</small><b>{parts.length} {unit} · {total} câu</b></div>
              <div className="brl-bar" aria-hidden="true">{parts.map((part, index) => <i key={part.id} className={openParts.has(index + 1) ? "is-open" : ""} style={{ flexGrow: part.questions.length }} />)}</div>
              <div className="brl-parts" style={{ "--brl-cols": Math.min(parts.length, 4) || 1 } as CSSProperties}>
                {parts.map((part, index) => <div key={part.id} className="brl-part">
                  <small>{partName(index)} · {part.questions.length} câu</small>
                  <strong>{bareTitle(part.title) || partName(index)}</strong>
                  <div>{openParts.has(index + 1) && <em className="brl-tag is-open">Đang làm dở</em>}<button type="button" onClick={() => setReadingPart(index + 1)}>Chỉ luyện phần này</button></div>
                </div>)}
              </div>
              {!listening && parts.length > 1 && <p className="brl-note"><Lightbulb size={15} aria-hidden="true" /> Độ khó tăng dần qua từng passage, nên dành nhiều thời gian hơn cho passage cuối.</p>}
            </section>}
          <section className="brl-section">
            <h2>Chọn giao diện làm bài</h2>
            <div className="brl-views">
              <label className={`brl-view ${examView ? "" : "is-on"}`}>
                <div className="brl-preview is-practice" aria-hidden="true"><div><i /><i className="is-mark" /><i /><i /></div><div><i /><i /><i /></div></div>
                <div className="brl-view-title"><input type="radio" name="exam-view" checked={!examView} onChange={() => setReadingView("practice")} /><strong>Luyện tập</strong><em className="brl-tag">Khuyên dùng</em></div>
                <div className="brl-view-tags">{practiceTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </label>
              <label className={`brl-view ${examView ? "is-on" : ""}`}>
                <div className="brl-preview is-exam" aria-hidden="true"><b>{standard}:00</b><div><i /><i /><i /></div><div><i /><i /></div></div>
                <div className="brl-view-title"><input type="radio" name="exam-view" checked={examView} onChange={() => setReadingView("exam")} /><strong>Thi thật</strong></div>
                <div className="brl-view-tags"><span>Giống thi máy</span><span>Đồng hồ đếm ngược</span><span>Tập trung tối đa</span></div>
              </label>
            </div>
          </section>
          <section className="brl-section">
            <div className="brl-section-head"><h2>Thời gian làm bài</h2><small>{examView ? `Thi thật luôn tính ${standard} phút như đề thật` : untimed ? "Không đếm ngược, đồng hồ chỉ tính thời gian đã làm" : "Luyện chậm hơn hoặc ép tốc độ tùy bạn"}</small></div>
            <div className="brl-times">
              <button type="button" aria-pressed={!custom && !untimed} className={custom || untimed ? "" : "is-on"} onClick={() => setMinutes(standard)}>{standard} phút · chuẩn</button>
              <button type="button" aria-pressed={custom} className={custom ? "is-on" : ""} disabled={examView} onClick={() => setMinutes(picked === standard ? standard + 5 : picked)}>Tự chọn</button>
              {chosen && <button type="button" aria-pressed={untimed} className={untimed ? "is-on" : ""} disabled={examView} onClick={() => setPassageUntimed(true)}>Tự do thời gian</button>}
              {custom && <div className="brl-stepper">
                <button type="button" aria-label="Giảm 5 phút" disabled={picked <= 5} onClick={() => setMinutes(picked - 5)}><Minus size={16} /></button>
                <span aria-live="polite">{picked} phút</span>
                <button type="button" aria-label="Tăng 5 phút" disabled={picked >= 180} onClick={() => setMinutes(picked + 5)}><Plus size={16} /></button>
              </div>}
            </div>
          </section>
        </div>
        <footer className="br-launch-footer brl-footer">
          <div><small>Bạn sẽ làm</small><b>{scopeName} · {count} câu · {timeText} · {examView ? "Thi thật" : "Luyện tập"}</b></div>
          <div className="brl-actions">
            <Link href={backHref} className="brl-cancel">Huỷ</Link>
            <button type="button" className="bx-start" disabled={busy || (!untimed && !customAttemptMinutes(minutes))} onClick={() => onStart(chosen ? { section: chosen.id, ids: chosen.questions.map((question) => question.id) } : undefined, untimed ? { view: readingView, untimed: true } : { view: readingView, minutes })}>{busy ? "Đang mở đề…" : openParts.has(readingPart) ? "Bắt đầu lượt mới" : "Bắt đầu làm bài"} <ArrowRight size={18} /></button>
          </div>
        </footer>
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
export function ExamBar({ exam, answered, total, remaining, untimed = false, busy, saveState, onSubmit, onExit }: { exam: BankExam; answered: number; total: number; remaining: number; untimed?: boolean; busy: boolean; saveState: "idle" | "saving" | "saved" | "error"; onSubmit: () => void; onExit?: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // Untimed practice counts up from the start instead of down to zero.
  const shown = untimed ? Math.max(0, untimedLimitMinutes * 60 - remaining) : remaining;
  const minutes = Math.floor(shown / 60), seconds = shown % 60;
  const tone = untimed ? "" : remaining <= 60 ? "is-danger" : remaining <= 300 ? "is-warning" : "";
  return <header className={`bx-bar ${exam.skill === "Reading" && onExit ? "bx-test-bar" : ""}`}>
    <div className="bx-bar-title">{onExit && exam.skill === "Reading" ? <span className="bx-test-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ieltswithharry-mascot.webp" alt="" />
      <span>Ielts<b>WithHarry</b></span>
    </span> : <span className="bx-skill-chip">{exam.skill}</span>}<div><strong>{displayExamTitle(exam.title)}</strong><small>{total ? `Đã làm ${answered}/${total} câu` : "Bài viết tự do"} · {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Chưa lưu được" : "Tự động lưu"}</small></div></div>
    <span className={`bx-timer ${tone}`} role="timer" aria-label={untimed ? `Đã làm ${minutes} phút ${seconds} giây, không giới hạn thời gian` : `Còn ${minutes} phút ${seconds} giây`}><Clock3 size={16} /> {minutes}:{String(seconds).padStart(2, "0")}</span>
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
        <div className="bx-hero-actions">{skill === "Writing" && extra && <a className="bx-ghost" href="#writing-review">Xem đánh giá ↓</a>}{onRetry ? <button type="button" className="bx-start" onClick={onRetry}><RotateCcw size={17} /> Làm lại</button> : retryHref && <Link className="bx-start" href={retryHref}><RotateCcw size={17} /> Làm lại</Link>}<Link className="bx-ghost" href={backHref}>Về ngân hàng đề <ArrowRight size={16} /></Link></div>
      </div>
    </section>
    {extra}
    {(skill === "Writing" || skill === "Speaking") && !response && !extra && <section className="bx-card bx-response bx-empty-response">
      <h2><NotebookPen size={17} /> Chưa có bài làm</h2>
      <p>Bài này không có nội dung được lưu, thường do hết giờ trước khi bạn kịp viết hoặc bài được nộp trống. Bài trống không được tính vào tiến độ và không thể chấm điểm.</p>
    </section>}
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
