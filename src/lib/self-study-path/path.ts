/*
 * The one learning path every self-study Lab shares: chặng (band stages) → bài (lessons) → 5 fixed steps.
 * A Lab only describes its course (stages, lessons, what each step means there) and the learner's progress;
 * this module decides what is done, what is next and what stays locked, so every Lab unlocks the same way.
 *
 * Rules
 * - Lessons open in order: the first unfinished lesson of the open stage is the only "current" one.
 * - A stage opens once the previous stage is complete: all its lessons done and, when it has one,
 *   its end-of-stage check passed at PASS_MARK. A stage the learner already worked in stays open, so
 *   nobody loses lessons they studied before the path existed.
 * - "Ôn lỗi" is optional: it never blocks the path, it opens when the stage has mistakes to review.
 *   Stages show it (and the end-of-stage check) only when the Lab has one.
 */

export const PASS_MARK = 0.7;

/** The five steps every lesson follows, in this order, whatever the Lab. */
export const STEP_SLOTS = ["Khởi động", "Học", "Làm mẫu", "Luyện", "Kiểm tra"] as const;
export const STEP_COUNT = STEP_SLOTS.length;

export type PathLesson = {
  id: string;
  title: string;
  /** Short line under the title: type, topic, criterion… */
  meta?: string;
  /** What the learner will be able to do after the lesson. */
  goal?: string;
  minutes?: number;
  href: string;
  /** A side lesson such as a guide: shown on the path, not numbered or counted in the progress. */
  unnumbered?: boolean;
};

export type PathStage = {
  id: string;
  title: string;
  /** Band range like "3.0–4.5"; empty when the Lab has none for this stage. */
  band?: string;
  about?: string;
  lessons: PathLesson[];
  review?: { href?: string };
  checkpoint?: { title: string; href?: string };
};

export type PathCourse = {
  lab: string;
  name: string;
  base: string;
  /** How many steps a lesson has here; 5 unless the Lab's lessons use fewer. */
  stepCount?: number;
  /** What each of the five step slots means in this Lab (one short line each). */
  steps: readonly [string, string, string, string, string];
  stages: PathStage[];
};

export type LessonProgress = {
  done?: boolean;
  /** Step reached (0-based) while the lesson is in progress. */
  step?: number;
  right?: number;
  total?: number;
  /** Wrong answers this lesson sent to the mistake log. */
  mistakes?: number;
  /** How far along, in the Lab's own words ("Đã làm 4/12 câu"), shown instead of the step number. */
  note?: string;
};

export type PathProgress = {
  lessons: Record<string, LessonProgress>;
  /** Best end-of-stage score per stage, 0..1. */
  checkpoints: Record<string, number>;
  /** A stage the learner chose to start from: it and every stage before it are open, and "next" starts there. */
  startAt?: string;
};

export type NodeStatus = "done" | "current" | "open" | "locked";

export type PathNode = {
  kind: "lesson" | "review" | "checkpoint";
  id: string;
  title: string;
  status: NodeStatus;
  href?: string;
  /** 1-based position among all lessons of the course. */
  number?: number;
  lesson?: PathLesson;
  progress?: LessonProgress;
  /** Review: wrong answers waiting. Checkpoint: best score 0..1. */
  mistakes?: number;
  score?: number;
};

export type StageView = {
  stage: PathStage;
  index: number;
  status: "done" | "current" | "locked";
  nodes: PathNode[];
  done: number;
  total: number;
};

export type PathView = {
  stages: StageView[];
  /** The one thing to do next: a lesson or an end-of-stage check. Null when the course is finished. */
  next: { node: PathNode; stage: StageView } | null;
  done: number;
  total: number;
  mistakes: number;
};

const passed = (score: number | undefined) => typeof score === "number" && score >= PASS_MARK;

export function buildPath(course: PathCourse, progress: PathProgress): PathView {
  const stages: StageView[] = [];
  let number = 0;
  let previousComplete = true;
  let next: PathView["next"] = null;
  let fallback: PathView["next"] = null;
  const startIndex = progress.startAt ? course.stages.findIndex((stage) => stage.id === progress.startAt) : -1;

  course.stages.forEach((stage, index) => {
    const worked = stage.lessons.some((lesson) => progress.lessons[lesson.id]?.done || progress.lessons[lesson.id]?.step !== undefined);
    const open = previousComplete || worked || index <= startIndex;
    let currentGiven = !open;
    const nodes: PathNode[] = [];
    let done = 0;
    let mistakes = 0;

    let finished = 0;
    for (const lesson of stage.lessons) {
      if (!lesson.unnumbered) number += 1;
      const state = progress.lessons[lesson.id];
      let status: NodeStatus = "locked";
      if (open && state?.done) { status = "done"; finished += 1; if (!lesson.unnumbered) done += 1; mistakes += state.mistakes ?? 0; }
      else if (!currentGiven) { status = "current"; currentGiven = true; }
      nodes.push({ kind: "lesson", id: lesson.id, title: lesson.title, status, href: status === "locked" ? undefined : lesson.href, number: lesson.unnumbered ? undefined : number, lesson, progress: state });
    }

    const lessonsDone = open && finished === stage.lessons.length;
    if (stage.review && stage.lessons.length) {
      const status: NodeStatus = open && mistakes > 0 ? "open" : "locked";
      nodes.push({ kind: "review", id: `${stage.id}:review`, title: "Ôn lỗi của chặng", mistakes, status, href: status === "open" ? stage.review.href : undefined });
    }

    let complete = lessonsDone;
    if (stage.checkpoint) {
      const score = progress.checkpoints[stage.id];
      const status: NodeStatus = !lessonsDone ? "locked" : passed(score) ? "done" : "current";
      complete = status === "done";
      nodes.push({ kind: "checkpoint", id: `${stage.id}:check`, title: stage.checkpoint.title, status, href: status === "locked" ? undefined : stage.checkpoint.href, score });
    }

    const total = stage.lessons.filter((lesson) => !lesson.unnumbered).length;
    const view: StageView = { stage, index, status: !open ? "locked" : complete ? "done" : "current", nodes, done: open ? done : 0, total };
    stages.push(view);
    const current = open ? nodes.find((node) => node.status === "current") : undefined;
    if (current && !next && index >= startIndex) next = { node: current, stage: view };
    if (current && !fallback) fallback = { node: current, stage: view };
    previousComplete = open && complete;
  });

  const done = stages.reduce((sum, stage) => sum + stage.done, 0);
  const total = stages.reduce((sum, stage) => sum + stage.total, 0);
  const mistakes = stages.reduce((sum, stage) => sum + (stage.nodes.find((node) => node.kind === "review")?.mistakes ?? 0), 0);
  return { stages, next: next ?? fallback, done, total, mistakes };
}

/** "1.0–4.0" + "3.0–5.0" → "1.0–5.0"; ignores ranges it cannot read. */
export function bandSpan(ranges: (string | undefined)[]) {
  let low = Infinity;
  let high = -Infinity;
  for (const range of ranges) {
    const values = (range ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (!values.length) continue;
    low = Math.min(low, values[0]);
    high = Math.max(high, values[values.length - 1]);
  }
  if (!Number.isFinite(low)) return "";
  return low === high ? low.toFixed(1) : `${low.toFixed(1)}–${high.toFixed(1)}`;
}
