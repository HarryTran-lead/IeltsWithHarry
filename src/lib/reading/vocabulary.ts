export type Rating = "again" | "hard" | "good" | "easy";
export type ExerciseType = "context" | "flashcard" | "recall" | "srs" | "translation";
export type Direction = "en_vi" | "vi_en";

type ContextExercise = {
  id: string; example_en: string; example_vi: string; related_expression_en: string;
};
type FlashcardExercise = {
  id: string; direction: Direction; front: string; back: string; example_en: string; example_vi: string;
};
type RecallExercise = {
  id: string; prompt_en: string; context_translation_vi: string; answer: string;
  acceptable_answers: string[]; explanation_vi: string;
};
type TranslationExercise = {
  id: string; direction: Direction; prompt: string; reference_answer: string;
  target_vocabulary: string; rubric_vi: string;
};

export type ReadingWord = {
  id: string; source_order: number; headword: string; pos: string; meaning_vi: string;
  example_en: string; example_vi: string; related_expression_en: string; context_chunk: string;
  topic: string; difficulty: "foundation" | "intermediate" | "advanced";
  content: { context: ContextExercise; flashcards: FlashcardExercise[]; recall: RecallExercise; translations: TranslationExercise[] };
};

export type ReadingProgress = {
  entry_id: string; first_seen_at: string; last_reviewed_at: string; due_at: string;
  interval_days: number; repetitions: number; correct_count: number; wrong_count: number;
  last_grade: Rating; success_days: string[]; success_types: string[];
  mistake_open: boolean; last_mistake_at: string | null; recovery_days: string[];
  mastered_at: string | null;
};

export type ReadingPlanDay = {
  day_number: number; week_number: number; activity_type: string; phase: string;
  new_vocabulary_ids: string[]; daily_tasks: {
    learn_context_for_new_words: boolean; flashcards_for_new_words: boolean;
    active_recall_for_new_words: boolean; review_due_srs: boolean;
    review_mistakes: boolean; translation_self_review_quota: number;
    weekly_progress_checkpoint: boolean;
  }; notes_vi: string;
};

export type ReadingAttempt = {
  entry_id: string; exercise_id: string; exercise_type: ExerciseType; direction: string;
  submitted_answer: string; result: "correct" | "incorrect" | "self_reviewed";
  self_rating: Rating; created_at: string;
};

export function normalizeReadingAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[.,!?;:]/g, "").trim().replace(/\s+/g, " ");
}

export function matchesReadingRecall(value: string, answers: string[]): boolean {
  const normalized = normalizeReadingAnswer(value);
  return answers.some((answer) => normalizeReadingAnswer(answer) === normalized);
}

export function nextReadingProgress(
  entryId: string, previous: ReadingProgress | undefined, rating: Rating,
  type: ExerciseType, result: ReadingAttempt["result"], now = new Date(),
): ReadingProgress {
  const iso = now.toISOString();
  const day = iso.slice(0, 10);
  const effectiveRating = result === "incorrect" ? "again" : rating;
  const failed = rating === "again" || rating === "hard" || result === "incorrect";
  const success = !failed && type !== "context";
  const successDays = success ? [...new Set([...(previous?.success_days ?? []), day])] : previous?.success_days ?? [];
  const successTypes = success ? [...new Set([...(previous?.success_types ?? []), type])] : previous?.success_types ?? [];
  const lastMistake = failed ? iso : previous?.last_mistake_at ?? null;
  const recoveryDays = failed ? [] : previous?.mistake_open && lastMistake && day > lastMistake.slice(0, 10)
    ? [...new Set([...(previous.recovery_days ?? []), day])] : previous?.recovery_days ?? [];
  const mistakeOpen = failed || Boolean(previous?.mistake_open && recoveryDays.length < 2);
  const oldInterval = previous?.interval_days || 0;
  const interval = effectiveRating === "again" ? 0 : effectiveRating === "hard" ? 1
    : effectiveRating === "good" ? (oldInterval ? Math.max(3, Math.round(oldInterval * 1.8)) : 3)
      : (oldInterval ? Math.max(7, Math.round(oldInterval * 2.4)) : 7);
  const dueMs = effectiveRating === "again" ? 10 * 60_000 : interval * 86_400_000;
  return {
    entry_id: entryId,
    first_seen_at: previous?.first_seen_at ?? iso,
    last_reviewed_at: iso,
    due_at: new Date(now.getTime() + dueMs).toISOString(),
    interval_days: interval,
    repetitions: (previous?.repetitions ?? 0) + 1,
    correct_count: (previous?.correct_count ?? 0) + (failed ? 0 : 1),
    wrong_count: (previous?.wrong_count ?? 0) + (failed ? 1 : 0),
    last_grade: effectiveRating,
    success_days: successDays,
    success_types: successTypes,
    mistake_open: mistakeOpen,
    last_mistake_at: lastMistake,
    recovery_days: recoveryDays,
    mastered_at: !mistakeOpen && successDays.length >= 2 && successTypes.length >= 2
      ? previous?.mastered_at ?? iso : null,
  };
}

export function readingQueue(words: ReadingWord[], progress: ReadingProgress[], now = new Date()): ReadingWord[] {
  const byId = new Map(progress.map((row) => [row.entry_id, row]));
  const due = words.filter((word) => {
    const state = byId.get(word.id);
    return state && new Date(state.due_at).getTime() <= now.getTime();
  }).sort((a, b) => Number(Boolean(byId.get(b.id)?.mistake_open)) - Number(Boolean(byId.get(a.id)?.mistake_open))
    || new Date(byId.get(a.id)!.due_at).getTime() - new Date(byId.get(b.id)!.due_at).getTime()
    || a.source_order - b.source_order);
  const fresh = words.filter((word) => !byId.has(word.id)).sort((a, b) => a.source_order - b.source_order);
  return [...due, ...fresh];
}
