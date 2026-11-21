"use client";
/*
 * The shared self-study template: one path map per Lab, one five-step frame per lesson, one end-of-lesson card.
 * Every Lab feeds it a PathCourse + PathProgress (see src/lib/self-study-path/path.ts) so learners meet the same
 * order, the same unlock rules and the same single "Học tiếp" button wherever they study.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Flame, Lock, Play, RotateCcw, Trophy, X } from "lucide-react";
import { PASS_MARK, STEP_COUNT, STEP_SLOTS, type PathCourse, type PathNode, type PathView, type StageView } from "@/lib/self-study-path/path";
import "./study-path.css";

type Href = (node: PathNode) => string | undefined;

const nodeIcon = (node: PathNode) => {
  if (node.status === "locked") return <Lock size={20} aria-hidden />;
  if (node.kind === "review") return <RotateCcw size={22} aria-hidden />;
  if (node.kind === "checkpoint") return <Trophy size={22} aria-hidden />;
  if (node.status === "done") return <Check size={24} strokeWidth={3} aria-hidden />;
  return <Play size={22} aria-hidden />;
};

function nodeNote(node: PathNode, steps: number) {
  if (node.kind === "review") return node.status === "open" ? `${node.mistakes} câu sai đang chờ · không bắt buộc` : "Chưa có câu sai để ôn";
  if (node.kind === "checkpoint") {
    if (node.status === "done") return `Đã qua · ${Math.round((node.score ?? 0) * 100)}%`;
    if (node.status === "current") return typeof node.score === "number" ? `Lần trước ${Math.round(node.score * 100)}% · cần ${PASS_MARK * 100}%` : `Đạt ${PASS_MARK * 100}% để mở chặng sau`;
    return `Xong mọi bài của chặng để mở · đạt ${PASS_MARK * 100}%`;
  }
  const progress = node.progress;
  if (node.status === "done" && progress?.note) return `Đã xong · ${progress.note}`;
  if (node.status === "done") return progress?.total ? `Đúng ${progress.right ?? 0}/${progress.total}${progress.mistakes ? ` · ${progress.mistakes} câu sai` : ""}` : "Đã xong";
  if (node.status === "current" && progress?.note) return `Đang học · ${progress.note}`;
  if (node.status === "current") return progress?.step ? `Đang học · bước ${progress.step + 1}/${steps}` : "Bài tiếp theo";
  return node.lesson?.meta ?? "";
}

/* ───────────── Screen 1 · the path map ───────────── */

export function StudyPath({ course, view, href, streak = 0, target, top, intro, children }: {
  course: PathCourse; view: PathView; href?: Href; streak?: number; target?: string;
  /** Above the header, e.g. a Lab's own tabs. */ top?: ReactNode;
  /** Between the header and the stages, e.g. a first-visit guide. */ intro?: ReactNode;
  children?: ReactNode;
}) {
  const resolve: Href = href ?? ((node) => node.href);
  const percent = view.total ? Math.round((view.done / view.total) * 100) : 0;
  const next = view.next;
  const current = next?.stage ?? view.stages[view.stages.length - 1];

  return (
    <div className="sp-page">
      {top}
      <header className="sp-head">
        <div className="sp-head-top">
          <div>
            <span className="sp-kicker">Tự học · {course.name}{target ? ` · mục tiêu band ${target}` : ""}</span>
            <h1>{next ? <>Chặng {current.index + 1} · {current.stage.title}</> : "Đã xong toàn bộ lộ trình"}</h1>
          </div>
          <div className="sp-pills">
            {streak > 0 && <span className="sp-pill sp-pill-sun"><Flame size={14} aria-hidden /> {streak} ngày liên tiếp</span>}
            <span className="sp-pill sp-pill-good">{view.done}/{view.total} bài</span>
          </div>
        </div>
        <div className="sp-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ lộ trình"><span style={{ width: `${percent}%` }} /></div>
        {next && <ContinueCard node={next.node} href={resolve(next.node)} steps={course.stepCount ?? STEP_COUNT} />}
      </header>
      {intro}

      <ol className="sp-stages">
        {view.stages.map((stage) => <StageBlock key={stage.stage.id} stage={stage} href={resolve} isNext={stage.index === next?.stage.index} steps={course.stepCount ?? STEP_COUNT} />)}
      </ol>
      {children}
    </div>
  );
}

function ContinueCard({ node, href, steps }: { node: PathNode; href?: string; steps: number }) {
  const isCheck = node.kind === "checkpoint";
  const minutes = node.lesson?.minutes;
  const step = node.progress?.step;
  const note = node.progress?.note;
  return (
    <div className="sp-continue">
      <div className="sp-continue-copy">
        <span>{isCheck ? "Mốc cuối chặng" : note ? `Học tiếp · ${note}` : step ? `Học tiếp từ bước ${step + 1}/${steps}` : "Bài tiếp theo"}{minutes ? <> · <Clock3 size={13} aria-hidden /> {minutes} phút</> : null}</span>
        <b>{isCheck || !node.number ? node.title : `Bài ${node.number} · ${node.title}`}</b>
        {node.lesson?.meta && <small>{node.lesson.meta}</small>}
      </div>
      {href && <Link className="sp-btn sp-btn-primary" href={href}>{isCheck ? "Làm bài kiểm tra" : "Học tiếp"} <ArrowRight size={16} aria-hidden /></Link>}
    </div>
  );
}

const OFFSETS = [0, 1, 2, 1];

function StageBlock({ stage, href, isNext, steps }: { stage: StageView; href: Href; isNext: boolean; steps: number }) {
  // Only the stage holding the next step starts open; finished stages and stages opened out of order fold.
  const [open, setOpen] = useState(isNext);
  const title = <>Chặng {stage.index + 1} · {stage.stage.title}{stage.stage.band ? <em> · band {stage.stage.band}</em> : null}</>;

  if (stage.status === "locked") {
    return <li className="sp-stage is-locked"><div className="sp-stage-row"><Lock size={16} aria-hidden /><span>{title}</span><small>{stage.total} bài</small></div></li>;
  }

  return (
    <li className={`sp-stage is-${stage.status}`}>
      {!isNext
        ? <button type="button" className="sp-stage-row" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{stage.status === "done" ? <Check size={16} aria-hidden /> : <Play size={16} aria-hidden />}<span>{title}</span><small>{stage.status === "done" ? "Đã xong" : `${stage.done}/${stage.total} bài`} · {open ? "thu gọn" : stage.status === "done" ? "mở lại để ôn" : "xem bài"}</small><ChevronDown size={16} aria-hidden className={open ? "is-flipped" : ""} /></button>
        : <div className="sp-stage-title"><h2>{title}</h2><small>{stage.done}/{stage.total} bài{stage.stage.about ? ` · ${stage.stage.about}` : ""}</small></div>}
      {open && <StageNodes stage={stage} href={href} steps={steps} />}
    </li>
  );
}

/** Lessons kept in view around the current one; the rest fold into one row so a long stage stays short. */
const KEEP_BEFORE = 2;
const KEEP_AFTER = 2;

function StageNodes({ stage, href, steps }: { stage: StageView; href: Href; steps: number }) {
  const [all, setAll] = useState(false);
  const lessons = stage.nodes.filter((node) => node.kind === "lesson");
  const extras = stage.nodes.filter((node) => node.kind !== "lesson");
  const at = lessons.findIndex((node) => node.status === "current");
  const pivot = at === -1 ? lessons.length - 1 : at;
  const from = all ? 0 : Math.max(0, pivot - KEEP_BEFORE);
  const to = all ? lessons.length : Math.min(lessons.length, pivot + KEEP_AFTER + 1);
  const fold = (key: string, label: string) => (
    <li key={key} className="sp-fold"><button type="button" onClick={() => setAll(true)}><ChevronDown size={15} aria-hidden /> {label}</button></li>
  );
  const step = (node: PathNode, index: number) => <PathStep key={node.id} node={node} href={href(node)} offset={OFFSETS[index % OFFSETS.length]} steps={steps} />;
  const visible = lessons.slice(from, to);
  return (
    <ol className="sp-path">
      {from > 0 && fold("before", `${from} bài đã xong · xem lại`)}
      {visible.map(step)}
      {lessons.length > to && fold("after", `Còn ${lessons.length - to} bài nữa trong chặng`)}
      {extras.map((node, index) => step(node, visible.length + index))}
      {all && lessons.length > KEEP_BEFORE + KEEP_AFTER + 1 && <li className="sp-fold"><button type="button" onClick={() => setAll(false)}><ChevronDown size={15} aria-hidden className="is-flipped" /> Thu gọn</button></li>}
    </ol>
  );
}

function PathStep({ node, href, offset, steps }: { node: PathNode; href?: string; offset: number; steps: number }) {
  const label = node.kind === "lesson" && node.number ? `Bài ${node.number} · ${node.title}` : node.title;
  const body = <>
    <span className="sp-node" aria-hidden>{nodeIcon(node)}</span>
    <span className="sp-node-copy"><b>{label}</b><small>{nodeNote(node, steps)}</small></span>
  </>;
  const className = `sp-step kind-${node.kind} is-${node.status}`;
  return (
    <li className={className} style={{ ["--sp-offset" as string]: offset }}>
      {href && node.status !== "locked" ? <Link href={href} aria-current={node.status === "current" ? "step" : undefined}>{body}</Link> : <div aria-disabled="true">{body}</div>}
    </li>
  );
}

/* ───────────── Screen 2 · the lesson frame ───────────── */

/** Top of every lesson: leave to the path, how far along, which lesson. */
export function LessonTopBar({ exitHref, step, count = STEP_COUNT, title }: { exitHref: string; step: number; count?: number; title: ReactNode }) {
  return <>
    <div className="sp-lesson-top">
      <Link className="sp-icon-btn" href={exitHref} aria-label="Về lộ trình"><X size={20} aria-hidden /></Link>
      <div className="sp-bar" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={count} aria-label="Bước trong bài"><span style={{ width: `${((step + 1) / count) * 100}%` }} /></div>
      <span className="sp-count">{step + 1}/{count}</span>
    </div>
    <p className="sp-lesson-name">{title}</p>
  </>;
}

export type LessonStepItem = { label: string; note?: string; pass?: boolean };

/** The five steps in a row. Steps past the furthest one reached stay closed so the lesson is done in order. */
export function LessonSteps({ steps, step, reached, onPick }: { steps: LessonStepItem[]; step: number; reached: number; onPick: (step: number) => void }) {
  return (
    <ol className="sp-steps" aria-label="Các bước học">
      {steps.map((item, index) => {
        const state = index === step ? "current" : item.pass || index < step ? "done" : index <= reached ? "open" : "locked";
        return (
          <li key={item.label} className={`is-${state}`}>
            <button type="button" disabled={state === "locked"} onClick={() => onPick(index)} aria-current={state === "current" ? "step" : undefined} title={state === "locked" ? "Làm xong các bước trước để mở" : undefined}>
              <span className="sp-step-dot">{state === "done" ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}</span>
              <span className="sp-step-label">{item.label}</span>
              {item.note && <small>{item.note}</small>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** One way forward. Left-aligned: the floating companion and chat buttons sit at the bottom right. */
export function LessonFoot({ step, labels, onStep, last }: { step: number; labels: readonly string[]; onStep: (step: number) => void; last?: ReactNode }) {
  const final = step >= labels.length - 1;
  return (
    <nav className="sp-lesson-foot" aria-label="Chuyển bước">
      {final ? last : <button type="button" className="sp-btn sp-btn-primary" onClick={() => onStep(step + 1)}>Tiếp: {labels[step + 1]} <ArrowRight size={16} aria-hidden /></button>}
      {step > 0 && <button type="button" className="sp-btn sp-btn-ghost" onClick={() => onStep(step - 1)}><ArrowLeft size={16} aria-hidden /> Quay lại</button>}
    </nav>
  );
}

/** The whole frame with generic step names, for Labs that have no layout of their own yet. */
export function LessonFrame({ course, lessonTitle, number, step, reached, exitHref, onStep, onFinish, children }: {
  course: PathCourse; lessonTitle: string; number?: number; step: number; reached: number; exitHref: string;
  onStep: (step: number) => void; onFinish: () => void; children: ReactNode;
}) {
  return (
    <div className="sp-page sp-lesson">
      <LessonTopBar exitHref={exitHref} step={step} title={<>{course.name} · {number ? `Bài ${number} · ` : ""}{lessonTitle}</>} />
      <LessonSteps steps={STEP_SLOTS.map((label) => ({ label }))} step={step} reached={reached} onPick={onStep} />
      <section className="sp-lesson-body" aria-live="polite">
        <span className="sp-kicker">Bước {step + 1} · {STEP_SLOTS[step]}</span>
        {children}
      </section>
      <LessonFoot step={step} labels={STEP_SLOTS} onStep={onStep} last={<button type="button" className="sp-btn sp-btn-primary" onClick={onFinish}>Nộp bài <Check size={16} aria-hidden /></button>} />
    </div>
  );
}

/** Shown instead of a lesson the path has not reached yet: one way back into the order. */
export function LessonLocked({ title, nextTitle, nextHref, pathHref }: { title: string; nextTitle?: string; nextHref?: string; pathHref: string }) {
  return (
    <div className="sp-page sp-done">
      <div className="sp-done-card">
        <span className="sp-done-badge is-locked"><Lock size={26} aria-hidden /></span>
        <h1>{title}</h1>
        <p className="sp-done-note">Bài này chưa tới lượt. Lộ trình mở từng bài theo thứ tự để bạn học chắc phần trước rồi mới sang phần sau.</p>
        <div className="sp-done-actions">
          {nextHref && <Link className="sp-btn sp-btn-primary" href={nextHref}>Học {nextTitle || "bài đang tới lượt"} <ArrowRight size={16} aria-hidden /></Link>}
          <Link className="sp-btn sp-btn-ghost" href={pathHref}>Về lộ trình</Link>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Screen 3 · end of lesson ───────────── */

export function LessonDone({ title, stats, note, nextLabel, nextHref, pathHref, reviewHref, embedded = false, children }: {
  title: string; stats: { label: string; value: string }[]; note?: string;
  nextLabel?: string; nextHref?: string; pathHref: string; reviewHref?: string; embedded?: boolean; children?: ReactNode;
}) {
  const card = (
    <div className="sp-done-card">
      <span className="sp-done-badge"><Check size={28} strokeWidth={3} aria-hidden /></span>
      {embedded ? <h2>{title}</h2> : <h1>{title}</h1>}
      <dl className="sp-stats">{stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
      {note && <p className="sp-done-note">{note}</p>}
      <div className="sp-done-actions">
        {nextHref ? <Link className="sp-btn sp-btn-primary" href={nextHref}>{nextLabel ?? "Bài tiếp theo"} <ArrowRight size={16} aria-hidden /></Link> : null}
        {reviewHref && <Link className="sp-btn" href={reviewHref}><RotateCcw size={16} aria-hidden /> Ôn ngay</Link>}
        <Link className="sp-btn sp-btn-ghost" href={pathHref}>Về lộ trình</Link>
      </div>
      {children}
    </div>
  );
  return embedded ? <div className="sp-kit sp-done is-embedded">{card}</div> : <div className="sp-page sp-done">{card}</div>;
}
