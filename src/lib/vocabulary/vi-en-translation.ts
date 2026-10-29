export type TranslationMode = "speaking" | "writing";
export type TranslationRating = "again" | "hard" | "good" | "easy";
export type TranslationExercise = {
  id: string; topic: string; mode: TranslationMode; term: string; meaning_vi: string;
  pattern: string; collocations: string; prompt_vi: string; reference_en: string;
  alternatives: string[]; editor_note: string; revision: number;
};
export type TranslationProgress = {
  exercise_id: string; first_seen_at: string; last_reviewed_at: string; due_at: string;
  interval_days: number; repetitions: number; last_rating: TranslationRating; attempts_count: number;
};

export function nextTranslationProgress(
  exerciseId: string, old: TranslationProgress | undefined, rating: TranslationRating, now = new Date(), userId?: string,
) {
  const interval = rating === "again" ? 0 : rating === "hard" ? 1
    : rating === "good" ? Math.max(3, Math.round((old?.interval_days ?? 0) * 2.2))
      : Math.max(7, Math.round((old?.interval_days ?? 0) * 3));
  const due = new Date(now);
  if (rating === "again") due.setMinutes(due.getMinutes() + 10);
  else due.setDate(due.getDate() + interval);
  return {
    ...(userId ? { user_id: userId } : {}), exercise_id: exerciseId,
    first_seen_at: old?.first_seen_at ?? now.toISOString(), last_reviewed_at: now.toISOString(),
    due_at: due.toISOString(), interval_days: interval,
    repetitions: rating === "again" ? 0 : (old?.repetitions ?? 0) + 1,
    last_rating: rating, attempts_count: (old?.attempts_count ?? 0) + 1,
  };
}

export function chooseTranslationSession(
  exercises: TranslationExercise[], progress: TranslationProgress[],
  selection: "new" | "due" | "all", size: number, now = Date.now(), random = Math.random,
) {
  const byId = new Map(progress.map((item) => [item.exercise_id, item]));
  const candidates = exercises.filter((item) => {
    const state = byId.get(item.id);
    return selection === "all" || (selection === "new" ? !state : !!state && Date.parse(state.due_at) <= now);
  });
  return [...candidates].sort(() => random() - 0.5).slice(0, size);
}
