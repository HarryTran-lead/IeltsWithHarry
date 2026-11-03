import type { GrammarLessonProgress, GrammarPracticeItem, GrammarProgress, GrammarReview } from "./types";
import { editorialId } from "./types";

export const SESSION_SIZE = 12;
export const MIXED_REVIEW_SIZE = 10;
/** Days until the next spaced review after each successful round. */
export const reviewIntervals = [1, 3, 7, 21, 60];
/** Share of first-try answers that must be right for a review round to move the lesson to a longer interval. */
export const REVIEW_PASS = 0.8;
export const mainStages = ["guided", "independent", "mastery"] as const;

const DAY = 86_400_000;
const addDays = (now: string, days: number) => new Date(new Date(now).getTime() + days * DAY).toISOString();

export const answered = (lesson: GrammarLessonProgress | undefined, id: string) => {
  const status = lesson?.responses[id]?.status;
  return status === "UNDERSTOOD" || status === "NEED_REVIEW";
};

export function scheduleAfterLearn(now: string): GrammarReview {
  return { step: 0, due: addDays(now, reviewIntervals[0]) };
}

export function scheduleAfterReview(review: GrammarReview, accuracy: number, now: string): GrammarReview {
  if (accuracy < REVIEW_PASS) return { step: 0, due: addDays(now, reviewIntervals[0]), last: now };
  const step = Math.min(review.step + 1, reviewIntervals.length - 1);
  return { step, due: addDays(now, reviewIntervals[step]), last: now };
}

export const isDue = (review: GrammarReview | undefined, now: string) => Boolean(review && review.due <= now);

/** The three teaching stages are finished; spaced review starts from here. */
export const mainStagesDone = (items: GrammarPracticeItem[], lesson?: GrammarLessonProgress) =>
  items.filter((item) => item.stage !== "spaced_review").every((item) => answered(lesson, item.id));

/** Next questions of a stage: unanswered ones in order, or, when the stage is finished, mistakes first for another pass. */
export function stageQueue(items: GrammarPracticeItem[], stage: string, lesson?: GrammarLessonProgress, size = SESSION_SIZE) {
  const pool = items.filter((item) => item.stage === stage);
  const open = pool.filter((item) => !answered(lesson, item.id));
  if (open.length) return open.slice(0, size);
  const flagged = pool.filter((item) => lesson?.responses[item.id]?.status === "NEED_REVIEW");
  return [...flagged, ...pool.filter((item) => !flagged.includes(item))].slice(0, size);
}

/** First teaching stage that still has unanswered questions, or the last one when all are done. */
export const openStage = (items: GrammarPracticeItem[], lesson?: GrammarLessonProgress) =>
  mainStages.find((stage) => items.some((item) => item.stage === stage && !answered(lesson, item.id))) ?? "mastery";

/** A spaced round mixes the lesson's open mistakes with review questions, least recently seen first. */
export function spacedQueue(items: GrammarPracticeItem[], lesson?: GrammarLessonProgress, size = MIXED_REVIEW_SIZE) {
  const seen = (item: GrammarPracticeItem) => lesson?.responses[item.id]?.updatedAt ?? "";
  const mistakes = items.filter((item) => item.stage !== "spaced_review" && lesson?.responses[item.id]?.status === "NEED_REVIEW").slice(0, Math.floor(size / 3));
  const review = items.filter((item) => item.stage === "spaced_review").sort((a, b) => seen(a).localeCompare(seen(b)));
  const mastery = items.filter((item) => item.stage === "mastery").sort((a, b) => seen(a).localeCompare(seen(b)));
  return [...new Set([...mistakes, ...review, ...mastery])].slice(0, size);
}

/** Open mistakes across lessons, oldest first, for the mixed review session. */
export function flaggedQuestions(progress: GrammarProgress) {
  return Object.entries(progress).flatMap(([code, lesson]) => Object.entries(lesson.responses)
    .filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW")
    .map(([id, response]) => ({ code, id, response })))
    .sort((a, b) => (a.response.wrongAt ?? a.response.updatedAt).localeCompare(b.response.wrongAt ?? b.response.updatedAt));
}

export const dueLessons = (progress: GrammarProgress, now: string) =>
  Object.entries(progress).filter(([, lesson]) => isDue(lesson.review, now)).sort((a, b) => a[1].review!.due.localeCompare(b[1].review!.due)).map(([code]) => code);

export function formatDue(due: string, now: string) {
  const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "ngày mai";
  return new Date(due).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" });
}

/** Current time for schedule checks; kept out of render bodies so components stay pure. */
export const clockNow = () => new Date().toISOString();
