"use client";
/*
 * Writing Task 1 Lab: 37 lessons from the F37 package (8 guided chart/map/process lessons and 29 Process
 * modules). It follows the Writing Task 2 Lab, which reuses the Listening Lab layout, so the self-study labs
 * read as one product: a roadmap of chặng, and a lesson page that walks through reading the figure,
 * short drills with guides after saving, and the full report.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowRight, BookOpenCheck, Check, CheckCircle2, Clock3, Eye, Lightbulb, ListChecks, PenLine, Play, Save, Sparkles, Target, XCircle } from "lucide-react";
import {
  TASK1_API, TASK1_BASE, countWords, drillModeLabels, drillSaved, essaySaved, groupLabels, reportChecklist, stageInfo, stageOrder, writingTargets,
  type Task1Check, type Task1DrillAnswer, type Task1Lesson, type Task1LessonSummary, type Task1Model, type Task1Stage, type Task1State,
} from "@/lib/writing-task1/types";
import { Task1Figure } from "./task1-figure";
import { cacheTask1State, checkTask1, emptyTask1State, loadAllTask1States, loadTask1State, revealTask1, saveTask1State } from "./task1-state";
import "@/features/listening/listening-lab.css";
import "./writing-task1.css";

export function WritingTask1Lab() {
  const parts = usePathname().split("/").filter(Boolean);
  return parts[3] ? <LessonPage key={parts[3]} id={decodeURIComponent(parts[3])} /> : <RoadmapPage />;
}

const themeStyle = (stage: Task1Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;
const groupLabel = (group: string) => groupLabels[group] ?? group;

type LessonProgress = { checks: number; drills: number; essay: boolean; started: boolean };
function progressOf(state: Task1State | undefined, stage: Task1Stage): LessonProgress {
  if (!state) return { checks: 0, drills: 0, essay: false, started: false };
  const drills = Object.keys(state.saved).filter((id) => drillSaved(state, id)).length;
  const checks = Object.keys(state.results).length;
  return { checks, drills, essay: essaySaved(state, stage), started: checks > 0 || drills > 0 || Boolean(state.essay.trim()) || Object.values(state.answers).some((text) => text.trim()) };
}
const complete = (lesson: Task1LessonSummary, progress: LessonProgress) => progress.essay && progress.drills >= lesson.drill_count && progress.checks >= lesson.check_count;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

/* ───────────────────────── Roadmap ───────────────────────── */

function RoadmapPage() {
  const [lessons, setLessons] = useState<Task1LessonSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, Task1State>>({});
  const [error, setError] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    void getJson<{ lessons: Task1LessonSummary[] }>(TASK1_API).then(async ({ lessons: list }) => {
      if (!alive) return;
      setLessons(list);
      const saved = await loadAllTask1States(list.map((lesson) => lesson.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const progress = useMemo(() => Object.fromEntries((lessons ?? []).map((lesson) => [lesson.id, progressOf(states[lesson.id], lesson.stage)])), [lessons, states]);
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lesson of lessons ?? []) counts.set(lesson.group, (counts.get(lesson.group) ?? 0) + 1);
    return [...counts].sort((a, b) => Object.keys(groupLabels).indexOf(a[0]) - Object.keys(groupLabels).indexOf(b[0]));
  }, [lessons]);

  if (error) return <div className="ll-page t1-lab"><p className="ll-error" role="alert">{error}</p></div>;
  if (!lessons) return <div className="ll-page t1-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const number = (id: string) => String(lessons.findIndex((lesson) => lesson.id === id) + 1).padStart(2, "0");
  const done = lessons.filter((lesson) => complete(lesson, progress[lesson.id])).length;
  const next = lessons.find((lesson) => progress[lesson.id].started && !complete(lesson, progress[lesson.id])) ?? lessons.find((lesson) => !complete(lesson, progress[lesson.id])) ?? lessons[0];
  const checksDone = lessons.reduce((sum, lesson) => sum + progress[lesson.id].checks, 0);
  const reports = lessons.filter((lesson) => progress[lesson.id].essay).length;
  const visible = (lesson: Task1LessonSummary) => groupFilter === "all" || lesson.group === groupFilter;

  return <div className="ll-page ll-roadmap t1-lab">
    <header className="ll-hero t1-hero">
      <div className="ll-hero-copy">
        <h1>Đọc hình, viết Task 1 <em>từng bước một.</em></h1>
        <div className="ll-hero-actions">
          <Link className="ll-cta" href={`${TASK1_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{progress[next.id].started ? "Học tiếp" : done ? "Bài tiếp theo" : "Bắt đầu học"}</b><small>Bài {number(next.id)} · {groupLabel(next.group)} · {next.title}</small></span>
            <ArrowRight size={18}/>
          </Link>
          <span className="ll-draft-pill" title="Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi chính thức">Thử nghiệm</span>
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={lessons.length}/><div><strong>Bài đã hoàn thành</strong><span>Còn {lessons.length - done} bài</span></div></div>
        <dl><div><dt>Câu đọc hình</dt><dd>{checksDone}</dd></div><div><dt>Bài viết đã lưu</dt><dd>{reports}</dd></div><div><dt>Có bài mẫu</dt><dd>{lessons.filter((lesson) => lesson.has_model).length}</dd></div></dl>
      </div>
    </header>

    <section className="ll-journey t1-journey" aria-labelledby="t1-journey-title">
      <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ lộ trình</span><h2 id="t1-journey-title">{stageOrder.length} chặng, {lessons.length} bài</h2></div><small>Mức 1.0–7.0+ là mức luyện nội bộ (S01–S07), không phải band IELTS.</small></div>
      <ol className="ll-track-map">{stageOrder.map((stage, index) => {
        const units = lessons.filter((lesson) => lesson.stage === stage);
        const count = units.filter((lesson) => complete(lesson, progress[lesson.id])).length;
        const here = next.stage === stage;
        return <li key={stage} style={themeStyle(stage)} className={`${here ? "is-here" : ""} ${units.length && count === units.length ? "is-done" : ""}`}>
          <a href={`#chang-${index + 1}`}>
            <span className="ll-node">{units.length && count === units.length ? <Check size={16} strokeWidth={3}/> : index + 1}</span>
            <b>{stageInfo[stage].name}</b><small>{stageInfo[stage].levels} · {units[0]?.target_range} · {units.length} bài</small>
            <i aria-label={`${count}/${units.length} bài hoàn thành`}>{units.map((lesson) => <em key={lesson.id} className={complete(lesson, progress[lesson.id]) ? "is-on" : ""}/>)}</i>
            {here && <span className="ll-here">Bạn ở đây</span>}
          </a>
        </li>;
      })}</ol>
    </section>

    <div className="ll-typebar" role="group" aria-label="Lọc theo dạng bài">
      <span><ListChecks size={16}/> Dạng bài</span>
      <button type="button" aria-pressed={groupFilter === "all"} onClick={() => setGroupFilter("all")}>Tất cả<small>{lessons.length}</small></button>
      {groupCounts.map(([group, count]) => <button type="button" key={group} aria-pressed={groupFilter === group} onClick={() => setGroupFilter(group)}>{groupLabel(group)}<small>{count}</small></button>)}
    </div>

    {stageOrder.map((stage, index) => {
      const all = lessons.filter((lesson) => lesson.stage === stage);
      const units = all.filter(visible);
      if (!units.length) return null;
      const count = all.filter((lesson) => complete(lesson, progress[lesson.id])).length;
      return <section className="ll-stage" id={`chang-${index + 1}`} key={stage} style={themeStyle(stage)}>
        <header><span className="ll-stage-tag">Chặng {index + 1}</span><h2>{stageInfo[stage].name}<small>{stageInfo[stage].levels} · {all[0].target_range}</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(count / all.length) * 100}%` }}/></i>{count}/{all.length} xong</span></header>
        <div className="ll-grid">{units.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} number={number(lesson.id)} progress={progress[lesson.id]} isNext={lesson.id === next.id}/>)}</div>
      </section>;
    })}

    <aside className="ll-note"><Sparkles size={16}/><p>Đề, hình và bài mẫu là tài liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Gợi ý và bài mẫu chỉ mở sau khi bạn lưu bài làm của mình; tiến độ ở đây không quy đổi sang band.</p></aside>
  </div>;
}

function LessonCard({ lesson, number, progress, isNext }: { lesson: Task1LessonSummary; number: string; progress: LessonProgress; isNext: boolean }) {
  const done = complete(lesson, progress);
  const status = done ? { label: "Hoàn thành", cls: "is-done" } : isNext ? { label: progress.started ? "Đang học" : "Tiếp theo", cls: "is-next" } : progress.started ? { label: "Đang học", cls: "is-tried" } : null;
  return <Link href={`${TASK1_BASE}/${lesson.id}`} className={`ll-card ${isNext ? "is-next" : ""} ${done ? "is-done" : ""}`}>
    <div className="ll-card-top"><span className="ll-number">{number}</span>{status && <span className={`ll-status ${status.cls}`}>{status.label}</span>}</div>
    <strong>{lesson.title}</strong>
    <p className="t1-card-prompt">{lesson.question}</p>
    <div className="ll-card-types"><span>{groupLabel(lesson.group)}</span>{lesson.kind === "process" && lesson.subtopic && <span>{lesson.subtopic}</span>}{lesson.has_model && <span className="t1-chip-model">Có bài mẫu</span>}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label={`${progress.checks}/${lesson.check_count} câu đọc hình, ${progress.drills}/${lesson.drill_count} bài luyện, bài viết ${progress.essay ? "đã lưu" : "chưa lưu"}`}>
        <i className={`t1-pip-read ${progress.checks >= lesson.check_count ? "is-pass" : progress.checks ? "is-part" : ""}`} title="Đọc hình"/>
        {Array.from({ length: lesson.drill_count }, (_, index) => <i key={index} className={`t1-pip ${index < progress.drills ? "is-pass" : ""}`}/>)}
        <i className={`t1-pip-essay ${progress.essay ? "is-pass" : ""}`} title="Bài viết"/>
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

type Step = "read" | "drills" | "essay";
const steps: { id: Step; label: string; hint: string }[] = [
  { id: "read", label: "Đọc hình", hint: "Trả lời câu hỏi về hình" },
  { id: "drills", label: "Luyện từng phần", hint: "Viết ngắn, lưu rồi xem gợi ý" },
  { id: "essay", label: "Viết bài hoàn chỉnh", hint: "150 từ, tự kiểm tra 4 tiêu chí" },
];

function LessonPage({ id }: { id: string }) {
  const [lesson, setLesson] = useState<Task1Lesson | null>(null);
  const [number, setNumber] = useState("");
  const [state, setState] = useState<Task1State | null>(null);
  const [step, setStep] = useState<Step>("read");
  const [answers, setAnswers] = useState<Record<string, Task1DrillAnswer>>({});
  const [model, setModel] = useState<Task1Model | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<{ lesson: Task1Lesson }>(`${TASK1_API}/${encodeURIComponent(id)}`),
      getJson<{ lessons: Task1LessonSummary[] }>(TASK1_API).catch(() => ({ lessons: [] as Task1LessonSummary[] })),
      loadTask1State(id).catch(() => emptyTask1State()),
    ]).then(async ([{ lesson: loaded }, { lessons }, saved]) => {
      if (!alive) return;
      const index = lessons.findIndex((item) => item.id === loaded.id);
      setLesson(loaded); setNumber(index >= 0 ? String(index + 1).padStart(2, "0") : ""); setState(saved);
      const hash = window.location.hash.slice(1) as Step;
      const done = loaded.drills.filter((drill) => drillSaved(saved, drill.id));
      const read = loaded.checks.every((check) => saved.results[check.id]);
      setStep(steps.some((item) => item.id === hash) ? hash : essaySaved(saved, loaded.stage) || done.length === loaded.drills.length ? "essay" : done.length || read ? "drills" : "read");
      // Guides already earned in an earlier visit open again without another click.
      const targets = [...done.map((drill) => drill.id), ...(essaySaved(saved, loaded.stage) ? ["essay"] : [])];
      if (targets.length) {
        const revealed = await revealTask1(loaded.id, targets, saved).catch(() => null);
        if (alive && revealed) { setAnswers(revealed.drills); if (revealed.model !== undefined) setModel(revealed.model); }
      }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài học."); });
    return () => { alive = false; };
  }, [id]);

  // Work is kept in the browser at once and synced to the account a moment after the learner pauses.
  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);
  function update(change: (current: Task1State) => Task1State) {
    setState((current) => {
      if (!current) return current;
      const next = { ...change(current), updatedAt: Date.now() };
      cacheTask1State(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveTask1State(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }

  async function runChecks() {
    if (!state || !lesson) return;
    const pending = Object.fromEntries(lesson.checks.filter((check) => state.choices[check.id] && !state.results[check.id]).map((check) => [check.id, state.choices[check.id]]));
    if (!Object.keys(pending).length) return;
    setBusy("checks"); setError("");
    try {
      const results = await checkTask1(lesson.id, pending);
      update((current) => ({ ...current, results: { ...current.results, ...results } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa kiểm tra được.");
    } finally { setBusy(""); }
  }

  async function saveAndReveal(target: string) {
    if (!state || !lesson) return;
    const now = new Date().toISOString();
    const next: Task1State = target === "essay" ? { ...state, essaySavedAt: now, updatedAt: Date.now() } : { ...state, saved: { ...state.saved, [target]: now }, updatedAt: Date.now() };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setBusy(target); setError(""); setNotice(""); setState(next);
    try {
      await saveTask1State(id, next);
      if (target === "essay" && !essaySaved(next, lesson.stage)) { setNotice(`Đã lưu bài viết (${countWords(next.essay)} từ). Viết từ ${writingTargets[lesson.stage].min} từ trở lên để ${lesson.has_model ? "mở bài mẫu" : "hoàn thành bài học"}.`); return; }
      const revealed = await revealTask1(lesson.id, [target], next);
      if (target === "essay") { setModel(revealed.model ?? null); setNotice("Đã lưu bài viết."); }
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

  if (error && !lesson) return <div className="ll-page t1-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!lesson || !state) return <div className="ll-page t1-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const checked = lesson.checks.filter((check) => state.results[check.id]);
  const correct = checked.filter((check) => state.results[check.id].correct).length;
  const pendingChoices = lesson.checks.filter((check) => state.choices[check.id] && !state.results[check.id]).length;
  const allRead = checked.length === lesson.checks.length;
  const savedDrills = lesson.drills.filter((drill) => drillSaved(state, drill.id)).length;
  const words = countWords(state.essay);
  const target = writingTargets[lesson.stage];
  const stepScore: Record<Step, string> = { read: checked.length ? `${correct}/${lesson.checks.length} đúng` : `${lesson.checks.length} câu`, drills: `${savedDrills}/${lesson.drills.length}`, essay: essaySaved(state, lesson.stage) ? `${words} từ` : "Chưa lưu" };
  const stepPass: Record<Step, boolean> = { read: allRead, drills: savedDrills === lesson.drills.length, essay: essaySaved(state, lesson.stage) };

  return <div className="ll-page ll-module t1-lab" style={themeStyle(lesson.stage)}>
    <Breadcrumb current={`${number ? `Bài ${number} · ` : ""}${lesson.title}`}/>
    <header className="ll-module-hero">
      <div className="ll-module-badge"><small>Bài</small><b>{number || "–"}</b></div>
      <div className="ll-module-copy">
        <span className="ll-kicker">{stageInfo[lesson.stage].name} · mức luyện {lesson.target_range}</span>
        <h1>{lesson.title}</h1>
        <p>{lesson.kind === "process" ? "Đọc sơ đồ theo từng mũi tên, lập Overview và dàn ý hai đoạn rồi tự viết bài mô tả quy trình." : "Đọc hình, chọn dữ kiện nổi bật, viết mở bài và Overview rồi hoàn thành bài báo cáo."}</p>
        <div className="ll-chips"><span>{groupLabel(lesson.group)}</span>{lesson.subtopic && <span>{lesson.subtopic}</span>}<span>{lesson.minutes} phút</span>{lesson.has_model && <span className="t1-chip-model">Có bài mẫu</span>}</div>
      </div>
      <dl className="ll-facts"><div><dt>Đọc hình</dt><dd>{checked.length ? `${correct}/${lesson.checks.length}` : "–"}</dd></div><div><dt>Bài luyện</dt><dd>{savedDrills}/{lesson.drills.length}</dd></div><div><dt>Bài viết</dt><dd>{words || "–"}</dd></div></dl>
    </header>

    <section className="t1-prompt" aria-label="Đề bài">
      <div className="t1-prompt-text">
        <span className="ll-kicker">Đề bài · Writing Task 1</span>
        <p lang="en">{lesson.question}</p>
        <small>Viết ít nhất 150 từ trong khoảng 20 phút.</small>
      </div>
      <Task1Figure visual={lesson.visual} unit={lesson.unit}/>
    </section>

    <ol className="ll-stepper" aria-label="Các bước học">{steps.map((item, index) => <li key={item.id} className={stepPass[item.id] ? "is-pass" : ""}>
      <button type="button" aria-current={step === item.id ? "step" : undefined} onClick={() => go(item.id)}>
        <span className="ll-step-dot">{stepPass[item.id] && step !== item.id ? <Check size={15} strokeWidth={3}/> : index + 1}</span>
        <span className="ll-step-text"><b>{item.id === "essay" ? target.label : item.label}</b><small>{item.id === "essay" ? target.hint : item.hint}</small></span>
        <span className="ll-step-score">{stepScore[item.id]}</span>
      </button>
    </li>)}</ol>

    {error && <p className="ll-error" role="alert">{error}</p>}

    {step === "read" && <>
      <section className="ll-brief"><div><span className="ll-kicker">Bước 1/3</span><h2>Đọc hình</h2><p>{lesson.kind === "process" ? "Nhìn kỹ sơ đồ (bấm Phóng to nếu nhãn nhỏ), rồi chọn đáp án cho từng câu. Câu True/False hỏi về chiều của mũi tên: chỉ chọn True khi sơ đồ thật sự có đường nối đó." : "Đọc tiêu đề, đơn vị và các mốc trên hình trước, rồi chọn đáp án. Mọi câu trả lời phải dựa vào số liệu trên hình."}</p></div></section>
      <div className="ll-questions">{lesson.checks.map((check, index) => <CheckItem key={check.id} check={check} index={index} choice={state.choices[check.id]} result={state.results[check.id]}
        onChange={(value) => update((current) => ({ ...current, choices: { ...current.choices, [check.id]: value } }))}/>)}</div>
      <div className="ll-submitbar">
        <div className="ll-submit-progress"><span><b>{checked.length}</b>/{lesson.checks.length} câu đã kiểm tra{checked.length ? ` · ${correct} đúng` : ""}</span><i><em style={{ width: `${(checked.length / lesson.checks.length) * 100}%` }}/></i></div>
        {allRead
          ? <button type="button" className="ll-btn ll-btn-primary" onClick={() => go("drills")}>Luyện từng phần <ArrowRight size={16}/></button>
          : <button type="button" className="ll-btn ll-btn-primary" disabled={busy === "checks" || !pendingChoices} onClick={() => void runChecks()}><Eye size={16}/>{busy === "checks" ? "Đang kiểm tra…" : `Kiểm tra ${pendingChoices || ""} câu`.replace("  ", " ")}</button>}
      </div>
      {lesson.kind === "guided" ? allRead && <section className="t1-panel">
        <h2>Dữ kiện nên đưa vào bài</h2>
        <ul className="t1-facts">{lesson.facts.map((fact) => <li key={fact.en}><b lang="en">{fact.en}</b><span>{fact.vi}</span></li>)}</ul>
        {lesson.mistake && <div className="ll-tip t1-mistake"><span><AlertTriangle size={17}/></span><p><b>Lỗi hay gặp</b>{lesson.mistake.vi}</p></div>}
        {lesson.phrases.length > 0 && <><h3>Cụm từ nên dùng</h3><ul className="t1-phrases">{lesson.phrases.map((phrase) => <li key={phrase} lang="en">{phrase}</li>)}</ul></>}
      </section> : <section className="t1-panel">
        <h2>Các bước tư duy</h2>
        <ol className="t1-steps">{lesson.steps.map((item, index) => <li key={index}>
          <span className="t1-step-num">{index + 1}</span>
          <div><b>{item.title_vi}<small> · {item.minutes} phút</small></b><p>{item.instruction_vi}</p></div>
        </li>)}</ol>
      </section>}
      {lesson.kind === "guided" && !allRead && <p className="ll-empty">Dữ kiện chính, lỗi hay gặp và cụm từ gợi ý sẽ hiện sau khi bạn kiểm tra hết {lesson.checks.length} câu.</p>}
    </>}

    {step === "drills" && <>
      <section className="ll-brief"><div><span className="ll-kicker">Bước 2/3</span><h2>Luyện từng phần</h2><p>Tự viết bằng tiếng Anh, bấm lưu rồi so với gợi ý tham khảo. Gợi ý không phải đáp án duy nhất; có nhiều cách diễn đạt đúng.</p></div></section>
      <div className="ll-questions">{lesson.drills.map((drill, index) => {
        const text = state.answers[drill.id] ?? "";
        const saved = drillSaved(state, drill.id);
        const answer = answers[drill.id];
        return <article key={drill.id} className={`ll-q t1-drill ${saved ? "is-saved" : ""}`} id={drill.id}>
          <div className="ll-q-head"><span className="ll-q-num">{saved ? <Check size={14} strokeWidth={3}/> : index + 1}</span><div><small>{drillModeLabels[drill.mode] ?? drill.mode}</small><p>{drill.question_vi}</p><em className="t1-hint">{drill.hint_vi}</em></div></div>
          <textarea className="t1-text" lang="en" rows={3} value={text} placeholder="Viết câu trả lời của bạn…" aria-label={`Câu trả lời bài luyện ${index + 1}`}
            onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, answers: { ...current.answers, [drill.id]: value } })); }}/>
          <div className="t1-row">
            <small>{countWords(text)} từ{saved && state.saved[drill.id] ? ` · đã lưu ${new Date(state.saved[drill.id]).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}</small>
            <button type="button" className={`ll-btn ${answer ? "" : "ll-btn-primary"}`} disabled={busy === drill.id || text.trim().length < 3} onClick={() => void saveAndReveal(drill.id)}>
              <Save size={15}/>{busy === drill.id ? "Đang lưu…" : answer ? "Lưu lại" : "Lưu & xem gợi ý"}
            </button>
          </div>
          {answer && <div className="ll-feedback t1-answer">
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
      <section className="ll-brief"><div><span className="ll-kicker">Bước 3/3</span><h2>{target.label}</h2><p>{lesson.stage === "foundation" ? "Viết câu mở bài và Overview cho đề ở trên (khoảng 50 từ)." : "Viết bài theo bố cục Intro – Overview – Body 1 – Body 2, chỉ dùng dữ kiện có trên hình."} Lưu bài từ {target.min} từ trở lên để {lesson.has_model ? "mở bài mẫu tham khảo" : "hoàn thành bài học"}.</p></div></section>
      <section className="t1-essay">
        <textarea className="t1-text t1-essay-text" lang="en" rows={lesson.stage === "foundation" ? 6 : 14} value={state.essay} placeholder={lesson.stage === "foundation" ? "Viết mở bài và Overview ở đây…" : "Viết bài của bạn ở đây…"} aria-label="Bài viết Task 1"
          onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, essay: value })); }}/>
        <div className="t1-row">
          <span className={`t1-words ${words >= target.goal ? "is-good" : words >= target.min ? "is-fair" : ""}`}><b>{words}</b> / {target.goal} từ</span>
          {notice && <small className="t1-notice"><CheckCircle2 size={14}/> {notice}</small>}
          <button type="button" className="ll-btn ll-btn-primary" disabled={busy === "essay" || !state.essay.trim()} onClick={() => void saveAndReveal("essay")}><Save size={15}/>{busy === "essay" ? "Đang lưu…" : "Lưu bài viết"}</button>
        </div>
      </section>
      <section className="t1-panel">
        <h2>Tự kiểm tra theo 4 tiêu chí</h2>
        <ul className="t1-checklist">{reportChecklist.map((item) => <li key={item.id}><label>
          <input type="checkbox" checked={Boolean(state.checklist[item.id])} onChange={(event) => { const value = event.target.checked; update((current) => ({ ...current, checklist: { ...current.checklist, [item.id]: value } })); }}/>
          <span className="t1-criterion">{item.criterion}</span><span>{item.text}</span>
        </label></li>)}</ul>
      </section>
      {model ? <section className="t1-panel t1-model">
        <span className="ll-kicker">Bài mẫu tham khảo · khoảng {model.word_count} từ</span>
        <div className="t1-model-text" lang="en">{model.paragraphs.map((paragraph, index) => <p key={index}><span className="t1-para-tag">{["Intro", "Overview", "Body 1", "Body 2"][index] ?? ""}</span>{paragraph}</p>)}</div>
        <div className="ll-tip"><span><BookOpenCheck size={17}/></span><p><b>Vì sao bài này hiệu quả</b>{model.explanation_vi}</p></div>
        <p className="t1-outline"><b>Cách chia nhóm:</b> {model.outline_vi}</p>
        <p className="ll-footnote">Bài mẫu để tham khảo cách chọn và nhóm dữ kiện, không phải bài được chấm band chính thức. So sánh cách triển khai, đừng chép nguyên câu.</p>
      </section> : model === null || (essaySaved(state, lesson.stage) && !lesson.has_model)
        ? <p className="ll-empty">Bài này chưa có bài mẫu. Hãy dùng bảng tự kiểm tra ở trên và đối chiếu từng câu với sơ đồ.</p>
        : lesson.has_model ? <p className="ll-empty">Bài mẫu sẽ hiện ở đây sau khi bạn lưu bài viết từ {target.min} từ trở lên.</p> : null}
    </>}

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài làm được lưu vào tài khoản của bạn; tiến độ không quy đổi sang band.</p>
  </div>;
}

function CheckItem({ check, index, choice, result, onChange }: { check: Task1Check; index: number; choice?: string; result?: Task1State["results"][string]; onChange: (value: string) => void }) {
  const name = `check-${check.id}`;
  return <article className={`ll-q ${result ? result.correct ? "is-correct" : "is-wrong" : ""}`}>
    <div className="ll-q-head"><span className="ll-q-num">{result ? result.correct ? <Check size={14} strokeWidth={3}/> : <XCircle size={14}/> : index + 1}</span><div><small>{check.kind === "tf" ? "True / False" : "Chọn đáp án"}</small><p lang="en">{check.prompt}</p></div></div>
    <div className={`ll-options ${check.kind === "tf" ? "t1-tf" : ""}`} role="radiogroup" aria-label={`Câu ${index + 1}`}>{check.options.map((option, optionIndex) => {
      const cls = result ? option.id === result.answer ? "is-key" : choice === option.id ? "is-picked-wrong" : "" : choice === option.id ? "is-picked" : "";
      return <label key={option.id} className={cls}><input type="radio" name={name} value={option.id} checked={choice === option.id} disabled={Boolean(result)} onChange={() => onChange(option.id)}/><b>{check.kind === "tf" ? option.text[0] : String.fromCharCode(65 + optionIndex)}</b><span lang="en">{option.text}</span></label>;
    })}</div>
    {result && <div className="ll-feedback"><div className="ll-feedback-top"><strong>{result.correct ? <><CheckCircle2 size={14}/> Chính xác</> : <><Target size={14}/> Chưa đúng</>}</strong></div>{result.explanation_vi && <p>{result.explanation_vi}</p>}</div>}
  </article>;
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={TASK1_BASE}>Writing Task 1 Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
