"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { catalogHref, catalogSkills } from "@/lib/ielts-bank/catalog";
import { BankCatalog } from "./bank-catalog";
import { AnswerInput, ExamBar, ExamIntro, ExamResult, QuestionNav, RichText, SpeakingAnswer, SubmitDialog, toneOf, typeLabel } from "./bank-exam";
import { TestRunner } from "./bank-test";
import { WritingFeedbackPanel, WritingStudio } from "./bank-writing";
import { SpeakingStudio } from "./bank-speaking";
import { speakingItems } from "./speaking-kit";
import "./bank.css";

type Exam = { id: string; title: string; skill: string; practice_type?: string; format: string; mode: string; duration_minutes: number; attribution: string; license: string; license_url: string; source_url: string; ai_generated: boolean; content?: ExamContent };
type Attempt = { id: string; state: string; started_at: string; answers: Record<string,string>; flags: string[]; notes: Record<string,string>; content?: ExamContent; ielts_exams?: Exam };
type Result = { score: number; total: number; review: { id: string; given: string; correct: boolean; answers: string[]; explanation: string; type?: string }[] };
async function api(path: string, body?: unknown) { const response = await fetch(`/api/ielts/bank/${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed"); return data; }

export function BankStudent({ examId, resultId, attemptId }: { examId?: string; resultId?: string; attemptId?: string }) {
  const [exam, setExam] = useState<Exam | null>(null), [attempt, setAttempt] = useState<Attempt | null>(null), [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string,string>>({}), [flags, setFlags] = useState<string[]>([]), [notes, setNotes] = useState<Record<string,string>>({}), [active, setActive] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false), [clock, setClock] = useState(0);
  const [dueDate, setDueDate] = useState(""), [scheduled, setScheduled] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle"), [confirming, setConfirming] = useState(false);
  const loadAttempt = useCallback(async (id: string) => { const data = await api(`attempt?id=${encodeURIComponent(id)}`); setAttempt(data.attempt); setExam(data.attempt.ielts_exams || null); setAnswers(data.attempt.answers || {}); setFlags(data.attempt.flags || []); setNotes(data.attempt.notes || {}); setResult(data.result); setClock(Date.now()); }, []);
  useEffect(() => { let live = true; const run = async () => { try { if (resultId || attemptId) { await loadAttempt(resultId || attemptId!); return; } if (examId) { const data = await api(`library?id=${encodeURIComponent(examId)}`); if (!live) return; setExam(data.exam); const saved = sessionStorage.getItem(`ielts-attempt:${examId}`); if (saved) await loadAttempt(saved); } } catch (e) { if (live) setError(String(e)); } }; void run(); return () => { live = false; }; }, [examId, resultId, attemptId, loadAttempt]);
  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const content = attempt?.content || exam?.content;
  const questions = useMemo(() => content?.sections.flatMap((s) => s.questions) || [], [content]);
  useEffect(() => { if (!attempt || attempt.state !== "in_progress" || !questions.length) return; const keydown = (event: KeyboardEvent) => { if ((event.target as HTMLElement)?.closest("input,textarea,select,button")) return; if (event.key === "ArrowRight") setActive((index) => Math.min(questions.length-1, index+1)); if (event.key === "ArrowLeft") setActive((index) => Math.max(0, index-1)); }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, [attempt, questions.length]);
  const remaining = attempt && exam ? Math.max(0, exam.duration_minutes * 60 - Math.floor((clock - new Date(attempt.started_at).getTime()) / 1000)) : 0;
  useEffect(() => { if (!attempt || attempt.state !== "in_progress") return; const timer = setTimeout(() => { setSaveState("saving"); void api("attempt", { action: "save", attemptId: attempt.id, answers, flags, notes }).then((data) => { setSaveState("saved"); if (typeof data.score === "number") { setResult(data); setAttempt({ ...attempt, state: "expired" }); } }).catch((e) => { setSaveState("error"); setError(String(e)); }); }, 1200); return () => clearTimeout(timer); }, [answers, flags, notes, attempt]);
  const submit = useCallback(async (expired = false) => { if (!attempt || busy) return; setBusy(true); try { const data = await api("attempt", { action: "submit", attemptId: attempt.id, answers, expired }); setResult(data); setAttempt({ ...attempt, state: expired ? "expired" : "submitted" }); if (exam?.id) sessionStorage.removeItem(`ielts-attempt:${exam.id}`); } catch (e) { setError(String(e)); } finally { setBusy(false); } }, [attempt, answers, busy, exam]);
  useEffect(() => { if (clock && attempt?.state === "in_progress" && exam && remaining === 0) { const timer = setTimeout(() => void submit(true), 0); return () => clearTimeout(timer); } }, [clock, attempt?.state, exam, remaining, submit]);
  async function start(scope?: { section: string; ids: string[] }) { if (!exam) return; setBusy(true); try { const data = await api("attempt", { action: "start", examId: exam.id }); sessionStorage.setItem(`ielts-attempt:${exam.id}`, data.attempt.id); setAttempt(data.attempt); if (scope) setNotes({ ...(data.attempt.notes || {}), __section: scope.section, __scope: scope.ids.join(",") }); setClock(Date.now()); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  const bankSkill = catalogSkills.find((value) => value === exam?.skill);
  // A part-only practice keeps its question ids in the notes; scores and reviews then cover that part.
  const scope = notes.__scope ? notes.__scope.split(",").filter(Boolean) : null;
  const numberOf = (id: string) => (questions.findIndex((item) => item.id === id) + 1) || 0;
  const backHref = bankSkill ? catalogHref(bankSkill, exam?.practice_type) : "/app/question-bank";
  if (!examId && !resultId && !attemptId) return <BankCatalog />;
  if (error && !exam && !attempt) return <main className="bx-page"><p className="bx-error" role="alert">{error}</p><Link className="bx-ghost" href="/app/dashboard">Về trang chủ</Link></main>;
  if (resultId || result) {
    if (!result) return <main className="bx-page"><div className="bx-loading"><span /><span /><span /></div></main>;
    // The local answers are the latest (they are also loaded from the attempt when reopening a result).
    const saved = Object.keys(answers).length ? answers : attempt?.answers || {};
    // Writing/Speaking have no automatic score: show what the learner wrote instead.
    const response = result.total ? undefined : saved.__response || Object.entries(saved).filter(([key, value]) => !key.startsWith("__") && value).map(([, value]) => value).join("\n\n") || undefined;
    const review = scope ? result.review.filter((item) => scope.includes(item.id)) : result.review;
    const total = scope && result.total ? review.length : result.total;
    const score = scope && result.total ? review.filter((item) => item.correct).length : result.score;
    const skill = exam?.skill || attempt?.ielts_exams?.skill || "Reading";
    const attemptRef = attempt?.id || resultId;
    return <ExamResult title={attempt?.ielts_exams?.title || exam?.title || "Bài luyện"} skill={skill} format={exam?.format} score={total ? score : null} total={total} review={review} response={response} backHref={backHref} retryHref={exam?.id ? `/app/question-bank/exam/${exam.id}` : undefined}
      numberOf={questions.length ? numberOf : undefined}
      extra={skill === "Writing" && attemptRef && response ? <WritingFeedbackPanel attemptId={attemptRef} type={exam?.practice_type} essay={response} /> : undefined}
      // On the exam's own page a link to itself would not reset, so start over in place.
      onRetry={examId && !resultId ? () => { setResult(null); setAttempt(null); setAnswers({}); setFlags([]); setNotes({}); setActive(0); setSaveState("idle"); } : undefined} />;
  }
  if (!exam) return <main className="bx-page"><div className="bx-loading"><span /><span /><span /></div></main>;
  if (!attempt) return <ExamIntro exam={exam} backHref={backHref} busy={busy} error={error} onStart={(scope) => void start(scope)} scheduleSlot={<div className="bx-schedule">
    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Ngày luyện" />
    <button type="button" className="bx-ghost" disabled={!dueDate || busy} onClick={() => { void api("attempt", { action: "schedule", examId: exam.id, dueDate }).then(() => setScheduled(true)).catch((e) => setError(String(e))); }}>Lưu lịch</button>
    {scheduled && <span role="status">Đã thêm vào Study Planner.</span>}
  </div>} />;
  const q = questions[active]; const section = content?.sections.find((s) => s.questions.some((item) => item.id === q?.id)) || content?.sections[0];
  const inScope = scope ? questions.filter((item) => scope.includes(item.id)) : questions;
  const answered = inScope.filter((item) => answers[item.id]).length;
  const setAnswer = (id: string, value: string) => setAnswers({ ...answers, [id]: value });
  const dialog = confirming && <SubmitDialog unanswered={inScope.length - answered} flagged={flags.length} busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />;
  // Reading and Listening run as a full test sheet; Writing and Speaking as studios.
  if (content && (exam.skill === "Reading" || exam.skill === "Listening")) return <main className={`bx-page bx-run bl-tone-${toneOf(exam.skill)}`}>
    <ExamBar exam={exam} answered={answered} total={inScope.length} remaining={remaining} busy={busy} saveState={saveState} onSubmit={() => setConfirming(true)} />
    {error && <p className="bx-error" role="alert">{error}</p>}
    <TestRunner exam={exam} content={content} scope={scope} answers={answers} setAnswer={setAnswer} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} onFinish={() => setConfirming(true)} />
    {dialog}
  </main>;
  if (content && exam.skill === "Writing") return <main className={`bx-page bx-run bl-tone-${toneOf(exam.skill)}`}>
    <ExamBar exam={exam} answered={0} total={0} remaining={remaining} busy={busy} saveState={saveState} onSubmit={() => setConfirming(true)} />
    {error && <p className="bx-error" role="alert">{error}</p>}
    <WritingStudio exam={exam} content={content} answers={answers} setAnswers={setAnswers} visual={<>{content.figureDescription && <p className="bx-figure"><strong>Mô tả hình:</strong> {content.figureDescription}</p>}{content.imageUrl && <a className="bx-ghost" href={content.imageUrl} target="_blank" rel="noreferrer">Mở hình Task 1</a>}{Boolean(content.visual) && <BankVisual visual={content.visual} />}</>} />
    {dialog}
  </main>;
  if (content && exam.skill === "Speaking") {
    const items = speakingItems(content, exam.practice_type);
    const spoken = items.filter((item) => answers[item.id]).length;
    return <main className={`bx-page bx-run bl-tone-${toneOf(exam.skill)}`}>
      <ExamBar exam={exam} answered={spoken} total={items.length} remaining={remaining} busy={busy} saveState={saveState} onSubmit={() => setConfirming(true)} />
      {error && <p className="bx-error" role="alert">{error}</p>}
      <SpeakingStudio exam={exam} content={content} answers={answers} setAnswer={setAnswer} notes={notes} setNotes={setNotes} onFinish={() => setConfirming(true)} />
      {confirming && <SubmitDialog unanswered={items.length - spoken} flagged={0} busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />}
    </main>;
  }
  return <main className={`bx-page bx-run bl-tone-${toneOf(exam.skill)}`}>
    <ExamBar exam={exam} answered={answered} total={questions.length} remaining={remaining} busy={busy} saveState={saveState} onSubmit={() => setConfirming(true)} />
    {questions.length > 1 && <QuestionNav questions={questions} active={active} answers={answers} flags={flags} onPick={setActive} />}
    {error && <p className="bx-error" role="alert">{error}</p>}
    <div className="bx-panes">
      <section className="bx-source-pane" aria-label="Đề bài">
        <span className="bx-pane-label">{exam.skill === "Listening" ? "Bản ghi âm" : exam.skill === "Writing" ? "Đề bài" : exam.skill === "Speaking" ? "Chủ đề" : "Bài đọc"}</span>
        <h2>{section?.title || exam.title}</h2>
        {section?.audioUrl && <div className="bx-audio"><audio controls src={section.audioUrl} preload="metadata" /><small>Nghe và trả lời câu hỏi bên phải. Khi luyện tập bạn có thể tua lại.</small></div>}
        {section?.passage ? <div className="bx-passage">{section.passage.split("\n\n").map((paragraph, i) => <p key={i}><RichText text={paragraph} /></p>)}</div>
          : content?.prompt ? <div className="bx-passage"><p><RichText text={String(content.prompt)} /></p></div> : null}
        {exam.skill === "Speaking" && <ul className="bx-tips"><li>Trả lời 2–4 câu: ý chính → lý do → ví dụ.</li><li>Ghi âm rồi nghe lại để tự kiểm tra độ trôi chảy và phát âm.</li></ul>}
        {content?.figureDescription && <p className="bx-figure"><strong>Mô tả hình:</strong> {content.figureDescription}</p>}
        {content?.imageUrl && <a className="bx-ghost" href={content.imageUrl} target="_blank" rel="noreferrer">Mở hình Task 1</a>}
        {Boolean(content?.visual) && <BankVisual visual={content?.visual} />}
      </section>
      {q ? <section className="bx-question" aria-label={`Câu ${active + 1}`}>
        <div className="bx-question-head"><span>Câu {active + 1} / {questions.length}</span><b>{typeLabel(q.type)}</b></div>
        {q.instructions && <p className="bx-instructions"><RichText text={q.instructions} /></p>}
        <h3 className="bx-prompt"><RichText text={q.prompt} /></h3>
        {q.mediaUrl && <a className="bx-ghost" href={q.mediaUrl} target="_blank" rel="noreferrer">Mở sơ đồ/hình</a>}
        {exam.skill === "Speaking" || q.type === "speaking"
          ? <SpeakingAnswer key={q.id} value={answers[q.id] || ""} onChange={(value) => setAnswer(q.id, value)} index={active} />
          : <AnswerInput question={q} value={answers[q.id] || ""} onChange={(value) => setAnswer(q.id, value)} index={active} />}
        <div className="bx-question-tools">
          <button type="button" className={`bx-flag ${flags.includes(q.id) ? "is-on" : ""}`} aria-pressed={flags.includes(q.id)} onClick={() => setFlags(flags.includes(q.id) ? flags.filter((id) => id !== q.id) : [...flags, q.id])}>{flags.includes(q.id) ? "Đã đánh dấu xem lại" : "Đánh dấu xem lại"}</button>
          <details className="bx-notes" open={Boolean(notes[q.id]) || undefined}><summary>Ghi chú cá nhân</summary><textarea value={notes[q.id] || ""} onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })} rows={3} placeholder="Từ khóa, lý do chọn đáp án…" /></details>
        </div>
        <div className="bx-steps"><button type="button" className="bx-ghost" disabled={!active} onClick={() => setActive(active - 1)}>← Câu trước</button>{active >= questions.length - 1 ? <button type="button" className="bx-submit" onClick={() => setConfirming(true)}>Xem lại & nộp</button> : <button type="button" className="bx-next" onClick={() => setActive(active + 1)}>Câu tiếp →</button>}</div>
      </section> : null}
    </div>
    <p className="bx-attribution">Nguồn: {exam.attribution} · {exam.license}</p>
    {dialog}
  </main>;
}

function BankVisual({ visual }: { visual: unknown }) {
  if (!visual || typeof visual !== "object" || Array.isArray(visual)) return null;
  const spec = visual as Record<string, unknown>;
  const panels = Array.isArray(spec.panels) ? spec.panels : [];
  const series = Array.isArray(spec.series) ? spec.series as Record<string, unknown>[] : [];
  const xAxis = spec.x_axis && typeof spec.x_axis === "object" ? spec.x_axis as Record<string, unknown> : {};
  const categories = Array.isArray(xAxis.categories) ? xAxis.categories : [];
  const rows = Array.isArray(spec.rows) ? spec.rows.filter(Array.isArray) as unknown[][] : [];
  const steps = Array.isArray(spec.steps) ? spec.steps as Record<string, unknown>[] : [];
  const snapshots = Array.isArray(spec.snapshots) ? spec.snapshots as Record<string, unknown>[] : [];
  const position = (value: unknown) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
  return <div className="bank-visual">
    <h3>{String(spec.title || "Dữ liệu từ nguồn")}</h3>
    {Boolean(spec.unit) && <p>Đơn vị: {String(spec.unit)}</p>}
    {Boolean(spec.notes) && <p>{String(spec.notes)}</p>}
    {panels.map((panel, i) => <BankVisual key={i} visual={panel} />)}
    {series.length > 0 && <div className="bank-table-wrap"><table><thead><tr><th>{String(xAxis.label || "Mục")}</th>{series.map((item, i) => <th key={i}>{String(item.name || `Series ${i+1}`)}</th>)}</tr></thead><tbody>{categories.map((category, i) => <tr key={i}><th>{String(category)}</th>{series.map((item, j) => <td key={j}>{String(Array.isArray(item.values) ? item.values[i] ?? "—" : "—")}</td>)}</tr>)}</tbody></table></div>}
    {rows.length > 0 && <div className="bank-table-wrap"><table><thead><tr>{rows[0].map((cell, i) => <th key={i}>{String(cell)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j}>{String(cell)}</th> : <td key={j}>{String(cell)}</td>)}</tr>)}</tbody></table></div>}
    {steps.length > 0 && <ol>{steps.map((step, i) => <li key={i}>{String(step.label || "")}</li>)}</ol>}
    {snapshots.map((snapshot, i) => {
      const features = Array.isArray(snapshot.features) ? snapshot.features as Record<string, unknown>[] : [];
      return <section key={i}><h4>{String(snapshot.label || `Map ${i+1}`)}</h4><div className="bank-map-scroll"><div className="bank-map" role="img" aria-label={`${String(snapshot.label || `Map ${i+1}`)}: ${features.map((feature) => String(feature.label || "")).join(", ")}`}>{features.map((feature, j) => <span key={j} className={`bank-map-feature bank-map-${String(feature.shape || "rect")}`} style={{ left: position(feature.x), top: position(feature.y), width: position(feature.w), height: position(feature.h) }} title={String(feature.label || "")}>{String(feature.label || "")}</span>)}</div></div><details><summary>Danh sách vị trí</summary><ul>{features.map((feature, j) => <li key={j}>{String(feature.label || "")}</li>)}</ul></details></section>;
    })}
  </div>;
}
