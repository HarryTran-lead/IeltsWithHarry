import type { Skill, TaskSource } from "@/lib/demo-data";

/*
 * What a planner task's `lesson` points at. A lesson is either a plain kind ("dictation",
 * "vocabulary-review") meaning "some of this work", or kind:reference ("ielts:<exam id>",
 * "news:<article slug>") meaning one specific item. The database trigger in
 * 202611240001_planner_v2.sql ticks tasks by the same kinds, so keep the two lists in step.
 */

export type LessonKind =
  | "ielts" | "reading" | "listening" | "writing" | "speaking" | "speaking-mock"
  | "dictation" | "vocabulary-review" | "vocabulary-study" | "grammar" | "grammar-review"
  | "news" | "lab" | "translation";

type KindInfo = { label: string; skill: Skill; minutes: number; source: TaskSource; auto: boolean; href: (ref?: string) => string | null };

const labPaths: Record<string, { href: string; label: string; skill: Skill; minutes: number }> = {
  "writing-task-1": { href: "/app/self-study/writing-task-1", label: "Writing Task 1 Lab", skill: "Writing", minutes: 30 },
  "writing-task-2": { href: "/app/self-study/writing-task-2", label: "Writing Task 2 Lab", skill: "Writing", minutes: 40 },
  speaking: { href: "/app/self-study/speaking", label: "Speaking Lab", skill: "Speaking", minutes: 20 },
  reading: { href: "/app/reading/lab", label: "Reading Lab", skill: "Reading", minutes: 25 },
  listening: { href: "/app/self-study/listening", label: "Listening Lab", skill: "Listening", minutes: 20 },
};
export const labIds = Object.keys(labPaths);
export function labInfo(id: string) {
  return labPaths[id] ?? null;
}

const kinds: Record<LessonKind, KindInfo> = {
  ielts: { label: "Đề trong Ngân hàng đề", skill: "Reading", minutes: 20, source: "exam", auto: true, href: (ref) => ref ? `/app/question-bank/exam/${ref}` : "/app/question-bank" },
  reading: { label: "Luyện Reading", skill: "Reading", minutes: 20, source: "exam", auto: true, href: (ref) => `/app/reading?type=passage${ref ? `&kind=${encodeURIComponent(ref)}` : ""}` },
  listening: { label: "Luyện Listening", skill: "Listening", minutes: 15, source: "exam", auto: true, href: (ref) => `/app/listening?type=part${ref ? `&kind=${encodeURIComponent(ref)}` : ""}` },
  writing: { label: "Luyện Writing", skill: "Writing", minutes: 40, source: "exam", auto: true, href: () => "/app/writing" },
  speaking: { label: "Luyện Speaking", skill: "Speaking", minutes: 15, source: "exam", auto: true, href: () => "/app/speaking" },
  "speaking-mock": { label: "Thi thử Speaking", skill: "Speaking", minutes: 15, source: "exam", auto: false, href: () => "/app/speaking/mock" },
  dictation: { label: "Dictation", skill: "Listening", minutes: 15, source: "dictation", auto: true, href: (ref) => ref ? `/app/dictation/banks/skill-lab/${encodeURIComponent(ref)}` : "/app/dictation" },
  "vocabulary-review": { label: "Ôn từ đến hạn", skill: "Vocabulary", minutes: 10, source: "vocabulary", auto: true, href: () => "/app/vocabulary/review" },
  "vocabulary-study": { label: "Học từ mới", skill: "Vocabulary", minutes: 15, source: "vocabulary", auto: true, href: () => "/app/vocabulary/study?collection=ielts" },
  grammar: { label: "Grammar", skill: "Grammar", minutes: 15, source: "grammar", auto: true, href: () => "/app/grammar" },
  "grammar-review": { label: "Ôn Grammar & Sổ lỗi", skill: "Grammar", minutes: 15, source: "grammar", auto: true, href: () => "/app/grammar/review" },
  news: { label: "Daily News", skill: "Reading", minutes: 15, source: "news", auto: true, href: (ref) => ref ? `/app/news/learn/${encodeURIComponent(ref)}` : "/app/news" },
  lab: { label: "Lab tự học", skill: "Writing", minutes: 30, source: "lab", auto: false, href: (ref) => (ref ? labPaths[ref]?.href ?? null : null) },
  translation: { label: "Luyện diễn đạt", skill: "Writing", minutes: 15, source: "practice", auto: false, href: () => "/app/practice/translation" },
};

export type LessonInfo = { kind: LessonKind; ref?: string; label: string; skill: Skill; minutes: number; source: TaskSource; href: string | null; auto: boolean };

/** Splits "news:my-slug" into its kind and reference; null for slugs the planner does not know. */
export function lessonInfo(lesson: string | undefined | null): LessonInfo | null {
  if (!lesson) return null;
  const split = lesson.indexOf(":");
  const kind = (split < 0 ? lesson : lesson.slice(0, split)) as LessonKind;
  const ref = split < 0 ? undefined : lesson.slice(split + 1) || undefined;
  const info = kinds[kind];
  if (!info) return null;
  const lab = kind === "lab" && ref ? labPaths[ref] : null;
  return {
    kind, ref,
    label: lab?.label ?? info.label,
    skill: lab?.skill ?? info.skill,
    minutes: lab?.minutes ?? info.minutes,
    source: info.source,
    href: info.href(ref),
    auto: info.auto,
  };
}

export function lessonSlug(kind: LessonKind, ref?: string) {
  return ref ? `${kind}:${ref}` : kind;
}

/** The planner kind for an IELTS skill name, for generic "luyện Reading" tasks. */
export function skillLesson(skill: Skill): LessonKind | null {
  return skill === "Reading" ? "reading" : skill === "Listening" ? "listening" : skill === "Writing" ? "writing" : skill === "Speaking" ? "speaking" : null;
}
