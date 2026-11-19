/**
 * Writing Task 2 skills course (R01–R16): the normalised shapes the server sends to the learner pages.
 * The source files differ a lot between milestones; course-normalize.ts maps all of them onto these shapes,
 * so the pages render every milestone with one template.
 */
import { TASK2_API, TASK2_BASE, type Task2Stage } from "./types";

export const COURSE_API = `${TASK2_API}/course`;
export const COURSE_BASE = `${TASK2_BASE}/course`;

export const courseLayers: { id: string; name: string; about: string; modules: string[] }[] = [
  { id: "1", name: "Nền tảng", about: "Hiểu đề, cấu trúc bài, xây câu, tạo ý", modules: ["R01", "R02", "R03", "R04"] },
  { id: "2", name: "Từng phần của bài", about: "Mở bài, Body 1, Body 2, kết luận", modules: ["R05", "R06", "R07", "R08"] },
  { id: "3", name: "Từng dạng đề", about: "Opinion, hai quan điểm, ưu–nhược, vấn đề–giải pháp", modules: ["R09", "R10", "R11", "R12"] },
  { id: "4", name: "Tự chữa theo tiêu chí", about: "TR, CC, LR, GRA bằng bằng chứng trong bài", modules: ["R13", "R14"] },
  { id: "5", name: "Luyện theo chủ đề", about: "8 chủ đề, cùng đề qua bốn chặng", modules: ["R15"] },
  { id: "6", name: "Cuối khoá", about: "Viết độc lập, có giờ, tự chữa", modules: ["R16"] },
];
export const courseModuleIds = courseLayers.flatMap((layer) => layer.modules);
export const isCourseModule = (id: string) => courseModuleIds.includes(id);

/** A labelled piece of content: English, Vietnamese, or a list. */
export type CourseField = { label: string; en?: string; vi?: string; list?: string[] };

/** One teaching unit: what to learn, how, and a weak/strong pair. */
export type CourseUnit = {
  id: string; title: string; goal?: string; steps: string[];
  principle_en?: string; principle_vi?: string; bad_en?: string; good_en?: string; why?: string;
  example_en?: string; example_vi?: string; next?: string; fields: CourseField[];
};

/** Reference material (glossary, connectors, error banks…), shown as cards. */
export type CourseSection = { id: string; title: string; intro?: string; list?: string[]; cards: { title?: string; fields: CourseField[] }[] };

export type CourseExample = {
  id: string; title: string; stage?: string; question_type?: string;
  prompt_en?: string; prompt_vi?: string; main_en?: string; main_vi?: string; word_count?: number;
  steps: { label: string; en: string; note?: string }[]; fields: CourseField[];
};

export type CoursePractice = {
  id: string; group: string; stage?: string; question_type?: string;
  prompt_en?: string; prompt_vi?: string; task: string; stimulus: CourseField[]; length?: string;
  hints: string[]; self_check: string[]; options?: { id: string; text: string }[];
  time_limit?: number; min_words?: number; fields: CourseField[];
  /** Whether a stuck learner may open the reference before writing (not in the final milestone). */
  peek: boolean;
  /** Whether the server holds reference guidance for it; timed essays are reviewed with the checklist instead. */
  reference: boolean;
};

export type CourseModuleSummary = {
  id: string; layer: string; title: string; overview: string;
  counts: { units: number; examples: number; practice: number };
};

export type CourseModule = CourseModuleSummary & {
  prerequisites: string[]; stage_targets: { stage: string; text: string }[];
  units: CourseUnit[]; sections: CourseSection[]; examples: CourseExample[]; practice: CoursePractice[];
  self_check: string[]; notes: string[];
};

export type CourseAnswer = { correct?: string; model_en?: string; model_vi?: string; fields: CourseField[] };

/** One saved attempt, stored per practice item in writing_drafts (slug below). */
export type CourseAttempt = { c: 1; text: string; choice?: string; savedAt: string };
export const courseDraftSlug = (moduleId: string, practiceId: string) => `t2-course:${moduleId}:${practiceId}`;
export const ATTEMPT_MIN_CHARS = 3;

export const courseStageLabels: Record<string, string> = { foundation: "Nền tảng", basic: "Cơ bản", developing: "Phát triển", advanced: "Nâng cao" };
export const isStage = (value: string | undefined): value is Task2Stage => Boolean(value && value in courseStageLabels);

export function parseCourseAttempt(value: string | null | undefined): CourseAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CourseAttempt>;
    if (parsed.c !== 1 || typeof parsed.text !== "string" || typeof parsed.savedAt !== "string") return null;
    return { c: 1, text: parsed.text, choice: typeof parsed.choice === "string" ? parsed.choice : undefined, savedAt: parsed.savedAt };
  } catch { return null; }
}

/** An attempt counts once something real was written or an option was picked. */
export const attemptDone = (attempt: CourseAttempt | null | undefined) => Boolean(attempt && (attempt.choice || attempt.text.trim().length >= ATTEMPT_MIN_CHARS));
