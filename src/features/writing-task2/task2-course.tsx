"use client";
/*
 * The R01–R16 skills course inside Writing Task 2 Lab. Every milestone uses one template: teaching units and
 * reference cards, worked examples one at a time, then practice one item at a time with hints, an optional peek
 * at the reference (not in the final milestone) and a self-check. Data comes normalised from the course API.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Eye, Languages, Layers, Lightbulb, ListChecks, Play, Save, Sparkles, Target, Timer, X } from "lucide-react";
import {
  COURSE_API, COURSE_BASE, attemptDone, courseLayers, courseStageLabels,
  type CourseAnswer, type CourseAttempt, type CourseExample, type CourseField, type CourseModule, type CourseModuleSummary, type CoursePractice, type CourseSection, type CourseUnit,
} from "@/lib/writing-task2/course-types";
import { TASK2_BASE, countWords, questionTypeLabels } from "@/lib/writing-task2/types";
import { addPeek, loadCourseAttempts, loadCourseProgress, readPeeks, revealCourse, saveCourseAttempt } from "./course-state";
import { withTerms } from "./task2-text";

const layerTone: Record<string, { tone: string; soft: string }> = {
  "1": { tone: "#0a7f89", soft: "#e2f5f4" }, "2": { tone: "#2577c8", soft: "#e6f0fb" }, "3": { tone: "#7c66dc", soft: "#f1eefe" },
  "4": { tone: "#c0662b", soft: "#fdf0e6" }, "5": { tone: "#2f8f5b", soft: "#e7f6ee" }, "6": { tone: "#d2524a", soft: "#fdeeec" },
};
const toneStyle = (layer: string) => ({ "--ll-tone": layerTone[layer]?.tone ?? "#0a7f89", "--ll-soft": layerTone[layer]?.soft ?? "#e2f5f4" }) as CSSProperties;
const typeLabel = (type?: string) => (type ? questionTypeLabels[type] ?? type : "");

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "unavailable"; message: string } | { state: "error"; message: string };
async function fetchCourse<T>(url: string): Promise<Load<T>> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (response.ok) return { state: "ready", data: body as T };
  if (response.status === 503 || body.unavailable) return { state: "unavailable", message: body.error ?? "Khoá kỹ năng đang được cập nhật." };
  return { state: "error", message: body.error ?? "Không tải được khoá học." };
}

/* ───────────── Course home ───────────── */

export function CourseHome({ onLessons }: { onLessons: () => void }) {
  const [load, setLoad] = useState<Load<{ modules: CourseModuleSummary[] }>>({ state: "loading" });
  const [progress, setProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    void fetchCourse<{ modules: CourseModuleSummary[] }>(COURSE_API).then(async (result) => {
      if (!alive) return;
      setLoad(result);
      if (result.state === "ready") { const saved = await loadCourseProgress().catch(() => ({})); if (alive) setProgress(saved); }
    }).catch(() => { if (alive) setLoad({ state: "error", message: "Không tải được khoá học." }); });
    return () => { alive = false; };
  }, []);

  if (load.state === "loading") return <><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-card"/></>;
  if (load.state !== "ready") return <section className="t2-panel t2-course-empty">
    <span className="ll-kicker">Khoá kỹ năng R01–R16</span>
    <h2>{load.state === "unavailable" ? "Khoá kỹ năng đang được cập nhật" : "Chưa tải được khoá học"}</h2>
    <p className="t2-lead">{load.message} Trong lúc chờ, bạn có thể luyện theo đề trong phần Luyện đề.</p>
    <div className="t2-next"><button type="button" className="ll-btn ll-btn-primary" onClick={onLessons}>Sang Luyện đề <ArrowRight size={16}/></button></div>
  </section>;

  const modules = load.data.modules;
  const byId = new Map(modules.map((module) => [module.id, module]));
  const done = (module: CourseModuleSummary) => Math.min(progress[module.id] ?? 0, module.counts.practice);
  const next = modules.find((module) => done(module) > 0 && done(module) < module.counts.practice) ?? modules.find((module) => done(module) < module.counts.practice) ?? modules[0];
  const totalPractice = modules.reduce((sum, module) => sum + module.counts.practice, 0);
  const totalDone = modules.reduce((sum, module) => sum + done(module), 0);

  return <>
    <header className="ll-hero t2-hero">
      <div className="ll-hero-copy">
        <h1>Khoá kỹ năng Task 2, <em>học đâu chắc đó.</em></h1>
        <div className="ll-hero-actions">
          <Link className="ll-cta" href={`${COURSE_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{totalDone ? "Học tiếp" : "Bắt đầu khoá học"}</b><small>{next.id} · {next.title}</small></span>
            <ArrowRight size={18}/>
          </Link>
        </div>
      </div>
      <div className="ll-stats">
        <dl><div><dt>Chặng</dt><dd>{modules.length}</dd></div><div><dt>Câu đã làm</dt><dd>{totalDone}</dd></div><div><dt>Tổng câu luyện</dt><dd>{totalPractice}</dd></div></dl>
      </div>
    </header>

    {courseLayers.map((layer) => <section key={layer.id} className="t2-layer" style={toneStyle(layer.id)}>
      <header><span className="ll-stage-tag">Lớp {layer.id}</span><h2>{layer.name}</h2><small>{layer.about}</small></header>
      <div className="t2-module-grid">{layer.modules.map((id) => byId.get(id)).filter((module): module is CourseModuleSummary => Boolean(module)).map((module) => {
        const count = done(module);
        return <Link key={module.id} href={`${COURSE_BASE}/${module.id}`} className={`t2-module-card ${module.id === next.id ? "is-next" : ""} ${count >= module.counts.practice ? "is-done" : ""}`}>
          <div className="t2-module-top"><span className="t2-module-id">{module.id}</span>{module.id === next.id && <span className="ll-status is-next">{count ? "Đang học" : "Tiếp theo"}</span>}</div>
          <strong>{module.title}</strong>
          <p>{module.overview}</p>
          <div className="t2-module-meta"><span><BookOpen size={12}/> {module.counts.units} bài giảng</span>{module.counts.examples > 0 && <span><Sparkles size={12}/> {module.counts.examples} ví dụ</span>}<span><ListChecks size={12}/> {module.counts.practice} câu</span></div>
          <span className="t2-module-bar" aria-label={`${count}/${module.counts.practice} câu đã làm`}><i style={{ width: `${(count / Math.max(1, module.counts.practice)) * 100}%` }}/></span>
        </Link>;
      })}</div>
    </section>)}
    <aside className="ll-note"><Sparkles size={16}/><p>Học liệu do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Mức Nền tảng–Nâng cao là chặng học nội bộ, không quy đổi sang band.</p></aside>
  </>;
}

/* ───────────── Milestone page ───────────── */

type Step = "learn" | "examples" | "practice";

export function CourseModulePage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load<{ module: CourseModule }>>({ state: "loading" });
  const [attempts, setAttempts] = useState<Record<string, CourseAttempt>>({});
  const [peeks, setPeeks] = useState<string[]>([]);
  const [step, setStep] = useState<Step>("learn");

  useEffect(() => {
    let alive = true;
    void fetchCourse<{ module: CourseModule }>(`${COURSE_API}/${encodeURIComponent(id)}`).then(async (result) => {
      if (!alive) return;
      setLoad(result);
      setPeeks(readPeeks(id));
      const hash = window.location.hash.slice(1) as Step;
      if (["learn", "examples", "practice"].includes(hash)) setStep(hash);
      if (result.state === "ready") { const saved = await loadCourseAttempts(id).catch(() => ({})); if (alive) setAttempts(saved); }
    }).catch(() => { if (alive) setLoad({ state: "error", message: "Không tải được chặng học." }); });
    return () => { alive = false; };
  }, [id]);

  function go(target: Step) {
    setStep(target);
    history.replaceState(null, "", `#${target}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (load.state === "loading") return <div className="ll-page t2-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-card"/></div>;
  if (load.state !== "ready") return <div className="ll-page t2-lab"><CourseCrumb current={id}/><p className="ll-error" role="alert">{load.message}</p></div>;

  const milestone = load.data.module;
  const done = milestone.practice.filter((item) => attemptDone(attempts[item.id])).length;
  const steps: { id: Step; label: string; hint: string; score: string; pass: boolean }[] = [
    { id: "learn", label: "Bài giảng", hint: `${milestone.units.length} bài · ${milestone.sections.length} tài liệu`, score: "", pass: done > 0 },
    ...(milestone.examples.length ? [{ id: "examples" as Step, label: "Ví dụ mẫu", hint: "Xem trước khi tự viết", score: `${milestone.examples.length}`, pass: done > 0 }] : []),
    { id: "practice", label: "Luyện tập", hint: "Từng câu, có gợi ý", score: `${done}/${milestone.practice.length}`, pass: done === milestone.practice.length },
  ];
  const nextModule = courseLayers.flatMap((layer) => layer.modules)[courseLayers.flatMap((layer) => layer.modules).indexOf(milestone.id) + 1];

  return <div className="ll-page ll-module t2-lab t2-lesson t2-course" style={toneStyle(milestone.layer)}>
    <CourseCrumb current={`${milestone.id} · ${milestone.title}`}/>
    <header className="t2-head">
      <div className="t2-head-copy">
        <span className="ll-kicker">Lớp {milestone.layer} · {courseLayers.find((layer) => layer.id === milestone.layer)?.name} · {milestone.id}</span>
        <h1>{milestone.title}</h1>
        <p>{withTerms(milestone.overview)}</p>
      </div>
    </header>

    <ol className={`ll-stepper t2-stepper ${steps.length === 2 ? "is-two" : "is-three"}`} aria-label="Các bước học">{steps.map((item, i) => <li key={item.id} className={item.pass ? "is-pass" : ""}>
      <button type="button" aria-current={step === item.id ? "step" : undefined} onClick={() => go(item.id)}>
        <span className="ll-step-dot">{item.pass && step !== item.id ? <Check size={15} strokeWidth={3}/> : i + 1}</span>
        <span className="ll-step-text"><b>{item.label}</b><small>{item.hint}</small></span>
        {item.score && <span className="ll-step-score">{item.score}</span>}
      </button>
    </li>)}</ol>

    <div className="t2-layout">
      <div className="t2-main">
        {step === "learn" && <>
          <UnitList units={milestone.units}/>
          {milestone.sections.length > 0 && <SectionList sections={milestone.sections}/>}
          <div className="t2-next"><button type="button" className="ll-btn ll-btn-primary" onClick={() => go(milestone.examples.length ? "examples" : "practice")}>{milestone.examples.length ? "Xem ví dụ mẫu" : "Bắt đầu luyện tập"} <ArrowRight size={16}/></button></div>
        </>}
        {step === "examples" && <ExampleViewer examples={milestone.examples} onDone={() => go("practice")}/>}
        {step === "practice" && <PracticeArea module={milestone} attempts={attempts} peeks={peeks}
          onSaved={(practiceId, attempt) => setAttempts((current) => ({ ...current, [practiceId]: attempt }))}
          onPeek={(practiceId) => setPeeks(addPeek(milestone.id, practiceId))} nextModule={nextModule}/>}
      </div>
      <ModuleDesk module={milestone}/>
    </div>
    <p className="ll-footnote">Học liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Gợi ý mẫu là một cách làm đúng, không phải đáp án duy nhất; tiến độ không quy đổi sang band.</p>
  </div>;
}

function CourseCrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={TASK2_BASE}>Writing Task 2 Lab</Link><span aria-hidden="true">›</span><Link href={TASK2_BASE}>Khoá kỹ năng</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}

function ModuleDesk({ module }: { module: CourseModule }) {
  const tabs = ([["goals", "Mục tiêu"], ["check", "Tự kiểm"], ["notes", "Lưu ý"]] as const).filter(([key]) =>
    key === "goals" ? module.stage_targets.length || module.prerequisites.length : key === "check" ? module.self_check.length : module.notes.length);
  const [tab, setTab] = useState<string>(tabs[0]?.[0] ?? "goals");
  const [open, setOpen] = useState(false);
  if (!tabs.length) return <aside className="t2-desk is-empty" aria-hidden="true"/>;
  return <aside className={`t2-desk ${open ? "is-open" : ""}`} aria-label="Mục tiêu và tự kiểm tra">
    <button type="button" className="t2-desk-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Target size={16}/><span><b>Mục tiêu & tự kiểm</b><small>{module.title}</small></span><ChevronDown size={16}/>
    </button>
    <div className="t2-desk-body">
      <div className="t2-tabs" role="tablist">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === "goals" && <div className="t2-desk-pane">
        {module.stage_targets.length > 0 && <dl className="t2-desk-facts">{module.stage_targets.map((row) => <div key={row.stage}><dt>{row.stage}</dt><dd>{withTerms(row.text)}</dd></div>)}</dl>}
        {module.prerequisites.length > 0 && <><p className="t2-desk-label">Nên học trước</p><ul className="t2-bullets">{module.prerequisites.map((item) => <li key={item}>{withTerms(item)}</li>)}</ul></>}
      </div>}
      {tab === "check" && <div className="t2-desk-pane"><ul className="t2-bullets is-check">{module.self_check.map((item) => <li key={item}>{withTerms(item)}</li>)}</ul></div>}
      {tab === "notes" && <div className="t2-desk-pane"><ul className="t2-bullets">{module.notes.map((item) => <li key={item}>{withTerms(item)}</li>)}</ul></div>}
    </div>
  </aside>;
}

/* ───────────── Teaching ───────────── */

export function FieldRows({ fields }: { fields: CourseField[] }) {
  if (!fields.length) return null;
  return <dl className="t2-fields">{fields.map((field, i) => <div key={i}>
    {field.label && <dt>{field.label}</dt>}
    <dd>
      {field.en && <span lang="en" className="t2-en">{field.en}</span>}
      {field.vi && <span>{withTerms(field.vi)}</span>}
      {field.list && <ul>{field.list.map((item, j) => <li key={j}>{withTerms(item)}</li>)}</ul>}
    </dd>
  </div>)}</dl>;
}

function UnitList({ units }: { units: CourseUnit[] }) {
  const [open, setOpen] = useState(units[0]?.id ?? "");
  if (!units.length) return null;
  return <section className="t2-panel">
    <span className="ll-kicker">Bước 1 · Bài giảng</span>
    <h2>{units.length} bài cần nắm</h2>
    <ol className="t2-units">{units.map((unit, i) => {
      const isOpen = open === unit.id;
      return <li key={`${unit.id}-${i}`} className={isOpen ? "is-open" : ""}>
        <button type="button" className="t2-unit-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : unit.id)}>
          <span className="t2-step-num">{i + 1}</span><span><b>{withTerms(unit.title)}</b>{unit.goal && <small>{unit.goal}</small>}</span><ChevronDown size={16}/>
        </button>
        {isOpen && <div className="t2-unit-body">
          {unit.steps.length > 0 && <ol className="t2-unit-steps">{unit.steps.map((stepText, j) => <li key={j}>{withTerms(stepText)}</li>)}</ol>}
          {(unit.principle_en || unit.principle_vi) && <p className="t2-frame-show"><span>Nguyên tắc</span>{unit.principle_en && <code lang="en">{unit.principle_en}</code>}{unit.principle_vi && unit.principle_vi !== unit.goal && <em>{unit.principle_vi}</em>}</p>}
          {(unit.bad_en || unit.good_en) && <div className="t2-compare"><div>
            {unit.bad_en && <p className="is-bad" lang="en"><b>Chưa tốt</b>{unit.bad_en}</p>}
            {unit.good_en && <p className="is-good" lang="en"><b>Tốt hơn</b>{unit.good_en}</p>}
            {unit.why && <small>{withTerms(unit.why)}</small>}
          </div></div>}
          {!unit.bad_en && !unit.good_en && unit.why && <p className="t2-why"><b>Vì sao:</b> {withTerms(unit.why)}</p>}
          {unit.example_en && <blockquote className="t2-quote" lang="en">{unit.example_en}{unit.example_vi && <small lang="vi">{unit.example_vi}</small>}</blockquote>}
          <FieldRows fields={unit.fields}/>
          {unit.next && <p className="t2-target"><Lightbulb size={15}/><span>{withTerms(unit.next)}</span></p>}
          {i < units.length - 1 && <div className="t2-next"><button type="button" className="ll-btn" onClick={() => setOpen(units[i + 1].id)}>Bài tiếp <ArrowRight size={15}/></button></div>}
        </div>}
      </li>;
    })}</ol>
  </section>;
}

function SectionList({ sections }: { sections: CourseSection[] }) {
  const [open, setOpen] = useState("");
  return <section className="t2-panel">
    <span className="ll-kicker">Tài liệu tra cứu</span>
    <h2>Bảng tra nhanh</h2>
    <ul className="t2-sections">{sections.map((section, i) => {
      const key = `${section.id}-${i}`;
      const isOpen = open === key;
      return <li key={key} className={isOpen ? "is-open" : ""}>
        <button type="button" className="t2-unit-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : key)}>
          <Layers size={16}/><span><b>{section.title}</b><small>{section.list ? `${section.list.length} mục` : `${section.cards.length} mục`}</small></span><ChevronDown size={16}/>
        </button>
        {isOpen && <div className="t2-unit-body">
          {section.list && <ul className="t2-bullets">{section.list.map((item, j) => <li key={j}>{withTerms(item)}</li>)}</ul>}
          {section.cards.length > 0 && <div className="t2-cards">{section.cards.map((card, j) => <article key={j}>{card.title && <b>{withTerms(card.title)}</b>}<FieldRows fields={card.fields}/></article>)}</div>}
        </div>}
      </li>;
    })}</ul>
  </section>;
}

/* ───────────── Worked examples ───────────── */

function ExampleViewer({ examples, onDone }: { examples: CourseExample[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [vi, setVi] = useState(false);
  const example = examples[index];
  if (!example) return null;
  return <>
    <div className="t2-drill-pills" role="tablist" aria-label="Các ví dụ">{examples.map((item, i) => <button key={item.id} type="button" role="tab" aria-selected={i === index} title={item.title} onClick={() => setIndex(i)}>{i + 1}</button>)}<small>Ví dụ {index + 1}/{examples.length}</small></div>
    <article className="t2-drill-card">
      <header className="t2-drill-head">
        <span className="t2-level is-recognize">Ví dụ mẫu</span>
        {example.question_type && <span className="t2-drill-kind">{typeLabel(example.question_type)}</span>}
        {example.word_count && <span className="t2-drill-kind">{example.word_count} từ</span>}
        {(example.main_vi || example.prompt_vi) && <button type="button" className="t2-link-btn t2-head-link" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}
      </header>
      <h2 className="t2-drill-q">{withTerms(example.title)}</h2>
      {example.prompt_en && <div className="t2-prompt-box"><span className="ll-kicker">Đề</span><p lang="en">{example.prompt_en}</p>{vi && example.prompt_vi && <p className="t2-vi">{example.prompt_vi}</p>}</div>}
      {example.main_en && <div className="t2-example-text" lang="en">{example.main_en.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>}
      {vi && example.main_vi && <div className="t2-vi">{example.main_vi.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>}
      {example.steps.length > 0 && <ol className="t2-notes is-steps">{example.steps.map((stepItem, i) => <li key={i}><span className="t2-note-n">{i + 1}</span><div><b>{stepItem.label}</b><p lang="en">{stepItem.en}</p>{stepItem.note && <p>{withTerms(stepItem.note)}</p>}</div></li>)}</ol>}
      <FieldRows fields={example.fields}/>
      <nav className="t2-drill-nav" aria-label="Chuyển ví dụ">
        {index > 0 ? <button type="button" className="ll-btn" onClick={() => setIndex(index - 1)}><ArrowLeft size={15}/> Ví dụ trước</button> : <span/>}
        {index < examples.length - 1
          ? <button type="button" className="ll-btn ll-btn-primary" onClick={() => setIndex(index + 1)}>Ví dụ tiếp <ArrowRight size={15}/></button>
          : <button type="button" className="ll-btn ll-btn-primary" onClick={onDone}>Bắt đầu luyện tập <ArrowRight size={15}/></button>}
      </nav>
    </article>
  </>;
}

/* ───────────── Practice ───────────── */

type PracticeProps = {
  module: CourseModule; attempts: Record<string, CourseAttempt>; peeks: string[]; nextModule?: string;
  onSaved: (id: string, attempt: CourseAttempt) => void; onPeek: (id: string) => void;
};

function PracticeArea({ module, attempts, peeks, nextModule, onSaved, onPeek }: PracticeProps) {
  const groups = useMemo(() => [...new Set(module.practice.map((item) => item.group))], [module]);
  const stages = useMemo(() => ["foundation", "basic", "developing", "advanced"].filter((stage) => module.practice.some((item) => item.stage === stage)), [module]);
  const [group, setGroup] = useState(groups[0] ?? "");
  const [stage, setStage] = useState(() => {
    try { const saved = localStorage.getItem("writing-task2-level"); if (saved && stages.includes(saved)) return saved; } catch { /* default below */ }
    return stages[0] ?? "";
  });
  const inGroup = module.practice.filter((item) => groups.length < 2 || item.group === group);
  const groupStages = stages.filter((name) => inGroup.some((item) => item.stage === name));
  const activeStage = groupStages.includes(stage) ? stage : groupStages[0] ?? "";
  const list = groupStages.length > 1 ? inGroup.filter((item) => item.stage === activeStage) : inGroup;
  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((item) => !attemptDone(attempts[item.id]))));
  const current = list[Math.min(index, Math.max(0, list.length - 1))];
  const [answers, setAnswers] = useState<Record<string, CourseAnswer>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function pick(nextGroup: string, nextStage: string) { setGroup(nextGroup); setStage(nextStage); setIndex(0); setError(""); }

  async function save(item: CoursePractice, text: string, choice?: string) {
    const attempt: CourseAttempt = { c: 1, text, ...(choice && { choice }), savedAt: new Date().toISOString() };
    setBusy(item.id); setError("");
    try {
      await saveCourseAttempt(module.id, item.id, attempt).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Chưa lưu được vào tài khoản."));
      onSaved(item.id, attempt);
      if (item.reference) { const answer = await revealCourse(module.id, item.id, attempt); setAnswers((previous) => ({ ...previous, [item.id]: answer })); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa mở được gợi ý."); }
    finally { setBusy(""); }
  }
  async function peek(item: CoursePractice) {
    setBusy(item.id); setError("");
    try { const answer = await revealCourse(module.id, item.id); setAnswers((previous) => ({ ...previous, [item.id]: answer })); if (!attemptDone(attempts[item.id])) onPeek(item.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa mở được gợi ý."); }
    finally { setBusy(""); }
  }

  // Reopen references for items already done when the learner comes back to them.
  useEffect(() => {
    if (!current || answers[current.id] || !current.reference) return;
    const attempt = attempts[current.id];
    if (!attemptDone(attempt) && !peeks.includes(current.id)) return;
    let alive = true;
    void revealCourse(module.id, current.id, attempt).then((answer) => { if (alive) setAnswers((previous) => ({ ...previous, [current.id]: answer })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [current, attempts, peeks, answers, module.id]);

  return <>
    {(groups.length > 1 || groupStages.length > 1) && <div className="t2-filters">
      {groups.length > 1 && <div role="group" aria-label="Loại bài">{groups.map((name) => <button key={name} type="button" aria-pressed={group === name} onClick={() => pick(name, stage)}>{name}<small>{module.practice.filter((item) => item.group === name).length}</small></button>)}</div>}
      {groupStages.length > 1 && <div role="group" aria-label="Chặng">{groupStages.map((name) => <button key={name} type="button" aria-pressed={activeStage === name} onClick={() => pick(group, name)}>{courseStageLabels[name]}</button>)}</div>}
    </div>}
    {error && <p className="ll-error" role="alert">{error}</p>}
    {!current ? <p className="t2-soft">Chưa có câu luyện cho lựa chọn này.</p> : <>
      <div className="t2-drill-pills" role="tablist" aria-label="Các câu luyện">
        {list.map((item, i) => {
          const done = attemptDone(attempts[item.id]);
          const peeked = !done && peeks.includes(item.id);
          return <button key={item.id} type="button" role="tab" aria-selected={item.id === current.id} className={`${done ? "is-done" : ""} ${peeked ? "is-peeked" : ""}`} title={item.id} onClick={() => setIndex(i)}>{done ? <Check size={13} strokeWidth={3}/> : i + 1}</button>;
        })}
        <small>{list.filter((item) => attemptDone(attempts[item.id])).length}/{list.length} câu đã làm</small>
      </div>
      <PracticeCard key={current.id} item={current} index={list.indexOf(current)} attempt={attempts[current.id]} answer={answers[current.id]} peeked={peeks.includes(current.id)} busy={busy === current.id}
        onSave={(text, choice) => void save(current, text, choice)} onPeek={() => void peek(current)}
        onPrev={list.indexOf(current) > 0 ? () => setIndex(list.indexOf(current) - 1) : undefined}
        onNext={list.indexOf(current) < list.length - 1 ? () => setIndex(list.indexOf(current) + 1) : undefined}/>
      {list.indexOf(current) === list.length - 1 && nextModule && <Link className="t2-next-lesson" href={`${COURSE_BASE}/${nextModule}`}><span><small>Chặng tiếp theo</small><b>{nextModule}</b></span><ArrowRight size={18}/></Link>}
    </>}
  </>;
}

type CardProps = {
  item: CoursePractice; index: number; attempt?: CourseAttempt; answer?: CourseAnswer; peeked: boolean; busy: boolean;
  onSave: (text: string, choice?: string) => void; onPeek: () => void; onPrev?: () => void; onNext?: () => void;
};

function PracticeCard({ item, index, attempt, answer, peeked, busy, onSave, onPeek, onPrev, onNext }: CardProps) {
  const [text, setText] = useState(attempt?.text ?? "");
  const [choice, setChoice] = useState(attempt?.choice ?? "");
  const [shown, setShown] = useState(0);
  const [vi, setVi] = useState(false);
  const done = attemptDone(attempt);
  const words = countWords(text);
  const essay = Boolean(item.min_words || (item.time_limit && item.time_limit >= 20));
  const ready = Boolean(choice) || text.trim().length >= 3;
  const right = item.options && answer?.correct && choice ? answer.correct === choice : undefined;

  function keys(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && ready && !busy) { event.preventDefault(); onSave(text, choice || undefined); }
  }

  return <article className={`t2-drill-card ${done ? "is-saved" : ""}`} onKeyDown={keys} aria-labelledby={`${item.id}-task`}>
    <header className="t2-drill-head">
      <span className="t2-level is-produce">{item.group}</span>
      {item.stage && <span className="t2-drill-kind">{courseStageLabels[item.stage] ?? item.stage}</span>}
      {item.question_type && <span className="t2-drill-kind">{typeLabel(item.question_type)}</span>}
      {done && <span className="t2-state is-done"><Check size={13} strokeWidth={3}/> Đã làm</span>}
      {peeked && !done && <span className="t2-state is-peeked"><Eye size={13}/> Đã xem gợi ý</span>}
    </header>
    <h2 id={`${item.id}-task`} className="t2-drill-q"><span>Câu {index + 1}.</span> {withTerms(item.task)}</h2>

    {item.prompt_en && <div className="t2-prompt-box">
      <div className="t2-panel-head"><span className="ll-kicker">Đề</span>{item.prompt_vi && <button type="button" className="t2-link-btn" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}</div>
      <p lang="en">{item.prompt_en}</p>
      {vi && item.prompt_vi && <p className="t2-vi">{item.prompt_vi}</p>}
    </div>}
    {item.stimulus.map((field) => <blockquote key={field.label} className="t2-quote is-stimulus"><b>{field.label}</b><span lang="en">{field.en}</span></blockquote>)}
    {(item.length || item.time_limit || item.min_words) && <div className="ll-chips t2-practice-chips">
      {item.length && <span><Target size={12}/> {item.length}</span>}
      {item.min_words && <span>Tối thiểu {item.min_words} từ</span>}
      {item.time_limit && <span><Clock3 size={12}/> {item.time_limit} phút</span>}
    </div>}
    {item.fields.length > 0 && <details className="t2-more"><summary>Thông tin thêm về đề</summary><FieldRows fields={item.fields}/></details>}

    {item.options && <div className="ll-options t2-options" role="radiogroup" aria-labelledby={`${item.id}-task`}>{item.options.map((option, i) => {
      const cls = answer?.correct && choice ? (option.id === answer.correct ? "is-key" : option.id === choice ? "is-picked-wrong" : "") : option.id === choice ? "is-picked" : "";
      return <label key={option.id} className={cls}><input type="radio" name={item.id} checked={choice === option.id} onChange={() => setChoice(option.id)}/><b>{String.fromCharCode(65 + i)}</b><span lang="en">{option.text}</span></label>;
    })}</div>}

    <div className="t2-write">
      {item.time_limit && essay && <EssayTimer minutes={item.time_limit}/>}
      <textarea className="t2-text" rows={essay ? 12 : item.options ? 2 : 4} value={text} aria-label={`Bài làm câu ${index + 1}`}
        placeholder={item.options ? "Giải thích ngắn vì sao bạn chọn (không bắt buộc)…" : essay ? "Viết bài của bạn ở đây…" : "Viết câu trả lời của bạn…"}
        onChange={(event) => setText(event.target.value)}/>
      <div className="t2-write-tools"><span/><small>{words} từ{item.min_words ? ` / ${item.min_words}` : ""} · Ctrl+Enter để lưu</small></div>
    </div>

    {shown > 0 && <ol className="t2-hints">{item.hints.slice(0, shown).map((hint, i) => <li key={i}><b>Gợi ý {i + 1}</b><span>{withTerms(hint)}</span></li>)}</ol>}

    <div className="t2-drill-actions">
      {shown < item.hints.length && <button type="button" className="ll-btn" onClick={() => setShown(shown + 1)}><Lightbulb size={15}/> Gợi ý {shown + 1}/{item.hints.length}</button>}
      {item.reference && item.peek && !answer && <button type="button" className="ll-btn" disabled={busy} onClick={onPeek}><Eye size={15}/> Xem gợi ý mẫu</button>}
      <button type="button" className="ll-btn ll-btn-primary" disabled={!ready || busy} onClick={() => onSave(text, choice || undefined)}>
        <Save size={15}/>{busy ? "Đang lưu…" : done ? "Lưu lại" : item.reference ? "Lưu & xem gợi ý" : "Lưu bài"}
      </button>
    </div>

    {answer && <section className={`t2-answer-panel ${right === true ? "is-right" : right === false ? "is-wrong" : ""}`} aria-live="polite">
      {right !== undefined && <p className="t2-verdict">{right ? <><Check size={16} strokeWidth={3}/> Chính xác!</> : <><X size={16} strokeWidth={3}/> Chưa đúng. Đáp án đúng được tô xanh.</>}</p>}
      {answer.model_en && <div className="t2-model-answer"><span className="ll-kicker">Gợi ý mẫu</span><p lang="en">{answer.model_en}</p>{answer.model_vi && <p className="t2-vi">{answer.model_vi}</p>}</div>}
      <FieldRows fields={answer.fields}/>
      {!done && <p className="t2-retry">Bạn vừa xem gợi ý. Giờ hãy tự viết lại bằng lời của bạn rồi bấm lưu; đừng chép nguyên câu.</p>}
    </section>}

    {item.self_check.length > 0 && (done || answer || !item.reference) && <div className="t2-selfcheck">
      <b><ListChecks size={15}/> Tự rà lại bài</b>
      <ul>{item.self_check.map((check) => <li key={check}><label><input type="checkbox"/> <span>{withTerms(check)}</span></label></li>)}</ul>
    </div>}

    <nav className="t2-drill-nav" aria-label="Chuyển câu">
      {onPrev ? <button type="button" className="ll-btn" onClick={onPrev}><ArrowLeft size={15}/> Câu trước</button> : <span/>}
      {onNext && <button type="button" className={`ll-btn ${done || answer ? "ll-btn-primary" : ""}`} onClick={onNext}>Câu tiếp <ArrowRight size={15}/></button>}
    </nav>
  </article>;
}

function EssayTimer({ minutes }: { minutes: number }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (!endsAt) return <button type="button" className="t2-chip-btn t2-timer-start" onClick={() => { const start = Date.now(); setNow(start); setEndsAt(start + minutes * 60_000); }}><Timer size={13}/> Bắt đầu tính giờ {minutes} phút</button>;
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  return <p className={`t2-timer ${left === 0 ? "is-over" : left < 300 ? "is-low" : ""}`} role="timer"><Timer size={14}/> {left === 0 ? "Hết giờ. Lưu bài rồi tự rà theo bảng." : `Còn ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</p>;
}
