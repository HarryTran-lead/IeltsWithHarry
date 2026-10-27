import { createEmptyCard, fsrs, Rating, State, type Card, type CardInput } from "ts-fsrs";

export type WordReview = { notebook_entry_id: string; due_at: string; interval_days: number; repetitions: number; last_reviewed_at: string | null; fsrs_state?: CardInput | null };
export type ReviewGrade = "again" | "hard" | "good" | "easy";

const rating = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
const scheduler = fsrs();

/** Both saved-word surfaces use the same FSRS card; legacy review rows retain their prior state as a seed. */
export function nextWordReview(previous: WordReview | undefined, grade: ReviewGrade, now: Date): Omit<WordReview, "notebook_entry_id"> {
  const legacy = previous && !previous.fsrs_state && previous.repetitions > 0;
  const card: CardInput | Card = previous?.fsrs_state ?? (legacy ? {
    ...createEmptyCard(now), due: previous.due_at, stability: Math.max(1, previous.interval_days),
    difficulty: 5, scheduled_days: previous.interval_days, reps: previous.repetitions,
    state: State.Review, last_review: previous.last_reviewed_at ?? undefined,
  } : createEmptyCard(now));
  const scheduled = scheduler.next(card, now, rating[grade]).card;
  return {
    due_at: scheduled.due.toISOString(), interval_days: Math.max(0, scheduled.scheduled_days),
    repetitions: scheduled.reps, last_reviewed_at: now.toISOString(), fsrs_state: scheduled,
  };
}
