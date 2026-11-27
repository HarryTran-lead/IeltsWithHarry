import catalogJson from "@/data/grammar-editorial/catalog.json";
import { practiced, reviewedCount, type GrammarCatalogLesson, type GrammarLessonProgress, type GrammarLevel, type GrammarProgress } from "@/lib/grammar/types";

export const catalog = catalogJson as GrammarCatalogLesson[];
export const ROOT = "/app/grammar";

/** Bite-sized sprint sizes (~4–5 minutes per round) instead of overwhelming 51–110 question walls. */
export const BITE_STAGE_SIZE: Record<string, number> = {
  guided: 8,
  independent: 10,
  mastery: 6,
};

/** Cumulative answered-question milestones for 1★ (Core), 2★ (Fluent), and 3★ (Mastered). */
export const STAR_GOALS = [8, 18, 24] as const;

export const lessonTotal = (lesson: GrammarCatalogLesson) => Object.values(lesson.counts).reduce((a, b) => a + b, 0);

export function lessonStars(lesson: GrammarCatalogLesson, value?: GrammarLessonProgress): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  if (practiced(value, lessonTotal(lesson))) return 3;
  const done = reviewedCount(value);
  if (done >= STAR_GOALS[2]) return 3;
  if (done >= STAR_GOALS[1]) return 2;
  if (done >= STAR_GOALS[0]) return 1;
  return 0;
}

export function nextStarTarget(lesson: GrammarCatalogLesson, value?: GrammarLessonProgress): { target: number; remaining: number; nextStar: 1 | 2 | 3 } | null {
  const stars = lessonStars(lesson, value);
  if (stars === 3) return null;
  const done = reviewedCount(value);
  const target = STAR_GOALS[stars];
  return { target, remaining: Math.max(1, target - done), nextStar: (stars + 1) as 1 | 2 | 3 };
}

export function levelStarSummary(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  const earned = lessons.reduce((sum, lesson) => sum + lessonStars(lesson, progress[lesson.code]), 0);
  const startedLessons = lessons.filter((lesson) => lessonStars(lesson, progress[lesson.code]) >= 1).length;
  const masteredLessons = lessons.filter((lesson) => lessonStars(lesson, progress[lesson.code]) === 3).length;
  return { earned, max: lessons.length * 3, startedLessons, masteredLessons, totalLessons: lessons.length };
}

/** Earning at least 1★ (an 8-question sprint) marks the core lesson conquered on the roadmap. */
export const lessonDone = (lesson: GrammarCatalogLesson, value?: GrammarLessonProgress) => lessonStars(lesson, value) >= 1;

/** A lesson already started reopens at its next bite-sized sprint. */
export const lessonHref = (code: string, value?: GrammarLessonProgress) => `${ROOT}/lesson/${code}${value?.theorySeen || reviewedCount(value) ? "?resume=1" : ""}`;

export function nextLesson(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return lessons.find((lesson) => progress[lesson.code] && !lessonDone(lesson, progress[lesson.code]))
    ?? lessons.find((lesson) => !lessonDone(lesson, progress[lesson.code]))
    ?? lessons.find((lesson) => lessonStars(lesson, progress[lesson.code]) < 3)
    ?? lessons[0];
}

/** Outside the roadmap: the lesson touched most recently, or the next one in its level. */
export function continueLesson(progress: GrammarProgress) {
  const recent = Object.entries(progress).filter(([code]) => catalog.some((lesson) => lesson.code === code))
    .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))[0];
  if (!recent) return catalog[0];
  const lesson = catalog.find((item) => item.code === recent[0])!;
  return lessonDone(lesson, recent[1]) ? nextLesson(lesson.level, progress) : lesson;
}
