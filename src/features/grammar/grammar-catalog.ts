import catalogJson from "@/data/grammar-editorial/catalog.json";
import { practiced, reviewedCount, type GrammarCatalogLesson, type GrammarLessonProgress, type GrammarLevel, type GrammarProgress } from "@/lib/grammar/types";

export const catalog = catalogJson as GrammarCatalogLesson[];
export const ROOT = "/app/grammar";
export const lessonTotal = (lesson: GrammarCatalogLesson) => Object.values(lesson.counts).reduce((a, b) => a + b, 0);
export const lessonDone = (lesson: GrammarCatalogLesson, value?: GrammarLessonProgress) => practiced(value, lessonTotal(lesson));

/** A lesson already started reopens at its first unanswered question. */
export const lessonHref = (code: string, value?: GrammarLessonProgress) => `${ROOT}/lesson/${code}${value?.theorySeen || reviewedCount(value) ? "?resume=1" : ""}`;

export function nextLesson(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return lessons.find((lesson) => progress[lesson.code] && !lessonDone(lesson, progress[lesson.code]))
    ?? lessons.find((lesson) => !lessonDone(lesson, progress[lesson.code])) ?? lessons[0];
}

/** Outside the roadmap: the lesson touched most recently, or the next one in its level. */
export function continueLesson(progress: GrammarProgress) {
  const recent = Object.entries(progress).filter(([code]) => catalog.some((lesson) => lesson.code === code))
    .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))[0];
  if (!recent) return catalog[0];
  const lesson = catalog.find((item) => item.code === recent[0])!;
  return lessonDone(lesson, recent[1]) ? nextLesson(lesson.level, progress) : lesson;
}
