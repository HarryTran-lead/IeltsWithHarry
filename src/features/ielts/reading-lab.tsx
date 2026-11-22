"use client";
/*
 * Reading Lab on the shared self-study template: the path map (chặng → bài → kiểm tra cuối chặng) at
 * /app/reading/lab and one lesson per milestone at /app/reading/lab/<id>, worked Passage by Passage.
 * The course and unlock rules live in src/lib/reading-lab/path.ts; grading stays on /api/reading-lab.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Clock3, Info, RotateCcw, Target } from "lucide-react";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { isBetter, listPracticeResults, savePracticeResult } from "@/features/learning/practice-results";
import { LessonBar, LessonDone, LessonLocked, StudyPath } from "@/features/self-study-path/study-path";
import {
  READING_BASE, READING_PREFIX, lessonName, lessonScore, lessonSteps, passageSlug, readingCourse, readingProgress, stageOf, type PassageResult,
} from "@/lib/reading-lab/path";
import type { ReadingLabSummary } from "@/lib/reading-lab/types";
import { PASS_MARK, buildPath, type PathNode } from "@/lib/self-study-path/path";
import "./reading-lab.css";

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

/** Scrolls one pane of the lesson, not the page, so the lesson bar and the other pane stay put. */
function scrollWithin(pane: HTMLElement | null, target: Element | null | undefined, block: "center" | "start") {
  if (!pane || !target) return;
  if (pane.scrollHeight <= pane.clientHeight) { target.scrollIntoView({ behavior: "smooth", block }); return; }
  const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  pane.scrollTo({ top: block === "center" ? top - pane.clientHeight / 2 : top - 64, behavior: "smooth" });
}

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function ReadingLab() {
  const id = usePathname().split("/").filter(Boolean)[3];
  return id ? <ReadingLesson key={id} id={id} /> : <ReadingMap />;
}

/* ───────────── Catalog + saved Passage results → the path ───────────── */

function useReadingPath() {
  const [data, setData] = useState<{ catalog: ReadingLabSummary[]; results: Record<string, PassageResult> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/reading-lab", { cache: "no-store" }).then(jsonResponse<{ exams: ReadingLabSummary[] }>),
      listPracticeResults(READING_PREFIX).catch(() => ({})),
    ]).then(([catalog, results]) => { if (alive) setData({ catalog: catalog.exams, results }); })
      .catch((cause: Error) => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, []);
  const course = useMemo(() => readingCourse(data?.catalog ?? []), [data?.catalog]);
  const view = useMemo(() => data ? buildPath(course, readingProgress(data.catalog, data.results)) : null, [course, data]);
  /** Keeps the better of the saved and the new result, as the server does. */
  const record = useCallback((slug: string, result: PassageResult) => setData((current) => current && isBetter(result, current.results[slug])
    ? { ...current, results: { ...current.results, [slug]: result } } : current), []);
  return { course, view, data, error, record };
}

function Skeleton() {
  return <div className="sp-page rl-loading" aria-busy="true"><div className="rl-skeleton is-tall" /><div className="rl-skeleton" /><div className="rl-skeleton" /></div>;
}

function Failure({ message }: { message: string }) {
  return <div className="sp-page"><p className="rl-error" role="alert">{message}</p><Link className="rl-back" href="/app/reading">Về Reading Skill</Link></div>;
}

/* ───────────── Screen 1 · the path map ───────────── */

function ReadingMap() {
  const { course, view, error } = useReadingPath();
  const streak = useLearnerStreak();
  if (error) return <Failure message={error} />;
  if (!view) return <Skeleton />;
  return <StudyPath course={course} view={view} streak={streak?.current ?? 0}>
    <p className="sp-footnote"><Info size={15} aria-hidden /> Mỗi Passage được chấm ngay khi nộp, kèm lời giải 5 bước song ngữ và dẫn chứng tô sáng trong bài. Đạt {PASS_MARK * 100}% bài kiểm tra cuối chặng để mở chặng sau. Điểm bài luyện không phải band IELTS chính thức.</p>
  </StudyPath>;
}

/* ───────────── Screen 2 · a lesson, Passage by Passage ───────────── */

function Passage({ section, evidence }: { section: Section; evidence: Offset[] }) {
  return <article className="rl-passage"><h2>{section.title}</h2>{section.passage.split(/\n\n+/).map((paragraph, index) => {
    const prefix = paragraph.match(/^([A-Z]\.\s*)/)?.[1] ?? "";
    const body = paragraph.slice(prefix.length);
    const label = prefix.slice(0, 1);
    const ranges = evidence.filter((item) => item.paragraph === label && body.slice(item.startUtf16, item.endUtf16) === item.quote)
      .sort((a, b) => a.startUtf16 - b.startUtf16);
    const parts: ReactNode[] = [];
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

function nodeOf(nodes: PathNode[], id: string) {
  const place = stageOf(id);
  return nodes.find((node) => place?.stage.check === id ? node.id === `${place.stage.id}:check` : node.id === id);
}

function ReadingLesson({ id }: { id: string }) {
  const { view, data, error: pathError, record } = useReadingPath();
  const [exam, setExam] = useState<Exam | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [focusId, setFocusId] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/reading-lab?milestone=${encodeURIComponent(id)}`, { cache: "no-store" }).then(jsonResponse<Exam>)
      .then((loaded) => { if (alive) setExam(loaded); })
      .catch((cause: Error) => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    if (!exam || result) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [exam, result]);
  // Opening a solution brings its highlighted evidence into view.
  useEffect(() => { scrollWithin(textRef.current, textRef.current?.querySelector("mark"), "center"); }, [focusId]);

  const summary = data?.catalog.find((item) => item.id === id);
  const results = data?.results ?? {};
  const full = Boolean(summary?.fullTest);
  const count = summary ? lessonSteps(summary) : 1;
  const submitted = (index: number) => (results[passageSlug(id, index)]?.checked ?? 0) > 0;
  const stepDone = (index: number) => full ? Array.from({ length: summary?.sections ?? 0 }, (_, part) => part).every(submitted) : submitted(index);
  const leading = Array.from({ length: count }, (_, index) => index).findIndex((index) => !stepDone(index));
  const firstOpen = leading < 0 ? 0 : leading;
  const step = Math.min(picked ?? firstOpen, count - 1);
  const reached = Math.max(step, leading < 0 ? count - 1 : leading);
  const sections = exam ? full ? exam.sections : exam.sections.slice(step, step + 1) : [];
  const questions = sections.flatMap((section) => section.questions);
  const reviews = new Map(result?.review.map((item) => [item.id, item]) ?? []);
  const focus = reviews.get(focusId);

  if (pathError || error) return <Failure message={pathError || error} />;
  if (!exam || !view || !data) return <Skeleton />;
  if (!summary) return <Failure message="Bài này chưa được mở trong Reading Lab." />;

  const nodes = view.stages.flatMap((stage) => stage.nodes);
  const node = nodeOf(nodes, id);
  const place = stageOf(id);
  const isCheck = place?.stage.check === id;
  const name = isCheck ? `Kiểm tra cuối chặng ${(place?.index ?? 0) + 1}` : `${node?.number ? `Bài ${node.number} · ` : ""}${lessonName(summary)}`;
  const next = view.next?.node;
  const nextTitle = next ? next.kind === "checkpoint" ? next.title : `Bài ${next.number} · ${next.title}` : undefined;
  if (node?.status === "locked") return <LessonLocked title={name} nextTitle={nextTitle} nextHref={next?.href} pathHref={READING_BASE} />;

  function choose(index: number) {
    setPicked(index); setAnswers({}); setResult(null); setFocusId(""); setSeconds(0); setError("");
    textRef.current?.scrollTo({ top: 0 }); questionsRef.current?.scrollTo({ top: 0 });
  }

  function setAnswer(question: Question, value: string, checked?: boolean) {
    if (result) return;
    if (question.type !== "multiple_answers") { setAnswers((current) => ({ ...current, [question.id]: value })); return; }
    setAnswers((current) => {
      const choices = new Set((current[question.id] ?? "").split(",").filter(Boolean));
      if (checked) choices.add(value); else choices.delete(value);
      return { ...current, [question.id]: [...choices].join(",") };
    });
  }

  async function submit() {
    if (!exam || !questions.length || busy) return;
    setBusy(true); setError("");
    // Stay on this Passage to read the solutions, even though saving it moves the first open step on.
    setPicked(step);
    try {
      const graded = await jsonResponse<Result>(await fetch("/api/reading-lab", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone: exam.id, sectionId: full ? undefined : sections[0].id, answers }),
      }));
      setResult(graded);
      setFocusId(graded.review.find((item) => !item.correct)?.id ?? graded.review[0]?.id ?? "");
      // One saved result per Passage, so the path counts a full test the same way as Passage-by-Passage lessons.
      const right = new Set(graded.review.filter((item) => item.correct).map((item) => item.id));
      const parts = (full ? exam.sections.map((section, index) => ({ section, index })) : [{ section: sections[0], index: step }]).map(({ section, index }) => {
        const total = section.questions.length;
        return { slug: passageSlug(exam.id, index), result: { correct: section.questions.filter((question) => right.has(question.id)).length, checked: total, total } };
      });
      parts.forEach((part) => record(part.slug, part.result));
      const saved = await Promise.allSettled(parts.map((part) => savePracticeResult(part.slug, part.result)));
      if (saved.some((item) => item.status === "rejected")) setError("Đã chấm bài nhưng tiến độ chưa lưu được. Hãy kiểm tra kết nối rồi nộp lại.");
      scrollWithin(questionsRef.current, questionsRef.current?.querySelector(".rl-review"), "start");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được bài."); }
    finally { setBusy(false); }
  }

  const answered = questions.filter((question) => (answers[question.id] ?? "").trim()).length;
  const lesson = lessonScore(summary, results);
  const passed = !isCheck || (lesson.total > 0 && lesson.correct / lesson.total >= PASS_MARK);
  const label = (index: number) => full ? "Làm cả đề" : `Passage ${index + 1}`;
  const steps = Array.from({ length: count }, (_, index) => {
    const parts = full ? Array.from({ length: summary.sections }, (_, part) => results[passageSlug(id, part)]).filter(Boolean) : [results[passageSlug(id, index)]].filter(Boolean);
    const right = parts.reduce((sum, item) => sum + item.correct, 0);
    const total = parts.reduce((sum, item) => sum + item.total, 0);
    const questionsHere = full ? summary.questions : exam.sections[index]?.questions.length ?? 0;
    return { label: label(index), note: stepDone(index) ? `${right}/${total} đúng` : `${questionsHere} câu`, pass: stepDone(index) };
  });
  const after = result && (step < count - 1
    ? <div className="rl-next"><button type="button" className="sp-btn sp-btn-primary" onClick={() => choose(step + 1)}>Tiếp: {label(step + 1)} <ArrowRight size={16} aria-hidden /></button>
      <button type="button" className="sp-btn sp-btn-ghost" onClick={() => choose(step)}><RotateCcw size={16} aria-hidden /> Làm lại</button></div>
    : lesson.complete && <LessonDone embedded title={passed ? `Xong ${name}` : `Chưa đạt ${PASS_MARK * 100}% · ${name}`}
      stats={[{ label: "Đúng", value: `${lesson.correct}/${lesson.total}` }, { label: "Tỉ lệ", value: `${lesson.total ? Math.round((lesson.correct / lesson.total) * 100) : 0}%` }, { label: "Passage", value: String(summary.sections) }]}
      note={isCheck ? passed ? "Đã qua mốc cuối chặng: chặng tiếp theo đã mở." : `Cần ${PASS_MARK * 100}% để mở chặng sau. Điểm cao nhất của từng Passage được giữ lại, hãy làm lại Passage còn sai nhiều.` : "Điểm cao nhất của từng Passage được giữ lại khi bạn làm lại."}
      nextLabel={next && next.kind === "checkpoint" ? "Làm bài kiểm tra cuối chặng" : nextTitle ? `Học ${nextTitle}` : undefined}
      nextHref={next && next.href !== `${READING_BASE}/${id}` ? next.href : undefined} pathHref={READING_BASE}>
      <button type="button" className="sp-btn sp-btn-ghost rl-again" onClick={() => choose(full ? 0 : step)}><RotateCcw size={16} aria-hidden /> Làm lại {label(step)}</button>
    </LessonDone>);

  return <div className="rl-lesson sp-kit">
    <header className="rl-lessonbar">
      <LessonBar exitHref={READING_BASE} kicker={`Reading · Chặng ${(place?.index ?? 0) + 1} · ${place?.stage.title ?? ""}`} title={name}
        info={<>
          <p>{summary.sections} Passage · {summary.questions} câu · gợi ý {summary.minutes} phút</p>
          {summary.passages?.map((title, index) => <p key={title}>Passage {index + 1}: {title}</p>)}
          {isCheck && <p><Target size={12} aria-hidden /> Cần {PASS_MARK * 100}% cả bài để mở chặng sau</p>}
          <p>Điểm bài luyện không phải band IELTS chính thức.</p>
        </>}
        steps={steps} step={step} reached={reached} onPick={choose} />
    </header>
    {error && <p className="rl-error" role="alert">{error}</p>}
    <div className="rl-workspace">
      <div className="rl-text" ref={textRef}>{sections.map((section) => <Passage key={section.id} section={section} evidence={focus?.evidence ?? []} />)}</div>
      <div className="rl-questions" ref={questionsRef}>
        <div className="rl-questions-head"><h2>Câu hỏi</h2><span>{answered}/{questions.length} đã trả lời</span><span className="rl-clock" aria-label="Thời gian làm bài"><Clock3 size={15} aria-hidden /> {clock(seconds)}</span></div>
        {sections.map((section) => <section key={section.id} className="rl-question-section">{full && <h3>{section.title}</h3>}{section.questions.map((question) => {
          const review = reviews.get(question.id);
          const multiple = question.type === "multiple_answers";
          return <article key={question.id} className={`rl-question ${review ? review.correct ? "is-correct" : "is-wrong" : ""} ${focusId === question.id ? "is-focus" : ""}`} id={`rl-question-${question.number}`}>
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
        {!result ? <div className="rl-submit"><span>{answered}/{questions.length} câu{answered < questions.length ? ` · còn ${questions.length - answered} câu trống` : ""}</span><button type="button" className="sp-btn sp-btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp và xem lời giải"}</button></div>
          : <section className="rl-review"><div className="rl-score"><CheckCircle2 size={22} aria-hidden /><strong>{result.score}/{result.total}</strong><span>câu đúng · {clock(seconds)}</span></div>
            <div className="rl-review-nav" role="group" aria-label="Chọn câu xem lời giải">{result.review.map((item) => {
              const number = questions.find((question) => question.id === item.id)?.number;
              return <button type="button" key={item.id} className={item.correct ? "is-correct" : "is-wrong"} aria-pressed={focusId === item.id} onClick={() => setFocusId(item.id)}>{number}</button>;
            })}</div>
            {focus && <><h3>Lời giải câu {questions.find((item) => item.id === focusId)?.number}</h3>{focus.fiveStep ? stepLabels.map(([key, stepLabel]) => {
              const part = focus.fiveStep![key];
              return part.en || part.vi ? <div key={key} className="rl-step"><strong>{stepLabel}</strong>{part.vi && <p>{part.vi}</p>}{part.en && <small>{part.en}</small>}{part.trapVi && <p><em>Bẫy đáp án:</em> {part.trapVi}</p>}</div> : null;
            }) : <p>Chưa có giải thích chi tiết cho câu này.</p>}{focus.evidence.length > 0 && <div className="rl-evidence"><strong>Dẫn chứng trong bài</strong>{focus.evidence.map((item, index) => <p key={index}><b>Đoạn {item.paragraph}</b> · “{item.quote}”</p>)}</div>}</>}
            {after}
          </section>}
      </div>
    </div>
  </div>;
}
