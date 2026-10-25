export type WordReview = { notebook_entry_id: string; due_at: string; interval_days: number; repetitions: number; last_reviewed_at: string | null };
export type ReviewGrade = "again" | "good" | "easy";

export function nextWordReview(previous: WordReview | undefined, grade: ReviewGrade, now: Date): Omit<WordReview, "notebook_entry_id"> {
  const repetitions = grade === "again" ? 0 : Math.min((previous?.repetitions ?? 0) + 1, 1000);
  const interval_days = grade === "again" ? 1 : grade === "easy" ? Math.min(Math.max(3, (previous?.interval_days ?? 0) * 3), 365) : Math.min(Math.max(1, (previous?.interval_days ?? 0) * 2), 365);
  const delay = interval_days * 86400000;
  return { due_at: new Date(now.valueOf() + delay).toISOString(), interval_days, repetitions, last_reviewed_at: now.toISOString() };
}
