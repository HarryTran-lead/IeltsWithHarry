import type { Skill, StudyTask, TaskSource } from "@/lib/demo-data";
import { addDay, daysBetween, findPlanned, mondayOf, weekdayOf } from "./core";
import { lessonInfo } from "./links";

/** A task the planner offers to add in one tap. */
export type TaskDraft = { title: string; skill: Skill; lesson?: string; duration?: number; source: TaskSource; date: string; priority?: StudyTask["priority"] };
export type Suggestion = TaskDraft & { id: string; reason: string };

export type SuggestionInput = {
  today: string;
  tasks: StudyTask[];
  /** Saved words whose review is due now; null while unknown. */
  vocabDue: number | null;
  /** The weakest Reading/Listening question type with enough answers, from recent tests. */
  weakType: { skill: "Reading" | "Listening"; label: string; kind?: string; correct: number; total: number } | null;
  examDate: string | null;
  /** Whether a planner link is open to learners (locked features are never suggested). */
  available: (lesson: string) => boolean;
};

/**
 * Short, concrete things worth doing today, most useful first: due reviews (forgetting is the
 * costliest delay), the weakest question type, then light daily habits. Anything already
 * planned for today is left out.
 */
export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const { today, tasks, available } = input;
  const list: Suggestion[] = [];
  const add = (id: string, reason: string, draft: Omit<TaskDraft, "date">) => {
    if (draft.lesson && (!available(draft.lesson) || findPlanned(tasks, draft.lesson, today))) return;
    list.push({ id, reason, date: today, ...draft });
  };

  if (input.vocabDue && input.vocabDue > 0) {
    const minutes = Math.max(5, Math.min(30, Math.ceil(input.vocabDue / 3)));
    add("vocab-due", `${input.vocabDue} từ đã tới lịch ôn`, { title: `Ôn ${input.vocabDue} từ đến hạn`, skill: "Vocabulary", lesson: "vocabulary-review", duration: minutes, source: "suggestion" });
  }

  const weak = input.weakType;
  if (weak && weak.total >= 5) {
    const rate = Math.round((weak.correct / weak.total) * 100);
    const kind = weak.skill === "Reading" ? "reading" : "listening";
    add("weak-type", `Dạng bạn đang đúng ${rate}%`, {
      title: `${weak.skill} · luyện dạng ${weak.label}`, skill: weak.skill, lesson: weak.kind ? `${kind}:${weak.kind}` : kind,
      duration: weak.skill === "Reading" ? 20 : 15, source: "suggestion", priority: rate < 60 ? "High" : "Medium",
    });
  }

  if (input.examDate) {
    const left = daysBetween(today, input.examDate);
    const recentFull = tasks.some((task) => task.completed && task.title.toLowerCase().includes("full") && daysBetween(task.date, today) <= 14);
    if (left >= 0 && left <= 30 && !recentFull) {
      add("full-test", `Còn ${left} ngày tới kỳ thi`, { title: "Reading · làm 1 đề full", skill: "Reading", lesson: "reading", duration: 60, source: "suggestion", priority: "High" });
    }
  }

  add("dictation", "15 phút nghe chép giữ tai quen tiếng Anh", { title: "Dictation 15 phút", skill: "Listening", lesson: "dictation", duration: 15, source: "suggestion" });
  add("news", "Đọc một bài thật rồi làm quiz", { title: "Đọc 1 bài Daily News + quiz", skill: "Reading", lesson: "news", duration: 15, source: "suggestion" });
  add("grammar", "Một lượt Grammar ngắn", { title: "Grammar 15 phút", skill: "Grammar", lesson: "grammar", duration: 15, source: "suggestion" });
  return list.slice(0, 5);
}

export type PlanInput = {
  today: string;
  /** Any day of the week to plan; days before today are skipped. */
  weekOf: string;
  /** 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  minutesPerDay: number;
  /** Skills to practise more, weakest first. */
  focus: Skill[];
  examDate: string | null;
  available: (lesson: string) => boolean;
};

type Block = { title: string; skill: Skill; lesson: string; duration: number };
const blocks: Record<"Reading" | "Listening" | "Writing" | "Speaking", Block[]> = {
  Reading: [{ title: "Reading · 1 passage", skill: "Reading", lesson: "reading", duration: 20 }],
  Listening: [{ title: "Listening · 1 section", skill: "Listening", lesson: "listening", duration: 15 }, { title: "Dictation 15 phút", skill: "Listening", lesson: "dictation", duration: 15 }],
  Writing: [{ title: "Writing · 1 bài Task 2", skill: "Writing", lesson: "writing", duration: 40 }, { title: "Writing · 1 bài Task 1", skill: "Writing", lesson: "writing", duration: 20 }],
  Speaking: [{ title: "Speaking · Part 1 + Part 2", skill: "Speaking", lesson: "speaking", duration: 15 }],
};
const extras: Block[] = [
  { title: "Grammar 15 phút", skill: "Grammar", lesson: "grammar", duration: 15 },
  { title: "Đọc 1 bài Daily News + quiz", skill: "Reading", lesson: "news", duration: 15 },
];

/**
 * A week of concrete tasks the learner can review before adding. Each study day opens with a
 * short vocabulary review, then rotates through the four skills (focus skills get twice the
 * turns) until the day's minutes are used. With the exam within three weeks the last study day
 * becomes a timed full Reading test.
 */
export function generateWeekPlan(input: PlanInput): TaskDraft[] {
  const days = [...new Set(input.weekdays)].sort((a, b) => a - b)
    .map((weekday) => addDay(mondayOf(input.weekOf), weekday - 1))
    .filter((day) => day >= input.today);
  if (!days.length || input.minutesPerDay < 10) return [];
  const four = ["Reading", "Listening", "Writing", "Speaking"] as const;
  const focus = input.focus.filter((skill): skill is (typeof four)[number] => (four as readonly string[]).includes(skill));
  const rotation: Block[] = [];
  for (const skill of [...focus, ...four]) {
    const options = blocks[skill].filter((block) => input.available(block.lesson));
    if (options.length) rotation.push(...options);
  }
  const fallback = extras.filter((block) => input.available(block.lesson));
  if (!rotation.length && !fallback.length) return [];

  const examSoon = input.examDate !== null && daysBetween(input.today, input.examDate) >= 0 && daysBetween(input.today, input.examDate) <= 21;
  const out: TaskDraft[] = [];
  let turn = 0;
  days.forEach((date, index) => {
    let left = input.minutesPerDay;
    const push = (block: Block, priority: StudyTask["priority"] = "Medium") => {
      out.push({ title: block.title, skill: block.skill, lesson: block.lesson, duration: block.duration, source: "plan", date, priority });
      left -= block.duration;
    };
    if (input.available("vocabulary-review")) push({ title: "Ôn từ đến hạn", skill: "Vocabulary", lesson: "vocabulary-review", duration: 10 });
    const lastDay = index === days.length - 1;
    if (examSoon && lastDay && left >= 60 && input.available("reading") && days.length > 1) {
      push({ title: "Reading · làm 1 đề full (thi thử)", skill: "Reading", lesson: "reading", duration: 60 }, "High");
    }
    let guard = 0;
    const pool = rotation.length ? rotation : fallback;
    while (left >= 10 && guard < pool.length * 2) {
      const block = pool[turn % pool.length];
      turn += 1; guard += 1;
      if (block.duration > left) continue;
      if (out.some((task) => task.date === date && task.title === block.title)) continue;
      push(block, focus[0] === block.skill ? "High" : "Medium");
    }
    // Weekends and long days get one lighter habit if time is still left.
    if (left >= 15 && (weekdayOf(date) >= 6 || input.minutesPerDay >= 60)) {
      const extra = fallback.find((block) => block.duration <= left && !out.some((task) => task.date === date && task.title === block.title));
      if (extra) push(extra);
    }
  });
  return out;
}

/** "Writing", "Speaking" … weakest first, from target bands and current estimates. */
export function focusSkills(goals: Partial<Record<Skill, number | null>>, current: Partial<Record<Skill, number | null>>): Skill[] {
  const four: Skill[] = ["Reading", "Listening", "Writing", "Speaking"];
  return four
    .map((skill) => ({ skill, gap: (goals[skill] ?? 0) - (current[skill] ?? (goals[skill] ?? 0) - 0.5) }))
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .map((item) => item.skill);
}

/** The default skill and minutes for a lesson, for drafts that only name the lesson. */
export function draftFor(lesson: string, date: string, title?: string): TaskDraft | null {
  const info = lessonInfo(lesson);
  if (!info) return null;
  return { title: title ?? info.label, skill: info.skill, lesson, duration: info.minutes, source: info.source, date };
}
