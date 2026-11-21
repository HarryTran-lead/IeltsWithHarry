"use client";
/*
 * The shared self-study template: one path map per Lab, one five-step frame per lesson, one end-of-lesson card.
 * Every Lab feeds it a PathCourse + PathProgress (see src/lib/self-study-path/path.ts) so learners meet the same
 * order, the same unlock rules and the same single "Học tiếp" button wherever they study.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Flag, Flame, Info, Lock, Play, RotateCcw, Trophy, X } from "lucide-react";
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

/** Stage colours for Labs that do not give their own. */
const PALETTE = [
  { color: "#0a7f89", soft: "#e2f5f4" }, { color: "#2577c8", soft: "#e6f0fb" }, { color: "#7c66dc", soft: "#f1eefe" }, { color: "#d2524a", soft: "#fdeeec" },
  { color: "#b97d05", soft: "#fff4d9" }, { color: "#4f5fd6", soft: "#ecedfc" }, { color: "#2f7d6d", soft: "#e3f3ee" }, { color: "#10233f", soft: "#e8edf3" },
];
const toneOf = (stage: StageView) => stage.stage.tone ?? PALETTE[stage.index % PALETTE.length];
const toneStyle = (stage: StageView) => ({ "--sp-tone": toneOf(stage).color, "--sp-tone-soft": toneOf(stage).soft }) as CSSProperties;
const stageAnchor = (stage: StageView) => `sp-stage-${stage.index + 1}`;

export function StudyPath({ course, view, href, streak = 0, target, top, intro, children }: {
  course: PathCourse; view: PathView; href?: Href; streak?: number; target?: string;
  /** Above the map and side panel, e.g. a Lab's own tabs. */ top?: ReactNode;
  /** Above the stages, e.g. a first-visit guide or shortcuts. */ intro?: ReactNode;
  children?: ReactNode;
}) {
  const resolve: Href = href ?? ((node) => node.href);
  const percent = view.total ? Math.round((view.done / view.total) * 100) : 0;
  const next = view.next;
  const current = next?.stage ?? view.stages[view.stages.length - 1];
  const steps = course.stepCount ?? STEP_COUNT;

  return (
    <div className="sp-page sp-map-page">
      {top}
      <div className="sp-layout">
        <aside className="sp-side" aria-label="Tiến độ lộ trình">
          <header className="sp-head" style={current ? toneStyle(current) : undefined}>
            <span className="sp-kicker">Tự học · {course.name}{target ? ` · mục tiêu band ${target}` : ""}</span>
            <h1>{next ? <>Chặng {current.index + 1} · {current.stage.title}</> : "Đã xong toàn bộ lộ trình"}</h1>
            <div className="sp-head-stats">
              <span><b>{view.done}/{view.total}</b><small>bài xong</small></span>
              {streak > 0 && <span className="is-sun"><b><Flame size={16} aria-hidden /> {streak}</b><small>ngày liên tiếp</small></span>}
              <span><b>{percent}%</b><small>lộ trình</small></span>
            </div>
            <div className="sp-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ lộ trình"><span style={{ width: `${percent}%` }} /></div>
            {next && <ContinueCard node={next.node} href={resolve(next.node)} steps={steps} />}
          </header>
          <nav className="sp-overview" aria-label="Các chặng">
            <b>Toàn bộ lộ trình</b>
            <ol>{view.stages.map((stage) => <li key={stage.stage.id} className={`is-${stage.status} ${stage.index === next?.stage.index ? "is-here" : ""}`} style={toneStyle(stage)}>
              <a href={`#${stageAnchor(stage)}`}>
                <span className="sp-overview-dot" aria-hidden>{stage.status === "done" ? <Check size={12} strokeWidth={3} /> : stage.status === "locked" ? <Lock size={11} /> : stage.index + 1}</span>
                <span className="sp-overview-name">{stage.stage.title}</span>
                <span className="sp-overview-count">{stage.done}/{stage.total}</span>
                <i aria-hidden><em style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 0}%` }} /></i>
              </a>
            </li>)}</ol>
          </nav>
        </aside>

        <div className="sp-main">
          {intro}
          <ol className="sp-stages">
            {view.stages.map((stage) => <StageBlock key={stage.stage.id} stage={stage} href={resolve} isNext={stage.index === next?.stage.index} steps={steps} />)}
          </ol>
          {children}
        </div>
      </div>
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

function StageBlock({ stage, href, isNext, steps }: { stage: StageView; href: Href; isNext: boolean; steps: number }) {
  // Only the stage holding the next step starts open; finished stages and stages opened out of order fold.
  const [open, setOpen] = useState(isNext);
  const title = <>Chặng {stage.index + 1} · {stage.stage.title}{stage.stage.band ? <em> · band {stage.stage.band}</em> : null}</>;

  if (stage.status === "locked") {
    return <li id={stageAnchor(stage)} className="sp-stage is-locked"><div className="sp-stage-row"><Lock size={16} aria-hidden /><span>{title}</span><small>{stage.total} bài</small></div></li>;
  }

  return (
    <li id={stageAnchor(stage)} className={`sp-stage is-${stage.status} ${isNext ? "is-next" : ""}`} style={toneStyle(stage)}>
      {isNext
        ? <header className="sp-banner">
          <div>
            <small>Chặng {stage.index + 1}{stage.stage.band ? ` · band ${stage.stage.band}` : ""}</small>
            <h2>{stage.stage.title}</h2>
            {stage.stage.about && <p>{stage.stage.about}</p>}
          </div>
          <span className="sp-banner-count"><b>{stage.done}/{stage.total}</b><small>bài xong</small></span>
          <Flag className="sp-banner-art" size={120} strokeWidth={1.2} aria-hidden />
        </header>
        : <button type="button" className="sp-stage-row" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{stage.status === "done" ? <Check size={16} aria-hidden /> : <Play size={16} aria-hidden />}<span>{title}</span><small>{stage.status === "done" ? "Đã xong" : `${stage.done}/${stage.total} bài`} · {open ? "thu gọn" : stage.status === "done" ? "mở lại để ôn" : "xem bài"}</small><ChevronDown size={16} aria-hidden className={open ? "is-flipped" : ""} /></button>}
      {open && <StageRoad stage={stage} href={href} steps={steps} />}
    </li>
  );
}

/* The road: nodes sit on a winding SVG line whose bends are worked out from the width the map really has, so the
 * path fills a wide screen, narrows to a gentle wave on a phone and follows browser zoom. */

/** Lessons kept in view around the current one; the rest fold into one stop on the road. */
const KEEP_BEFORE = 2;
const KEEP_AFTER = 2;
const WIDE = 560;

type Stop = { key: string; kind: "node"; node: PathNode } | { key: string; kind: "fold"; label: string; open: boolean };

function StageRoad({ stage, href, steps }: { stage: StageView; href: Href; steps: number }) {
  const [all, setAll] = useState(false);
  const [width, setWidth] = useState(720);
  const box = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const lessons = stage.nodes.filter((node) => node.kind === "lesson");
  const extras = stage.nodes.filter((node) => node.kind !== "lesson");
  const at = lessons.findIndex((node) => node.status === "current");
  const pivot = at === -1 ? lessons.length - 1 : at;
  const from = all ? 0 : Math.max(0, pivot - KEEP_BEFORE);
  const to = all ? lessons.length : Math.min(lessons.length, pivot + KEEP_AFTER + 1);
  const stops: Stop[] = [
    ...(from > 0 ? [{ key: "before", kind: "fold" as const, label: `${from} bài đã xong · xem lại`, open: false }] : []),
    ...lessons.slice(from, to).map((node) => ({ key: node.id, kind: "node" as const, node })),
    ...(lessons.length > to ? [{ key: "after", kind: "fold" as const, label: `Còn ${lessons.length - to} bài nữa trong chặng`, open: false }] : []),
    ...extras.map((node) => ({ key: node.id, kind: "node" as const, node })),
    ...(all && lessons.length > KEEP_BEFORE + KEEP_AFTER + 1 ? [{ key: "less", kind: "fold" as const, label: "Thu gọn", open: true }] : []),
  ];

  // Wide: the road swings across the middle with labels on the open side. Narrow: a gentle wave on the left, labels right.
  const wide = width >= WIDE;
  const swing = wide ? [0.5, 0.72, 0.5, 0.28] : [0.06, 0.16, 0.06, 0];
  const isCurrent = (stop: Stop) => stop.kind === "node" && stop.node.status === "current";
  const points: { x: number; y: number }[] = [];
  let y = isCurrent(stops[0]) ? 80 : 54;
  stops.forEach((stop, index) => {
    // The current stop carries a bigger card with a button, so the road leaves it more room on both sides.
    if (index) y += (stops[index - 1].kind === "fold" || stop.kind === "fold" ? 74 : wide ? 104 : 92) + (isCurrent(stop) || isCurrent(stops[index - 1]) ? (wide ? 22 : 52) : 0);
    const x = Math.round(Math.max(36, Math.min(width - 36, swing[index % swing.length] * width + (wide ? 0 : 36))));
    points.push({ x, y });
  });
  const height = y + (isCurrent(stops[stops.length - 1]) ? 90 : 64);
  const curve = (list: { x: number; y: number }[]) => list.map((point, index) => {
    if (!index) return `M${point.x},${point.y}`;
    const before = list[index - 1];
    const middle = (before.y + point.y) / 2;
    return `C${before.x},${middle} ${point.x},${middle} ${point.x},${point.y}`;
  }).join(" ");
  const reached = stops.reduce((last, stop, index) => stop.kind === "node" && (stop.node.status === "done" || stop.node.status === "current") ? index : last, -1);

  return (
    <div className="sp-road-wrap">
      <svg className="sp-road" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path d={curve(points)} className="sp-road-base" />
        <path d={curve(points)} className="sp-road-dash" />
        {reached > 0 && <path d={curve(points.slice(0, reached + 1))} className="sp-road-done" />}
      </svg>
      <ol ref={box} className="sp-road-stops" style={{ height }}>
        {stops.map((stop, index) => {
          const { x } = points[index];
          const side = wide && x > width * 0.6 ? "left" : "right";
          const room = side === "left" ? x - 56 : width - x - 56;
          const place = { left: x, top: points[index].y, ["--sp-room" as string]: `${Math.max(150, Math.min(340, room))}px` } as CSSProperties;
          if (stop.kind === "fold") return <li key={stop.key} className="sp-road-fold" style={place}>
            <button type="button" onClick={() => setAll(!stop.open)}><ChevronDown size={15} aria-hidden className={stop.open ? "is-flipped" : ""} /> {stop.label}</button>
          </li>;
          return <RoadStop key={stop.key} node={stop.node} href={href(stop.node)} side={side} place={place} steps={steps} />;
        })}
      </ol>
    </div>
  );
}

function RoadStop({ node, href, side, place, steps }: { node: PathNode; href?: string; side: "left" | "right"; place: CSSProperties; steps: number }) {
  const label = node.kind === "lesson" && node.number ? `Bài ${node.number} · ${node.title}` : node.title;
  const current = node.status === "current";
  const body = <>
    <span className="sp-node" aria-hidden>{nodeIcon(node)}</span>
    <span className="sp-node-copy">
      <b>{label}</b>
      <small>{nodeNote(node, steps)}</small>
      {current && href && <span className="sp-node-go">{node.kind === "checkpoint" ? "Làm bài kiểm tra" : node.progress?.step || node.progress?.note ? "Học tiếp" : "Bắt đầu"} <ArrowRight size={14} aria-hidden /></span>}
    </span>
  </>;
  return (
    <li className={`sp-stop kind-${node.kind} is-${node.status} is-${side}`} style={place}>
      {href && node.status !== "locked" ? <Link href={href} aria-current={current ? "step" : undefined}>{body}</Link> : <div aria-disabled="true">{body}</div>}
    </li>
  );
}

/* ───────────── Screen 2 · the lesson frame ───────────── */

export type LessonStepItem = { label: string; note?: string; pass?: boolean };

/**
 * The lesson header in one row, so the work below gets the screen: leave to the path, the lesson name, the steps as
 * small pills (steps past the furthest one reached stay closed, so a lesson is done in order), how far along, and an
 * "i" holding the lesson's details. Narrow rows show only the current step's name.
 */
export function LessonBar({ exitHref, kicker, title, info, steps, step, count, reached = step, onPick }: {
  exitHref: string; kicker: ReactNode; title: string; info?: ReactNode;
  steps?: LessonStepItem[]; step: number; count?: number; reached?: number; onPick?: (step: number) => void;
}) {
  const total = count ?? steps?.length ?? STEP_COUNT;
  const shown = Math.min(Math.max(step, 0) + 1, total);
  // The bar (or the Lab's wrapper around it) sticks under the app header; once it does, it tightens up.
  const bar = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const pinned = getComputedStyle(element).position === "sticky" ? element : element.parentElement ?? element;
    const check = () => {
      const top = parseFloat(getComputedStyle(pinned).top) || 0;
      setStuck(window.scrollY > 0 && pinned.getBoundingClientRect().top <= top + 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);
  return (
    <div ref={bar} className={`sp-lessonbar ${stuck ? "is-stuck" : ""}`}>
      <Link className="sp-icon-btn" href={exitHref} aria-label="Về lộ trình"><X size={20} aria-hidden /></Link>
      <div className="sp-lessonbar-name"><small>{kicker}</small><b title={title}>{title}</b></div>
      {steps && <ol className="sp-pills" aria-label="Các bước học">
        {steps.map((item, index) => {
          const state = index === step ? "current" : item.pass || (step >= 0 && index < step) ? "done" : index <= reached ? "open" : "locked";
          return (
            <li key={item.label} className={`sp-pill is-${state}`}>
              <button type="button" disabled={state === "locked" || !onPick} onClick={() => onPick?.(index)} aria-current={state === "current" ? "step" : undefined}
                title={state === "locked" ? "Làm xong các bước trước để mở" : [item.label, item.note].filter(Boolean).join(" · ")}>
                <span className="sp-pill-dot">{state === "done" ? <Check size={12} strokeWidth={3} aria-hidden /> : index + 1}</span>
                <span className="sp-pill-label">{item.label}</span>
                {item.note && <small className="sp-pill-note">{item.note}</small>}
              </button>
            </li>
          );
        })}
      </ol>}
      <span className="sp-lessonbar-count" role="progressbar" aria-valuenow={shown} aria-valuemin={1} aria-valuemax={total} aria-label="Bước trong bài">
        <i aria-hidden><em style={{ width: `${(shown / total) * 100}%` }} /></i>{shown}/{total}
      </span>
      {info && <details className="sp-info">
        <summary aria-label="Thông tin bài học"><Info size={17} aria-hidden /></summary>
        <div className="sp-info-pop">{info}</div>
      </details>}
    </div>
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
      <LessonBar exitHref={exitHref} kicker={course.name} title={`${number ? `Bài ${number} · ` : ""}${lessonTitle}`} steps={STEP_SLOTS.map((label) => ({ label }))} step={step} reached={reached} onPick={onStep} />
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
