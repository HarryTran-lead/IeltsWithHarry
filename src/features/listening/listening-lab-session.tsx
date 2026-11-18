"use client";
/*
 * Listening Lab study screens: one module step (guided, independent, transfer) and the placement check.
 * Recordings play turn by turn from the Dictation bank; answers, transcripts and explanations only arrive
 * from the grading endpoint after the learner submits.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, CheckCircle2, Compass, Headphones, Lightbulb, Lock, Pause, Play, RotateCcw, Send, Target, Volume2, X } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import type { GradedQuestion, PublicLesson, PublicQuestion } from "@/lib/dictation-skill-lab/lessons";
import { listeningModuleById, listeningModules, listeningTypeLabels } from "@/lib/listening-lab/curriculum";
import type { ListeningModulePlan, ListeningPhase, ListeningTask } from "@/lib/listening-lab/plan";
import { loadPracticeResults, savePracticeSnapshot } from "@/features/learning/practice-results";
import {
  BASE, clock, errorReasons, errorSlug, fetchLesson, gradeTask, mastered, phaseInfo, phasePassed, phaseResult, phases, phaseSlug,
  placementStartPrefix, questionKey, stageLevels, themeFor, type Progress,
} from "./listening-lab-shared";

type Graded = Record<string, GradedQuestion>;
const AUDIO_EVENT = "listening-lab:audio";
/** Only one recording or evidence clip plays at a time. */
const claimAudio = (owner: string) => window.dispatchEvent(new CustomEvent(AUDIO_EVENT, { detail: owner }));
function useAudioClaim(owner: string, stop: () => void) {
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; });
  useEffect(() => {
    const listener = (event: Event) => { if ((event as CustomEvent<string>).detail !== owner) stopRef.current(); };
    window.addEventListener(AUDIO_EVENT, listener);
    return () => window.removeEventListener(AUDIO_EVENT, listener);
  }, [owner]);
}
const themeStyle = (level: string) => ({ "--ll-tone": themeFor(level).tone, "--ll-soft": themeFor(level).soft }) as CSSProperties;
/** Question numbers run on across recordings, as on an answer sheet. */
const startNumbers = (tasks: ListeningTask[]) => tasks.map((_, index) => tasks.slice(0, index).reduce((sum, task) => sum + task.questionIds.length, 0));
const countWords = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

/* ───────────────────────── Module ───────────────────────── */

export function ModulePage({ id }: { id: string }) {
  const [plan, setPlan] = useState<ListeningModulePlan | null>(null);
  const [phase, setPhase] = useState<ListeningPhase>("guided");
  const [lessons, setLessons] = useState<Record<string, PublicLesson>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Graded | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const requested = window.location.hash.slice(1) as ListeningPhase; if (phases.includes(requested)) queueMicrotask(() => setPhase(requested)); }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`/api/listening-lab/modules/${id}`, { cache: "no-store" }).then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.error ?? "Không tải được bài."); return json.plan as ListeningModulePlan; }),
      loadPracticeResults(phases.map((item) => phaseSlug(id, item))).catch(() => ({})),
    ]).then(([loaded, saved]) => { if (alive) { setPlan(loaded); setProgress(saved); } })
      .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài."); });
    return () => { alive = false; };
  }, [id]);
  const tasks = useMemo(() => plan?.phases[phase] ?? [], [plan, phase]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) { setAnswers({}); setGraded(null); setError(""); } });
    if (!tasks.length) return;
    void Promise.all(tasks.map((task) => fetchLesson(task.lessonId)))
      .then((items) => { if (alive) setLessons((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.lesson_id, item])) })); })
      .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được audio."); });
    return () => { alive = false; };
  }, [tasks, attempt]);

  function choosePhase(next: ListeningPhase) {
    setPhase(next);
    history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!plan || busy || graded || tasks.some((task) => !lessons[task.lessonId])) return;
    setBusy(true); setError("");
    try {
      const pairs = await Promise.all(tasks.map(async (task) => ({ task, results: await gradeTask(task.lessonId, task.questionIds, answers) })));
      const results: Graded = Object.fromEntries(pairs.flatMap(({ task, results }) => results.map((result) => [questionKey(task.lessonId, result.question_id), result])));
      setGraded(results);
      const all = Object.values(results);
      const summary = { correct: all.filter((item) => item.correct).length, checked: all.length, total: all.length };
      const nextProgress = { ...progress, [phaseSlug(id, phase)]: { ...summary, updatedAt: new Date().toISOString() } };
      setProgress(nextProgress);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (phasePassed(summary, phase) && phase !== "guided") celebrate(resultRef.current, { label: mastered(id, nextProgress) ? "Đạt mô-đun!" : `${summary.correct}/${summary.checked}` });
      const saved = await Promise.allSettled([savePracticeSnapshot(phaseSlug(id, phase), summary),
        ...pairs.flatMap(({ task, results }) => results.map((result) => savePracticeSnapshot(errorSlug(id, phase, task.lessonId, result.question_id), { correct: result.correct ? 1 : 0, checked: 1, total: 1 })))]);
      if (saved.some((item) => item.status === "rejected")) setError("Đã chấm bài nhưng một phần tiến độ chưa lưu được. Hãy kiểm tra kết nối và thử lại sau.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài."); }
    finally { setBusy(false); }
  }

  function retry() { setAnswers({}); setGraded(null); setAttempt((value) => value + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (!plan && !error) return <div className="ll-page"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;
  if (!plan) return <div className="ll-page"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  const unit = plan.module;
  const info = phaseInfo[phase];
  const nextUnit = listeningModules[listeningModules.findIndex((item) => item.id === unit.id) + 1];
  const keys = tasks.flatMap((task) => task.questionIds.map((questionId) => questionKey(task.lessonId, questionId)));
  const answered = keys.filter((key) => (answers[key] ?? "").trim()).length;
  const ready = tasks.length > 0 && tasks.every((task) => lessons[task.lessonId]);
  const totalMs = tasks.reduce((sum, task) => sum + lessonDuration(lessons[task.lessonId]), 0);
  const starts = startNumbers(tasks);

  return <div className="ll-page ll-module" style={themeStyle(unit.level)}>
    <Breadcrumb current={`${unit.id}. ${unit.title}`}/>
    <header className="ll-module-hero">
      <div className="ll-module-badge"><small>Mô-đun</small><b>{unit.id}</b></div>
      <div className="ll-module-copy">
        <span className="ll-kicker">Chặng {unit.level} · {themeFor(unit.level).name}</span>
        <h1>{unit.title}</h1>
        <p>{unit.objective}</p>
        <div className="ll-chips">{unit.types.map((type) => <span key={type}>{listeningTypeLabels[type] ?? type}</span>)}<span className="is-draft">Bản thử nghiệm</span></div>
      </div>
      <aside className="ll-goal" aria-label="Điều kiện đạt mô-đun">
        <strong><Target size={15}/> Đạt mô-đun khi</strong>
        <GoalRow label="Độc lập" need="≥ 8/10" result={phaseResult(progress, unit.id, "independent")} pass={phasePassed(phaseResult(progress, unit.id, "independent"), "independent")}/>
        <GoalRow label="Chuyển giao" need="≥ 75%" result={phaseResult(progress, unit.id, "transfer")} pass={phasePassed(phaseResult(progress, unit.id, "transfer"), "transfer")}/>
        {mastered(unit.id, progress) && <em><CheckCircle2 size={14}/> Đã đạt mô-đun</em>}
      </aside>
    </header>

    <div className="ll-tip"><span><Lightbulb size={17}/></span><p><b>Mẹo trước khi nghe</b>{unit.strategy}</p></div>

    <ol className="ll-stepper" aria-label="Các bước luyện">{phases.map((item) => {
      const result = phaseResult(progress, unit.id, item);
      const pass = phasePassed(result, item);
      return <li key={item}><button type="button" aria-current={phase === item ? "step" : undefined} className={`${pass ? "is-pass" : result?.checked ? "is-tried" : ""}`} onClick={() => choosePhase(item)}>
        <span className="ll-step-dot">{pass ? <Check size={15} strokeWidth={3}/> : phaseInfo[item].step}</span>
        <span className="ll-step-text"><b>{phaseInfo[item].label}</b><small>{plan.counts[item]} câu · {phaseInfo[item].rule}</small></span>
        <span className="ll-step-score">{result?.checked ? `${result.correct}/${result.checked}` : "Chưa làm"}</span>
      </button></li>;
    })}</ol>

    <section className="ll-brief" aria-live="polite">
      <div><span className="ll-kicker">Bước {info.step}/3</span><h2>{info.label}</h2><p>{info.hint}</p></div>
      <dl><div><dt>Câu hỏi</dt><dd>{plan.counts[phase]}</dd></div><div><dt>Bản ghi</dt><dd>{tasks.length}</dd></div><div><dt>Thời lượng</dt><dd>{totalMs ? `${Math.max(1, Math.round(totalMs / 60000))} phút` : "…"}</dd></div></dl>
    </section>

    {error && <p className="ll-error" role="alert">{error}</p>}
    {!tasks.length ? <p className="ll-empty">Chưa có đủ bản ghi phù hợp cho bước này. Cần biên soạn và duyệt thêm dữ liệu.</p> : tasks.map((task, index) => {
      const lesson = lessons[task.lessonId];
      const start = starts[index];
      return lesson ? <Recording key={`${phase}-${attempt}-${task.lessonId}`} task={task} lesson={lesson} replay={phase === "guided"} start={start} answers={answers}
        onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} graded={graded}/>
        : <div key={task.lessonId} className="ll-skeleton ll-skeleton-card" aria-label={`Đang tải ${task.title}`}/>;
    })}

    {graded && <div ref={resultRef}><ResultPanel phase={phase} graded={graded} tasks={tasks} lessons={lessons} moduleDone={mastered(unit.id, progress)}
      onNext={phase !== "transfer" ? () => choosePhase(phases[phases.indexOf(phase) + 1]) : undefined} nextUnit={phase === "transfer" ? nextUnit : undefined}
      onRetry={phase === "guided" ? retry : undefined}/></div>}

    {tasks.length > 0 && !graded && <SubmitBar answered={answered} total={keys.length} busy={busy} disabled={!ready} onSubmit={() => void submit()} label="Nộp và xem bằng chứng"/>}
    <p className="ll-footnote">Điểm này chỉ phản ánh câu đã làm trong Listening Lab, không quy đổi sang band. Nội dung nguồn đang chờ giáo viên kiểm duyệt.</p>
  </div>;
}

function GoalRow({ label, need, result, pass }: { label: string; need: string; result?: { correct: number; checked: number }; pass: boolean }) {
  return <div className={`ll-goal-row ${pass ? "is-pass" : ""}`}><span>{pass ? <Check size={13} strokeWidth={3}/> : null}{label}</span><small>{need}</small><b>{result?.checked ? `${result.correct}/${result.checked}` : "—"}</b></div>;
}

export function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href="/app/self-study/listening">Listening Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}

function SubmitBar({ answered, total, busy, disabled, onSubmit, label }: { answered: number; total: number; busy: boolean; disabled: boolean; onSubmit: () => void; label: string }) {
  const left = total - answered;
  return <div className="ll-submitbar">
    <div className="ll-submit-progress"><span><b>{answered}</b>/{total} câu đã trả lời{left > 0 ? ` · còn ${left} câu trống` : ""}</span><i><em style={{ width: `${total ? (answered / total) * 100 : 0}%` }}/></i></div>
    <button type="button" className="ll-btn ll-btn-primary" disabled={busy || disabled} onClick={onSubmit}><Send size={16}/>{busy ? "Đang chấm…" : label}</button>
  </div>;
}

function ResultPanel({ phase, graded, tasks, lessons, moduleDone, onNext, nextUnit, onRetry }: {
  phase: ListeningPhase; graded: Graded; tasks: ListeningTask[]; lessons: Record<string, PublicLesson>; moduleDone: boolean;
  onNext?: () => void; nextUnit?: { id: string; title: string }; onRetry?: () => void;
}) {
  const all = Object.values(graded);
  const correct = all.filter((item) => item.correct).length;
  const pass = phasePassed({ correct, checked: all.length, total: all.length }, phase);
  const byType = new Map<string, { correct: number; total: number }>();
  for (const task of tasks) for (const id of task.questionIds) {
    const type = lessons[task.lessonId]?.questions.find((item) => item.question_id === id)?.type ?? "other";
    const row = byType.get(type) ?? { correct: 0, total: 0 };
    row.total += 1; if (graded[questionKey(task.lessonId, id)]?.correct) row.correct += 1;
    byType.set(type, row);
  }
  const title = phase === "guided" ? "Xong bước hướng dẫn" : pass ? (moduleDone ? "Bạn đã đạt mô-đun này!" : "Đạt mục tiêu bước này") : "Chưa đạt mục tiêu — cùng xem lại bằng chứng";
  const need = phase === "independent" ? "Cần 8/10 câu đúng." : phase === "transfer" ? "Cần đúng ít nhất 75%." : "Bước này không tính điểm đạt; hãy đọc lời giải từng câu.";
  // The guided step has no pass mark; its colour still follows how it went.
  const good = phase === "guided" ? all.length > 0 && correct / all.length >= .5 : pass;
  return <section className={`ll-result ${good ? "is-pass" : "is-miss"}`} aria-live="polite">
    <ScoreRing value={correct} total={all.length}/>
    <div className="ll-result-copy">
      <span className="ll-kicker">Kết quả · {phaseInfo[phase].label}</span>
      <h2>{title}</h2>
      <p>{need} Câu sai được lưu vào <Link href={`${BASE}/review`}>Ôn lỗi</Link> để nghe lại sau 2 ngày.</p>
      <ul className="ll-type-bars">{[...byType].map(([type, row]) => <li key={type}><span>{listeningTypeLabels[type] ?? type}</span><i><em style={{ width: `${(row.correct / row.total) * 100}%` }}/></i><b>{row.correct}/{row.total}</b></li>)}</ul>
      <div className="ll-result-actions">
        {onNext && <button type="button" className="ll-btn ll-btn-primary" onClick={onNext}>Sang bước tiếp theo <ArrowRight size={16}/></button>}
        {nextUnit && <Link className="ll-btn ll-btn-primary" href={`${BASE}/module/${nextUnit.id}`}>Mô-đun {nextUnit.id} · {nextUnit.title} <ArrowRight size={16}/></Link>}
        {onRetry && <button type="button" className="ll-btn" onClick={onRetry}><RotateCcw size={15}/> Làm lại bước này</button>}
        {!onNext && !nextUnit && <Link className="ll-btn" href={BASE}>Về lộ trình</Link>}
      </div>
    </div>
  </section>;
}

function ScoreRing({ value, total }: { value: number; total: number }) {
  const ratio = total ? value / total : 0;
  return <div className="ll-ring" role="img" aria-label={`${value} trên ${total} câu đúng`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/>{ratio > 0 && <circle cx="22" cy="22" r="19" strokeDasharray={`${ratio * 119.4} 119.4`}/>}</svg>
    <span><b>{value}</b><small>/{total}</small></span>
  </div>;
}

function lessonDuration(lesson?: PublicLesson) {
  if (!lesson) return 0;
  return lesson.turns.reduce((sum, turn) => sum + (turn.duration_ms ?? 0), 0);
}

/* ───────────────────────── Recording ───────────────────────── */

type Clip = { sourceId: string; url: string; durationMs: number; speaker: string; flagged: boolean };

export function Recording({ task, lesson, replay, start, answers, onAnswer, graded }: {
  task: ListeningTask; lesson: PublicLesson; replay: boolean; start: number; answers: Record<string, string>; onAnswer: (key: string, value: string) => void; graded: Graded | null;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const owner = `rec:${task.lessonId}:${start}`;
  const clips = useMemo<Clip[]>(() => {
    const labels = Object.fromEntries(lesson.speakers.map((speaker) => [speaker.speaker_id, speaker.label]));
    const order: Clip[] = [];
    for (const turn of lesson.turns) {
      if (!turn.audio_url) continue;
      const existing = order.find((item) => item.sourceId === turn.source_turn_id);
      if (existing) { existing.durationMs += turn.duration_ms ?? 0; existing.flagged ||= turn.flagged; continue; }
      order.push({ sourceId: turn.source_turn_id, url: turn.audio_url, durationMs: turn.duration_ms ?? 0, speaker: labels[turn.speaker_id] ?? turn.speaker_id, flagged: turn.flagged });
    }
    return order;
  }, [lesson]);
  const totalMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  const elapsedMs = clips.slice(0, index).reduce((sum, clip) => sum + clip.durationMs, 0) + (state === "done" ? 0 : position * 1000);
  const free = replay || Boolean(graded);
  const heard = state !== "idle";
  const locked = heard && !free && state === "done";
  useAudioClaim(owner, () => { if (audio.current && !audio.current.paused) { audio.current.pause(); setState((current) => current === "playing" ? (free ? "paused" : current) : current); } });

  function playFrom(next: number) {
    const player = audio.current; const clip = clips[next];
    if (!player || !clip) return;
    claimAudio(owner);
    setIndex(next); setPosition(0); setState("playing");
    player.src = clip.url;
    void player.play().catch(() => setState("paused"));
  }
  function toggle() {
    const player = audio.current;
    if (!player) return;
    if (state === "playing") { if (free) { player.pause(); setState("paused"); } return; }
    if (state === "paused" && player.src) { claimAudio(owner); setState("playing"); void player.play().catch(() => setState("paused")); return; }
    if (locked) return;
    playFrom(0);
  }
  function ended() { if (index + 1 < clips.length) playFrom(index + 1); else { setState("done"); setPosition(0); setIndex(clips.length); } }

  const questions = task.questionIds.map((id) => lesson.questions.find((item) => item.question_id === id)).filter((item): item is PublicQuestion => Boolean(item));
  const answeredHere = questions.filter((question) => (answers[questionKey(task.lessonId, question.question_id)] ?? "").trim()).length;
  const current = clips[Math.min(index, clips.length - 1)];
  const flagged = clips.some((clip) => clip.flagged);
  const playLabel = state === "playing" ? (free ? "Tạm dừng" : "Đang phát") : state === "paused" ? "Nghe tiếp" : locked ? "Đã nghe" : heard ? "Nghe lại" : "Phát";

  return <section className="ll-recording">
    <header className="ll-recording-head">
      <span className="ll-rec-icon">{task.section ? <><small>Section</small><b>{task.section}</b></> : <Headphones size={20}/>}</span>
      <div><h2>{task.title}</h2><p>{lesson.speakers.map((speaker) => speaker.label).join(" · ")} · {clock(totalMs)} · {task.lessonId}</p></div>
      <span className="ll-rec-count">{graded ? `${questions.filter((question) => graded[questionKey(task.lessonId, question.question_id)]?.correct).length}/${questions.length} đúng` : `${answeredHere}/${questions.length} câu`}</span>
    </header>

    <div className={`ll-player is-${state} ${locked ? "is-locked" : ""}`}>
      <button type="button" className="ll-play" onClick={toggle} disabled={(state === "playing" && !free) || locked} aria-label={playLabel}>
        {state === "playing" ? (free ? <Pause size={22} fill="currentColor"/> : <Volume2 size={22}/>) : locked ? <Lock size={20}/> : <Play size={22} fill="currentColor"/>}
      </button>
      <div className="ll-track">
        <div className="ll-segments" aria-hidden="true">{clips.map((clip, clipIndex) => <i key={clip.sourceId} style={{ flexGrow: Math.max(clip.durationMs, 600) }}>
          <em style={{ width: clipIndex < index || state === "done" && heard ? "100%" : clipIndex === index && heard ? `${Math.min(100, (position * 1000 / Math.max(clip.durationMs, 1)) * 100)}%` : "0%" }}/></i>)}</div>
        <div className="ll-track-meta">
          <span>{state === "playing" || state === "paused" ? <><b className="ll-live" aria-hidden="true"/>{current?.speaker} · đoạn {index + 1}/{clips.length}</> : locked ? "Đã nghe một lượt · nghe lại sau khi nộp" : state === "done" ? "Đã nghe hết · có thể nghe lại" : free ? "Được dừng và nghe lại" : "Chỉ nghe một lượt, không tạm dừng"}</span>
          <span className="ll-time">{clock(Math.min(elapsedMs, totalMs))} / {clock(totalMs)}</span>
        </div>
      </div>
      {free && heard && state !== "playing" && <button type="button" className="ll-restart" onClick={() => playFrom(0)} aria-label="Nghe lại từ đầu"><RotateCcw size={16}/></button>}
      <audio ref={audio} onEnded={ended} onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} onError={() => setState("paused")} preload="none"/>
    </div>
    {flagged && <p className="ll-qa">Một số đoạn audio của bài này đang chờ kiểm tra phát âm.</p>}

    <ol className="ll-questions">{questions.map((question, offset) => {
      const key = questionKey(task.lessonId, question.question_id);
      return <QuestionCard key={key} id={key} number={start + offset + 1} question={question} value={answers[key] ?? ""} onChange={(value) => onAnswer(key, value)} result={graded?.[key]} lesson={lesson}/>;
    })}</ol>
    <Link className="ll-dictation-link" href={`/app/dictation/banks/skill-lab/${task.lessonId}`}><RotateCcw size={14}/> Nghe chép chính tả bản ghi này</Link>
  </section>;
}

function QuestionCard({ id, number, question, value, onChange, result, lesson }: { id: string; number: number; question: PublicQuestion; value: string; onChange: (value: string) => void; result?: GradedQuestion; lesson: PublicLesson }) {
  const options = question.options ?? question.choices;
  const words = countWords(value);
  const over = Boolean(question.word_limit && words > question.word_limit);
  const accepted = (result?.accepted_answers ?? []).map((item) => item.toLowerCase());
  const isAccepted = (option: string) => accepted.some((answer) => option.toLowerCase() === answer || option.toLowerCase().startsWith(`${answer} ·`) || option.toLowerCase().startsWith(`${answer} `));
  return <li className={`ll-q ${result ? (result.correct ? "is-correct" : "is-wrong") : ""}`} id={`q-${id}`}>
    <div className="ll-q-head">
      <span className="ll-q-num">{result ? (result.correct ? <Check size={15} strokeWidth={3}/> : <X size={15} strokeWidth={3}/>) : number}</span>
      <div><small>{listeningTypeLabels[question.type] ?? question.type}{question.word_limit ? ` · tối đa ${question.word_limit} từ` : ""}</small><p>{question.prompt}</p>{question.instructions_en && <em>{question.instructions_en}</em>}</div>
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element -- lesson maps are server-provided SVG assets */}
    {question.map_url && <img className="ll-map" src={question.map_url} alt="Sơ đồ để làm câu hỏi"/>}
    {options?.length ? <div className={`ll-options ${question.choices && !question.options ? "is-letters" : ""}`} role="radiogroup" aria-label={`Câu ${number}`}>{options.map((option, optionIndex) => {
      const split = /^([A-Z]) · (.+)$/.exec(option);
      const letter = split?.[1] ?? (question.choices && !question.options ? option : String.fromCharCode(65 + optionIndex));
      const text = split?.[2] ?? (question.choices && !question.options ? "" : option);
      const state = result ? (isAccepted(option) ? "is-key" : value === option ? "is-picked-wrong" : "") : value === option ? "is-picked" : "";
      return <label key={option} className={state}><input type="radio" name={id} value={option} checked={value === option} disabled={Boolean(result)} onChange={() => onChange(option)}/><b>{letter}</b>{text && <span>{text}</span>}</label>;
    })}</div>
      : <div className="ll-input"><input value={value} disabled={Boolean(result)} aria-label={`Đáp án câu ${number}`} aria-invalid={over || undefined} onChange={(event) => onChange(event.target.value)} placeholder="Gõ đáp án…" autoComplete="off" spellCheck={false}/>
        {question.word_limit ? <small className={over ? "is-over" : ""}>{words}/{question.word_limit} từ</small> : null}</div>}
    {result && <div className="ll-feedback">
      <div className="ll-feedback-top"><strong>{result.correct ? "Chính xác" : errorReasons[result.reason] ?? "Cần ôn lại"}</strong><span>Đáp án: <b>{result.accepted_answers.join(" / ")}</b></span></div>
      {result.explanation_vi && <p>{result.explanation_vi}</p>}
      {result.evidence.map((evidence) => {
        const clip = lesson.turns.find((item) => item.source_turn_id === evidence.turn_id && item.audio_url);
        return <Evidence key={evidence.turn_id} label={evidence.turn_id} text={evidence.text_en} translation={evidence.translation_vi} url={clip?.audio_url ?? null}/>;
      })}
    </div>}
  </li>;
}

export function Evidence({ label, text, translation, url }: { label: string; text: string; translation?: string | null; url: string | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const owner = `evidence:${label}:${url}`;
  useAudioClaim(owner, () => { audio.current?.pause(); setPlaying(false); });
  function toggle() {
    const player = audio.current; if (!player || !url) return;
    if (playing) { player.pause(); setPlaying(false); return; }
    claimAudio(owner); player.currentTime = 0; setPlaying(true); void player.play().catch(() => setPlaying(false));
  }
  return <div className="ll-evidence">
    {url && <button type="button" onClick={toggle} aria-label={playing ? "Dừng đoạn bằng chứng" : "Nghe đoạn bằng chứng"}>{playing ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}</button>}
    <div><span>Bằng chứng · {label}</span><q>{text}</q>{translation && <small>{translation}</small>}</div>
    {url && <audio ref={audio} src={url} preload="none" onEnded={() => setPlaying(false)}/>}
  </div>;
}

/* ───────────────────────── Placement ───────────────────────── */

type PlacementTask = ListeningTask & { moduleId: string };
function placementSuggestion(tasks: PlacementTask[], results: Graded) {
  const score = (ids: string[]) => tasks.filter((task) => ids.includes(task.moduleId))
    .flatMap((task) => task.questionIds.map((id) => results[questionKey(task.lessonId, id)])).filter((item) => item?.correct).length;
  return score(["01", "02", "05"]) < 4 ? "01" : score(["08", "15"]) < 3 ? "08" : score(["20", "24"]) < 2 ? "17" : "21";
}

export function PlacementPage() {
  const [tasks, setTasks] = useState<PlacementTask[] | null>(null);
  const [lessons, setLessons] = useState<Record<string, PublicLesson>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Graded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/listening-lab/placement", { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Không tải được bài đầu vào."); return data.tasks as PlacementTask[];
    }).then(async (items) => {
      const loaded = await Promise.all([...new Set(items.map((item) => item.lessonId))].map(fetchLesson));
      if (alive) { setTasks(items); setLessons(Object.fromEntries(loaded.map((item) => [item.lesson_id, item]))); }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài đầu vào."); });
    return () => { alive = false; };
  }, []);
  async function submit() {
    if (!tasks || graded || busy) return;
    setBusy(true); setError("");
    try {
      const pairs = await Promise.all(tasks.map(async (task) => ({ task, results: await gradeTask(task.lessonId, task.questionIds, answers) })));
      const result: Graded = Object.fromEntries(pairs.flatMap(({ task, results }) => results.map((item) => [questionKey(task.lessonId, item.question_id), item])));
      setGraded(result);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      const all = Object.values(result);
      const saved = await Promise.allSettled([
        savePracticeSnapshot("listening-lab:placement:v1", { correct: all.filter((item) => item.correct).length, checked: all.length, total: all.length }),
        savePracticeSnapshot(`${placementStartPrefix}${placementSuggestion(tasks, result)}`, { correct: 1, checked: 1, total: 1 }),
      ]);
      if (saved.some((item) => item.status === "rejected")) setError("Đã chấm bài đầu vào nhưng chưa lưu được toàn bộ tiến độ. Hãy kiểm tra kết nối.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài đầu vào."); }
    finally { setBusy(false); }
  }
  const keys = (tasks ?? []).flatMap((task) => task.questionIds.map((id) => questionKey(task.lessonId, id)));
  const answered = keys.filter((key) => (answers[key] ?? "").trim()).length;
  const totalMs = [...new Set((tasks ?? []).map((task) => task.lessonId))].reduce((sum, id) => sum + lessonDuration(lessons[id]), 0);
  const recommended = graded && tasks ? listeningModuleById(placementSuggestion(tasks, graded)) : undefined;
  // Two modules may sample the same recording: it is played once, with both question sets under it.
  const shown = (tasks ?? []).reduce<PlacementTask[]>((list, task) => {
    const same = list.find((item) => item.lessonId === task.lessonId);
    if (same) same.questionIds = [...same.questionIds, ...task.questionIds]; else list.push({ ...task, questionIds: [...task.questionIds] });
    return list;
  }, []);
  const starts = startNumbers(shown);
  return <div className="ll-page ll-module" style={themeStyle("1.0–2.0")}>
    <Breadcrumb current="Kiểm tra đầu vào"/>
    <header className="ll-module-hero is-placement">
      <div className="ll-module-badge"><Compass size={26}/></div>
      <div className="ll-module-copy"><span className="ll-kicker">Kiểm tra đầu vào</span><h1>Tìm chặng bắt đầu phù hợp</h1>
        <p>Các câu đi từ nhận âm, tên riêng đến Section 3–4. Mỗi bản ghi chỉ nghe một lượt như khi thi. Kết quả là gợi ý chặng học, không phải band IELTS.</p></div>
      <dl className="ll-facts"><div><dt>Câu hỏi</dt><dd>{keys.length || 12}</dd></div><div><dt>Thời lượng</dt><dd>{totalMs ? `${Math.max(1, Math.round(totalMs / 60000))} phút` : "…"}</dd></div><div><dt>Nghe</dt><dd>1 lượt</dd></div></dl>
    </header>
    {error && <p role="alert" className="ll-error">{error}</p>}
    {!tasks && !error && <><div className="ll-skeleton ll-skeleton-card"/><div className="ll-skeleton ll-skeleton-card"/></>}
    {shown.map((task, index) => { const start = starts[index]; const lesson = lessons[task.lessonId];
      return lesson ? <Recording key={`${task.moduleId}:${task.lessonId}`} task={task} lesson={lesson} replay={false} start={start} answers={answers} onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} graded={graded}/> : null; })}
    {tasks && !graded && <SubmitBar answered={answered} total={keys.length} busy={busy} disabled={false} onSubmit={() => void submit()} label="Nộp bài đầu vào"/>}
    {graded && recommended && <section ref={resultRef} className="ll-result is-pass ll-placement-result">
      <ScoreRing value={Object.values(graded).filter((item) => item.correct).length} total={Object.keys(graded).length}/>
      <div className="ll-result-copy"><span className="ll-kicker">Gợi ý của Listening Lab</span><h2>Bắt đầu ở chặng {recommended.level}</h2>
        <p>{themeFor(recommended.level).name} — mô-đun {recommended.id}: {recommended.title}. Bạn vẫn có thể chọn bất kỳ mô-đun nào trên lộ trình.</p>
        <ol className="ll-mini-track" aria-label="Bảy chặng luyện">{stageLevels.map((level) => <li key={level} className={level === recommended.level ? "is-here" : stageLevels.indexOf(level) < stageLevels.indexOf(recommended.level) ? "is-past" : ""} style={themeStyle(level)}><i/><span>{level}</span></li>)}</ol>
        <div className="ll-result-actions"><Link className="ll-btn ll-btn-primary" href={`${BASE}/module/${recommended.id}`}>Vào mô-đun {recommended.id} <ArrowRight size={16}/></Link><Link className="ll-btn" href={BASE}>Xem toàn bộ lộ trình</Link></div>
      </div>
    </section>}
  </div>;
}
