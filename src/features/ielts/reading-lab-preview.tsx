"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, Search } from "lucide-react";
import type { ReadingLabSummary } from "@/lib/reading-lab/types";
import "./reading-lab-preview.css";

type Question = {
  id: string; number: number; type: string; prompt: string; instructions: string;
  options: string[]; mediaUrl?: string; mediaReference?: string;
};
type Section = { id: string; title: string; passage: string; questions: Question[] };
type Exam = { id: string; title: string; minutes: number; sections: Section[] };
type Pair = { en: string; vi: string; trapEn?: string; trapVi?: string; tipEn?: string; tipVi?: string };
type Step = Record<"understand" | "wordClass" | "paraphrase" | "evidence" | "final", Pair>;
type Offset = { paragraph: string; quote: string; startUtf16: number; endUtf16: number };
type Review = { id: string; given: string; correct: boolean; answers: string[]; fiveStep: Step | null; evidence: Offset[] };
type Result = { score: number; total: number; review: Review[] };

const stepLabels: [keyof Step, string][] = [
  ["understand", "Hiểu câu hỏi"], ["wordClass", "Từ loại"],
  ["paraphrase", "Paraphrase"], ["evidence", "Dẫn chứng"], ["final", "Kết luận"],
];

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được Reading Lab.");
  return data as T;
}

function optionKey(value: string) {
  const text = value.trim();
  return /^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—/.exec(text)?.[1] ?? /^—\s*([A-Z])\.\s/.exec(text)?.[1] ?? /^([A-Z])\.\s/.exec(text)?.[1] ?? text;
}

function Passage({ section, evidence }: { section: Section; evidence: Offset[] }) {
  return <article className="rl-passage"><h2>{section.title}</h2>{section.passage.split(/\n\n+/).map((paragraph, index) => {
    const prefix = paragraph.match(/^([A-Z]\.\s*)/)?.[1] ?? "";
    const body = paragraph.slice(prefix.length);
    const label = prefix.slice(0, 1);
    const ranges = evidence.filter((item) => item.paragraph === label && body.slice(item.startUtf16, item.endUtf16) === item.quote)
      .sort((a, b) => a.startUtf16 - b.startUtf16);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const item of ranges) {
      if (item.startUtf16 < cursor) continue;
      parts.push(body.slice(cursor, item.startUtf16));
      parts.push(<mark key={`${item.startUtf16}:${item.endUtf16}`}>{body.slice(item.startUtf16, item.endUtf16)}</mark>);
      cursor = item.endUtf16;
    }
    parts.push(body.slice(cursor));
    return <p key={index} id={`rl-paragraph-${section.id}-${label || index}`}><strong>{prefix}</strong>{parts}</p>;
  })}</article>;
}

export function ReadingLabPreview() {
  const [catalog, setCatalog] = useState<ReadingLabSummary[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [focusId, setFocusId] = useState("");
  const [query, setQuery] = useState("");
  const [fullOnly, setFullOnly] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/reading-lab", { cache: "no-store" }).then(jsonResponse<{ exams: ReadingLabSummary[] }>)
      .then((data) => { if (active) setCatalog(data.exams); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!exam || result) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [exam, result]);

  const selectedSections = useMemo(() => exam?.sections.filter((section) => !sectionId || section.id === sectionId) ?? [], [exam, sectionId]);
  const questions = selectedSections.flatMap((section) => section.questions);
  const reviews = new Map(result?.review.map((item) => [item.id, item]) ?? []);
  const focus = reviews.get(focusId);
  const filtered = catalog.filter((item) => (!fullOnly || item.fullTest)
    && `${item.id} ${item.title} ${item.questionTypes.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  async function choose(id: string) {
    setBusy(true); setError(""); setExam(null); setResult(null); setAnswers({}); setSectionId(""); setFocusId(""); setSeconds(0);
    try {
      const data = await jsonResponse<Exam>(await fetch(`/api/reading-lab?milestone=${id}`, { cache: "no-store" }));
      setExam(data);
      setSectionId(data.sections.length > 1 ? data.sections[0].id : "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không mở được bài."); }
    finally { setBusy(false); }
  }

  function chooseSection(id: string) {
    setSectionId(id); setAnswers({}); setResult(null); setFocusId(""); setSeconds(0);
  }

  function setAnswer(question: Question, value: string, checked?: boolean) {
    if (result) return;
    if (question.type !== "multiple_answers") {
      setAnswers((current) => ({ ...current, [question.id]: value }));
      return;
    }
    setAnswers((current) => {
      const choices = new Set((current[question.id] ?? "").split(",").filter(Boolean));
      if (checked) choices.add(value); else choices.delete(value);
      return { ...current, [question.id]: [...choices].join(",") };
    });
  }

  async function submit() {
    if (!exam || !questions.length) return;
    setBusy(true); setError("");
    try {
      const data = await jsonResponse<Result>(await fetch("/api/reading-lab", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone: exam.id, sectionId: sectionId || undefined, answers }),
      }));
      setResult(data);
      setFocusId(data.review.find((item) => !item.correct)?.id ?? data.review[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được bài."); }
    finally { setBusy(false); }
  }

  return <main className="reading-lab content-page">
    <Link href="/app/reading" className="rl-back"><ArrowLeft size={16} /> Reading Skill</Link>
    <header className="rl-header"><span>READING SKILL · LAB</span><h1>Luyện Reading theo từng Passage</h1>
      <p>Chọn một bài, tự làm trước khi xem đáp án, rồi đối chiếu lời giải song ngữ và dẫn chứng trong bài đọc.</p>
      <small>Điểm bài luyện không phải band IELTS chính thức.</small>
    </header>
    {error && <p className="rl-error" role="alert">{error}</p>}
    {!exam && <section className="rl-catalog"><div className="rl-catalog-head"><h2>Chọn bài học</h2><span>{catalog.length} bài · {catalog.reduce((sum, item) => sum + item.questions, 0)} câu hỏi</span></div>
      <div className="rl-filters"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bài hoặc dạng câu hỏi" /></label><label className="rl-checkbox"><input type="checkbox" checked={fullOnly} onChange={(event) => setFullOnly(event.target.checked)} /> Chỉ full test</label></div>
      {busy && <p>Đang mở bài…</p>}
      <div className="rl-grid">{filtered.map((item) => <button key={item.id} type="button" onClick={() => void choose(item.id)} disabled={busy}><span>{item.id.replace("_", ".")} · {item.fullTest ? "FULL TEST" : "GUIDED"}</span><strong>{item.title}</strong><small>{item.sections} Passage · {item.questions} câu · {item.minutes} phút</small><span className="rl-card-cta">Mở bài <BookOpen size={15} /></span></button>)}</div>
    </section>}
    {exam && <>
      <div className="rl-toolbar"><button type="button" onClick={() => { setExam(null); setResult(null); }}><ArrowLeft size={16} /> Danh sách bài</button><strong>{exam.title}</strong><span><Clock3 size={15} /> {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span></div>
      {exam.sections.length > 1 && <div className="rl-section-tabs" role="group" aria-label="Chọn Passage"><button type="button" aria-pressed={!sectionId} onClick={() => chooseSection("")}>Full bài</button>{exam.sections.map((section, index) => <button key={section.id} type="button" aria-pressed={sectionId === section.id} onClick={() => chooseSection(section.id)}>Passage {index + 1}</button>)}</div>}
      <div className="rl-workspace"><div className="rl-text">{selectedSections.map((section) => <Passage key={section.id} section={section} evidence={focus?.evidence ?? []} />)}</div>
        <div className="rl-questions"><div className="rl-questions-head"><h2>Câu hỏi</h2><span>{Object.values(answers).filter(Boolean).length}/{questions.length} đã trả lời</span></div>
          {selectedSections.map((section) => <section key={section.id} className="rl-question-section"><h3>{section.title}</h3>{section.questions.map((question) => {
            const review = reviews.get(question.id);
            const multiple = question.type === "multiple_answers";
            return <article key={question.id} className={`rl-question ${review ? review.correct ? "is-correct" : "is-wrong" : ""}`} id={`rl-question-${question.number}`}>
              <div className="rl-question-label"><span>Câu {question.number} · {question.type.replaceAll("_", " ")}</span>{review && <button type="button" onClick={() => setFocusId(question.id)}>Xem lời giải</button>}</div>
              {question.instructions && <small>{question.instructions}</small>}<p>{question.prompt}</p>
              {question.mediaUrl && <Image src={question.mediaUrl} alt={`Sơ đồ cho câu ${question.number}`} width={800} height={500} unoptimized />}
              {question.options.length ? <div className="rl-options">{question.options.map((option) => {
                const key = optionKey(option);
                return <label key={option}><input type={multiple ? "checkbox" : "radio"} name={question.id} value={key} disabled={Boolean(result)} checked={multiple ? (answers[question.id] ?? "").split(",").includes(key) : answers[question.id] === key} onChange={(event) => setAnswer(question, key, event.target.checked)} /><span>{option}</span></label>;
              })}</div> : <input className="rl-text-answer" type="text" value={answers[question.id] ?? ""} disabled={Boolean(result)} onChange={(event) => setAnswer(question, event.target.value)} placeholder="Nhập đáp án" />}
              {review && <div className="rl-mark">{review.correct ? "Đúng" : "Chưa đúng"} · Đáp án: <strong>{review.answers.join(" / ")}</strong></div>}
            </article>;
          })}</section>)}
          {!result ? <div className="rl-submit"><span>{questions.length} câu · {sectionId ? "1 Passage" : "Full bài"}</span><button type="button" disabled={busy} onClick={() => void submit()}>Nộp bài và xem lời giải</button></div> : <section className="rl-review"><div className="rl-score"><CheckCircle2 size={22} /><strong>{result.score}/{result.total}</strong><span>câu đúng</span></div>
            <div className="rl-review-nav" role="group" aria-label="Chọn câu xem lời giải">{result.review.map((item, index) => <button type="button" key={item.id} aria-pressed={focusId === item.id} onClick={() => setFocusId(item.id)}>{index + 1}</button>)}</div>
            {focus && <><h3>Lời giải câu {questions.find((item) => item.id === focusId)?.number}</h3>{focus.fiveStep ? stepLabels.map(([key, label]) => {
              const step = focus.fiveStep![key];
              return step.en || step.vi ? <div key={key} className="rl-step"><strong>{label}</strong>{step.vi && <p>{step.vi}</p>}{step.en && <small>{step.en}</small>}{step.trapVi && <p><em>Bẫy đáp án:</em> {step.trapVi}</p>}</div> : null;
            }) : <p>Chưa có giải thích chi tiết cho câu này.</p>}{focus.evidence.length > 0 && <div className="rl-evidence"><strong>Dẫn chứng trong bài</strong>{focus.evidence.map((item, index) => <p key={index}><b>Đoạn {item.paragraph}</b> · “{item.quote}”</p>)}</div>}</>}
            <button type="button" className="rl-retry" onClick={() => chooseSection(sectionId)}>Làm lại phần này</button>
          </section>}
        </div></div>
    </>}
  </main>;
}
