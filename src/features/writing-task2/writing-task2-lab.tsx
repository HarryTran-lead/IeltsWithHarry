"use client";
/*
 * Writing Task 2 Lab: 36 guided lessons (M112–M113 via the M123 package). The roadmap reuses the
 * Listening Lab layout so the self-study labs read as one product; the lesson page walks through
 * reading the prompt, short drills with reference answers after saving, and a full essay.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpenCheck, Check, CheckCircle2, Clock3, Lightbulb, ListChecks, PenLine, Play, Save, Sparkles, Target } from "lucide-react";
import {
  TASK2_API, TASK2_BASE, countWords, drillModeLabels, drillSaved, essayChecklist, essaySaved, questionTypeLabels, stageInfo, stageOrder, writingTargets,
  type Task2DrillAnswer, type Task2Lesson, type Task2LessonSummary, type Task2ModelEssay, type Task2Stage, type Task2State,
} from "@/lib/writing-task2/types";
import { cacheTask2State, emptyTask2State, loadAllTask2States, loadTask2State, revealTask2, saveTask2State } from "./task2-state";
import "@/features/listening/listening-lab.css";
import "./writing-task2.css";

export function WritingTask2Lab() {
  const parts = usePathname().split("/").filter(Boolean);
  return parts[3] ? <LessonPage key={parts[3]} id={decodeURIComponent(parts[3])} /> : <RoadmapPage />;
}

const themeStyle = (stage: Task2Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;
const typeLabel = (type: string) => questionTypeLabels[type] ?? type;

type LessonProgress = { drills: number; essay: boolean; started: boolean };
function progressOf(state: Task2State | undefined, stage: Task2Stage): LessonProgress {
  if (!state) return { drills: 0, essay: false, started: false };
  const drills = Object.keys(state.saved).filter((id) => drillSaved(state, id)).length;
  return { drills, essay: essaySaved(state, stage), started: drills > 0 || Boolean(state.essay.trim()) || Object.values(state.answers).some((text) => text.trim()) };
}
const complete = (lesson: Task2LessonSummary, progress: LessonProgress) => progress.essay && progress.drills >= lesson.drill_count;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

/* ───────────────────────── Roadmap ───────────────────────── */

function RoadmapPage() {
  const [lessons, setLessons] = useState<Task2LessonSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, Task2State>>({});
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    void getJson<{ lessons: Task2LessonSummary[] }>(TASK2_API).then(async ({ lessons: list }) => {
      if (!alive) return;
      setLessons(list);
      const saved = await loadAllTask2States(list.map((lesson) => lesson.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const progress = useMemo(() => Object.fromEntries((lessons ?? []).map((lesson) => [lesson.id, progressOf(states[lesson.id], lesson.stage)])), [lessons, states]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lesson of lessons ?? []) counts.set(lesson.question_type, (counts.get(lesson.question_type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [lessons]);

  if (error) return <div className="ll-page t2-lab"><p className="ll-error" role="alert">{error}</p></div>;
  if (!lessons) return <div className="ll-page t2-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const number = (id: string) => String(lessons.findIndex((lesson) => lesson.id === id) + 1).padStart(2, "0");
  const done = lessons.filter((lesson) => complete(lesson, progress[lesson.id])).length;
  const next = lessons.find((lesson) => progress[lesson.id].started && !complete(lesson, progress[lesson.id])) ?? lessons.find((lesson) => !complete(lesson, progress[lesson.id])) ?? lessons[0];
  const drillsSaved = lessons.reduce((sum, lesson) => sum + progress[lesson.id].drills, 0);
  const essays = lessons.filter((lesson) => progress[lesson.id].essay).length;
  const visible = (lesson: Task2LessonSummary) => typeFilter === "all" || lesson.question_type === typeFilter;

  return <div className="ll-page ll-roadmap t2-lab">
    <header className="ll-hero t2-hero">
      <div className="ll-hero-copy">
        <h1>Viết Task 2 theo lộ trình, <em>từng bước một.</em></h1>
        <div className="ll-hero-actions">
          <Link className="ll-cta" href={`${TASK2_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{progress[next.id].started ? "Học tiếp" : done ? "Bài tiếp theo" : "Bắt đầu học"}</b><small>Bài {number(next.id)} · {next.topic} · {typeLabel(next.question_type)}</small></span>
            <ArrowRight size={18}/>
          </Link>
          <span className="ll-draft-pill" title="Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi chính thức">Thử nghiệm</span>
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={lessons.length}/><div><strong>Bài đã hoàn thành</strong><span>Còn {lessons.length - done} bài</span></div></div>
        <dl><div><dt>Bài luyện đã lưu</dt><dd>{drillsSaved}</dd></div><div><dt>Bài viết đã lưu</dt><dd>{essays}</dd></div><div><dt>Có bài mẫu</dt><dd>{lessons.filter((lesson) => lesson.has_model_essay).length}</dd></div></dl>
      </div>
    </header>

    <section className="ll-journey t2-journey" aria-labelledby="t2-journey-title">
      <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ lộ trình</span><h2 id="t2-journey-title">4 chặng, {lessons.length} bài</h2></div><small>Mức 1.0–7.5+ là mức luyện nội bộ, không phải band IELTS.</small></div>
      <ol className="ll-track-map">{stageOrder.map((stage, index) => {
        const units = lessons.filter((lesson) => lesson.stage === stage);
        const count = units.filter((lesson) => complete(lesson, progress[lesson.id])).length;
        const here = next.stage === stage;
        return <li key={stage} style={themeStyle(stage)} className={`${here ? "is-here" : ""} ${units.length && count === units.length ? "is-done" : ""}`}>
          <a href={`#chang-${index + 1}`}>
            <span className="ll-node">{units.length && count === units.length ? <Check size={16} strokeWidth={3}/> : index + 1}</span>
            <b>{stageInfo[stage].name}</b><small>{units[0]?.target_range} · {units.length} bài</small>
            <i aria-label={`${count}/${units.length} bài hoàn thành`}>{units.map((lesson) => <em key={lesson.id} className={complete(lesson, progress[lesson.id]) ? "is-on" : ""}/>)}</i>
            {here && <span className="ll-here">Bạn ở đây</span>}
          </a>
        </li>;
      })}</ol>
    </section>

    <div className="ll-typebar" role="group" aria-label="Lọc theo dạng đề">
      <span><ListChecks size={16}/> Dạng đề</span>
      <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tất cả<small>{lessons.length}</small></button>
      {typeCounts.map(([type, count]) => <button type="button" key={type} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{typeLabel(type)}<small>{count}</small></button>)}
    </div>

    {stageOrder.map((stage, index) => {
      const all = lessons.filter((lesson) => lesson.stage === stage);
      const units = all.filter(visible);
      if (!units.length) return null;
      const count = all.filter((lesson) => complete(lesson, progress[lesson.id])).length;
      return <section className="ll-stage" id={`chang-${index + 1}`} key={stage} style={themeStyle(stage)}>
        <header><span className="ll-stage-tag">Chặng {index + 1}</span><h2>{stageInfo[stage].name}<small>{all[0].target_range}</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(count / all.length) * 100}%` }}/></i>{count}/{all.length} xong</span></header>
        <div className="ll-grid">{units.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} number={number(lesson.id)} progress={progress[lesson.id]} isNext={lesson.id === next.id}/>)}</div>
      </section>;
    })}

    <aside className="ll-note"><Sparkles size={16}/><p>Đề và bài mẫu là tài liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Đáp án tham khảo chỉ mở sau khi bạn lưu bài làm của mình; tiến độ ở đây không quy đổi sang band.</p></aside>
  </div>;
}

function LessonCard({ lesson, number, progress, isNext }: { lesson: Task2LessonSummary; number: string; progress: LessonProgress; isNext: boolean }) {
  const done = complete(lesson, progress);
  const status = done ? { label: "Hoàn thành", cls: "is-done" } : isNext ? { label: progress.started ? "Đang học" : "Tiếp theo", cls: "is-next" } : progress.started ? { label: "Đang học", cls: "is-tried" } : null;
  return <Link href={`${TASK2_BASE}/${lesson.id}`} className={`ll-card ${isNext ? "is-next" : ""} ${done ? "is-done" : ""}`}>
    <div className="ll-card-top"><span className="ll-number">{number}</span>{status && <span className={`ll-status ${status.cls}`}>{status.label}</span>}</div>
    <strong>{lesson.topic}</strong>
    <p className="t2-card-prompt">{lesson.prompt}</p>
    <div className="ll-card-types"><span>{typeLabel(lesson.question_type)}</span>{lesson.has_model_essay && <span className="t2-chip-model">Có bài mẫu</span>}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label={`${progress.drills}/${lesson.drill_count} bài luyện, bài viết ${progress.essay ? "đã lưu" : "chưa lưu"}`}>
        {Array.from({ length: lesson.drill_count }, (_, index) => <i key={index} className={`t2-pip ${index < progress.drills ? "is-pass" : ""}`}/>)}
        <i className={`t2-pip-essay ${progress.essay ? "is-pass" : ""}`} title="Bài viết hoàn chỉnh"/>
      </span>
      <small><Clock3 size={12}/> {lesson.minutes} phút</small>
      <ArrowRight size={16}/>
    </div>
  </Link>;
}

function Ring({ value, total }: { value: number; total: number }) {
  return <span className="ll-ring is-hero" role="img" aria-label={`${value}/${total} bài hoàn thành`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/>{value > 0 && <circle cx="22" cy="22" r="19" strokeDasharray={`${(value / total) * 119.4} 119.4`}/>}</svg>
    <span><b>{value}</b><small>/{total}</small></span>
  </span>;
}

/* ───────────────────────── Lesson ───────────────────────── */

type Step = "learn" | "drills" | "essay";
const steps: { id: Step; label: string; hint: string }[] = [
  { id: "learn", label: "Hiểu đề", hint: "Các bước tư duy và từ vựng" },
  { id: "drills", label: "Luyện từng bước", hint: "Viết ngắn, lưu rồi xem gợi ý" },
  { id: "essay", label: "Viết bài hoàn chỉnh", hint: "250+ từ, tự kiểm tra 4 tiêu chí" },
];

function LessonPage({ id }: { id: string }) {
  const [lesson, setLesson] = useState<Task2Lesson | null>(null);
  const [number, setNumber] = useState("");
  const [state, setState] = useState<Task2State | null>(null);
  const [step, setStep] = useState<Step>("learn");
  const [answers, setAnswers] = useState<Record<string, Task2DrillAnswer>>({});
  const [model, setModel] = useState<Task2ModelEssay | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<{ lesson: Task2Lesson }>(`${TASK2_API}/${encodeURIComponent(id)}`),
      getJson<{ lessons: Task2LessonSummary[] }>(TASK2_API).catch(() => ({ lessons: [] as Task2LessonSummary[] })),
      loadTask2State(id).catch(() => emptyTask2State()),
    ]).then(async ([{ lesson: loaded }, { lessons }, saved]) => {
      if (!alive) return;
      const index = lessons.findIndex((item) => item.id === loaded.id);
      setLesson(loaded); setNumber(index >= 0 ? String(index + 1).padStart(2, "0") : ""); setState(saved);
      const hash = window.location.hash.slice(1) as Step;
      const done = loaded.drills.filter((drill) => drillSaved(saved, drill.id));
      setStep(steps.some((item) => item.id === hash) ? hash : essaySaved(saved, loaded.stage) || done.length === loaded.drills.length ? "essay" : done.length ? "drills" : "learn");
      // Answers already earned in an earlier visit open again without another click.
      const targets = [...done.map((drill) => drill.id), ...(essaySaved(saved, loaded.stage) ? ["essay"] : [])];
      if (targets.length) {
        const revealed = await revealTask2(loaded.id, targets, saved).catch(() => null);
        if (alive && revealed) { setAnswers(revealed.drills); if (revealed.model_essay !== undefined) setModel(revealed.model_essay); }
      }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài học."); });
    return () => { alive = false; };
  }, [id]);

  // Typing is kept in the browser at once and synced to the account a moment after the learner pauses.
  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);
  function update(change: (current: Task2State) => Task2State) {
    setState((current) => {
      if (!current) return current;
      const next = { ...change(current), updatedAt: Date.now() };
      cacheTask2State(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveTask2State(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }

  async function saveAndReveal(target: string) {
    if (!state || !lesson) return;
    const now = new Date().toISOString();
    const next: Task2State = target === "essay" ? { ...state, essaySavedAt: now, updatedAt: Date.now() } : { ...state, saved: { ...state.saved, [target]: now }, updatedAt: Date.now() };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setBusy(target); setError(""); setNotice(""); setState(next);
    try {
      await saveTask2State(id, next);
      if (target === "essay" && !essaySaved(next, lesson.stage)) { setNotice(`Đã lưu bài viết (${countWords(next.essay)} từ). Viết từ ${writingTargets[lesson.stage].min} từ trở lên để ${lesson.has_model_essay ? "mở bài mẫu" : "hoàn thành bài học"}.`); return; }
      const revealed = await revealTask2(lesson.id, [target], next);
      if (target === "essay") { setModel(revealed.model_essay ?? null); setNotice("Đã lưu bài viết."); }
      else setAnswers((current) => ({ ...current, ...revealed.drills }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được bài.");
    } finally { setBusy(""); }
  }

  function go(target: Step) {
    setStep(target);
    history.replaceState(null, "", `#${target}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (error && !lesson) return <div className="ll-page t2-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!lesson || !state) return <div className="ll-page t2-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const savedDrills = lesson.drills.filter((drill) => drillSaved(state, drill.id)).length;
  const words = countWords(state.essay);
  const target = writingTargets[lesson.stage];
  // Most lessons repeat one hint under every drill; say it once in the intro instead.
  const sharedHint = lesson.drills.every((drill) => drill.hint_vi === lesson.drills[0]?.hint_vi) ? lesson.drills[0]?.hint_vi ?? "" : "";
  const stepScore: Record<Step, string> = { learn: `${lesson.steps.length} bước`, drills: `${savedDrills}/${lesson.drills.length}`, essay: essaySaved(state, lesson.stage) ? `${words} từ` : "Chưa lưu" };
  const stepPass: Record<Step, boolean> = { learn: savedDrills > 0, drills: savedDrills === lesson.drills.length, essay: essaySaved(state, lesson.stage) };

  return <div className="ll-page ll-module t2-lab" style={themeStyle(lesson.stage)}>
    <Breadcrumb current={`${number ? `Bài ${number} · ` : ""}${lesson.topic}`}/>
    <header className="ll-module-hero">
      <div className="ll-module-badge"><small>Bài</small><b>{number || "–"}</b></div>
      <div className="ll-module-copy">
        <span className="ll-kicker">{stageInfo[lesson.stage].name} · mức luyện {lesson.target_range}</span>
        <h1>{lesson.topic}</h1>
        <p>{lesson.goal_vi}</p>
        <div className="ll-chips"><span>{typeLabel(lesson.question_type)}</span><span>{lesson.minutes} phút</span>{lesson.has_model_essay && <span className="t2-chip-model">Có bài mẫu</span>}</div>
      </div>
      <dl className="ll-facts"><div><dt>Bài luyện</dt><dd>{savedDrills}/{lesson.drills.length}</dd></div><div><dt>Bài viết</dt><dd>{words || "–"}</dd></div><div><dt>Phút</dt><dd>{lesson.minutes}</dd></div></dl>
    </header>

    <section className="t2-prompt" aria-label="Đề bài">
      <span className="ll-kicker">Đề bài · Writing Task 2</span>
      <p>{lesson.prompt}</p>
      <small>Viết ít nhất 250 từ trong khoảng 40 phút.</small>
    </section>

    <ol className="ll-stepper" aria-label="Các bước học">{steps.map((item, index) => <li key={item.id} className={stepPass[item.id] ? "is-pass" : ""}>
      <button type="button" aria-current={step === item.id ? "step" : undefined} onClick={() => go(item.id)}>
        <span className="ll-step-dot">{stepPass[item.id] && step !== item.id ? <Check size={15} strokeWidth={3}/> : index + 1}</span>
        <span className="ll-step-text"><b>{item.id === "essay" ? target.label : item.label}</b><small>{item.id === "essay" ? target.hint : item.hint}</small></span>
        <span className="ll-step-score">{stepScore[item.id]}</span>
      </button>
    </li>)}</ol>

    {error && <p className="ll-error" role="alert">{error}</p>}

    {step === "learn" && <>
      <div className="ll-tip"><span><Target size={17}/></span><p><b>Mục tiêu hoàn thành</b>{lesson.target_vi}</p></div>
      <section className="t2-panel">
        <h2>Các bước tư duy</h2>
        <ol className="t2-steps">{lesson.steps.map((item, index) => <li key={index}>
          <span className="t2-step-num">{index + 1}</span>
          <div><b>{item.title_vi}</b><p>{item.instruction_vi}</p>{item.sample_en && <blockquote lang="en">{item.sample_en}</blockquote>}</div>
        </li>)}</ol>
      </section>
      <section className="t2-panel">
        <h2>Từ và cụm từ nên dùng</h2>
        <ul className="t2-vocab">{lesson.vocabulary.map((word) => <li key={word.phrase_en}><b lang="en">{word.phrase_en}</b><span>{word.meaning_vi}</span></li>)}</ul>
      </section>
      <div className="t2-next"><button type="button" className="ll-btn ll-btn-primary" onClick={() => go("drills")}>Bắt đầu {lesson.drills.length} bài luyện <ArrowRight size={16}/></button></div>
    </>}

    {step === "drills" && <>
      <section className="ll-brief"><div><span className="ll-kicker">Bước 2/3</span><h2>Luyện từng bước</h2><p>Tự viết câu trả lời bằng tiếng Anh, bấm lưu rồi so với gợi ý tham khảo. Gợi ý không phải đáp án duy nhất; có nhiều cách diễn đạt đúng.{sharedHint && <> {sharedHint}</>}</p></div></section>
      <div className="ll-questions">{lesson.drills.map((drill, index) => {
        const text = state.answers[drill.id] ?? "";
        const saved = drillSaved(state, drill.id);
        const answer = answers[drill.id];
        return <article key={drill.id} className={`ll-q t2-drill ${saved ? "is-saved" : ""}`} id={drill.id}>
          <div className="ll-q-head"><span className="ll-q-num">{saved ? <Check size={14} strokeWidth={3}/> : index + 1}</span><div><small>{drillModeLabels[drill.mode] ?? drill.mode}</small><p>{drill.question_vi}</p>{!sharedHint && <em className="t2-hint">{drill.hint_vi}</em>}</div></div>
          <textarea className="t2-text" lang="en" rows={3} value={text} placeholder="Viết câu trả lời bằng tiếng Anh…" aria-label={`Câu trả lời bài luyện ${index + 1}`}
            onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, answers: { ...current.answers, [drill.id]: value } })); }}/>
          <div className="t2-row">
            <small>{countWords(text)} từ{saved && state.saved[drill.id] ? ` · đã lưu ${new Date(state.saved[drill.id]).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}</small>
            <button type="button" className={`ll-btn ${answer ? "" : "ll-btn-primary"}`} disabled={busy === drill.id || text.trim().length < 3} onClick={() => void saveAndReveal(drill.id)}>
              <Save size={15}/>{busy === drill.id ? "Đang lưu…" : answer ? "Lưu lại" : "Lưu & xem gợi ý"}
            </button>
          </div>
          {answer && <div className="ll-feedback t2-answer">
            <div className="ll-feedback-top"><strong><Lightbulb size={14}/> Gợi ý tham khảo</strong></div>
            <q lang="en">{answer.answer_guide}</q>
            {answer.explanation_vi && <p>{answer.explanation_vi}</p>}
          </div>}
        </article>;
      })}</div>
      <div className="ll-submitbar">
        <div className="ll-submit-progress"><span><b>{savedDrills}</b>/{lesson.drills.length} bài luyện đã lưu</span><i><em style={{ width: `${(savedDrills / lesson.drills.length) * 100}%` }}/></i></div>
        <button type="button" className="ll-btn ll-btn-primary" onClick={() => go("essay")}><PenLine size={16}/> {target.label}</button>
      </div>
    </>}

    {step === "essay" && <>
      <section className="ll-brief"><div><span className="ll-kicker">Bước 3/3</span><h2>{target.label}</h2><p>{lesson.target_vi} Lưu bài từ {target.min} từ trở lên để {lesson.has_model_essay ? "mở bài mẫu tham khảo" : "hoàn thành bài học"}.</p></div></section>
      <section className="t2-essay">
        <textarea className="t2-text t2-essay-text" lang="en" rows={lesson.stage === "foundation" ? 6 : lesson.stage === "basic" ? 10 : 16} value={state.essay} placeholder={lesson.stage === "foundation" ? "Viết đoạn ngắn của bạn ở đây…" : "Viết bài của bạn ở đây…"} aria-label="Bài viết Task 2"
          onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, essay: value })); }}/>
        <div className="t2-row">
          <span className={`t2-words ${words >= target.goal ? "is-good" : words >= target.min ? "is-fair" : ""}`}><b>{words}</b> / {target.goal} từ</span>
          {notice && <small className="t2-notice"><CheckCircle2 size={14}/> {notice}</small>}
          <button type="button" className="ll-btn ll-btn-primary" disabled={busy === "essay" || !state.essay.trim()} onClick={() => void saveAndReveal("essay")}><Save size={15}/>{busy === "essay" ? "Đang lưu…" : "Lưu bài viết"}</button>
        </div>
      </section>
      <section className="t2-panel">
        <h2>Tự kiểm tra theo 4 tiêu chí</h2>
        <ul className="t2-checklist">{essayChecklist.map((item) => <li key={item.id}><label>
          <input type="checkbox" checked={Boolean(state.checklist[item.id])} onChange={(event) => { const checked = event.target.checked; update((current) => ({ ...current, checklist: { ...current.checklist, [item.id]: checked } })); }}/>
          <span className="t2-criterion">{item.criterion}</span><span>{item.text}</span>
        </label></li>)}</ul>
      </section>
      {model ? <section className="t2-panel t2-model">
        <span className="ll-kicker">Bài mẫu tham khảo · khoảng {model.word_count} từ</span>
        <h2 lang="en">{model.title}</h2>
        <div className="t2-model-text" lang="en">{model.essay.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <div className="ll-tip"><span><BookOpenCheck size={17}/></span><p><b>Vì sao bài này hiệu quả</b>{model.explanation_vi}</p></div>
        <p className="t2-outline"><b>Dàn ý:</b> {model.outline_vi}</p>
        <p className="ll-footnote">Bài mẫu để tham khảo cách triển khai ý, không phải bài được chấm band chính thức. So sánh cách lập luận, đừng chép nguyên câu.</p>
      </section> : model === null || (essaySaved(state, lesson.stage) && !lesson.has_model_essay)
        ? <p className="ll-empty">Bài này chưa có bài mẫu. Hãy dùng bảng tự kiểm tra ở trên để rà lại bài viết.</p>
        : lesson.has_model_essay ? <p className="ll-empty">Bài mẫu sẽ hiện ở đây sau khi bạn lưu bài viết từ {target.min} từ trở lên.</p> : null}
    </>}

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài làm được lưu vào tài khoản của bạn; tiến độ không quy đổi sang band.</p>
  </div>;
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={TASK2_BASE}>Writing Task 2 Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
