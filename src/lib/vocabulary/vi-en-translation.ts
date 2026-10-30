export type TranslationMode = "speaking" | "writing";
export type TranslationRating = "again" | "hard" | "good" | "easy";
export type TranslationExercise = {
  id: string; topic: string; mode: TranslationMode; term: string; meaning_vi: string; canonical_source_key?: string | null;
  pattern: string; collocations: string; prompt_vi: string; reference_en: string;
  alternatives: string[]; editor_note: string; revision: number;
};

export type WordComparison = {
  reference: string;
  matched: number;
  total: number;
  extra: number;
  accuracy: number;
  referenceWords: { word: string; matched: boolean }[];
  answerWords: { word: string; matched: boolean }[];
};

const wordsOf = (value: string) => value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
const normalizedWord = (word: string) => word.toLocaleLowerCase("en").replaceAll("’", "'");

export function matchesCopiedWord(input: string, term: string) {
  return wordsOf(input).map(normalizedWord).join(" ") === wordsOf(term).map(normalizedWord).join(" ");
}

function compareWithReference(answer: string, reference: string): WordComparison {
  const answerWords = wordsOf(answer);
  const referenceWords = wordsOf(reference);
  const a = answerWords.map(normalizedWord);
  const b = referenceWords.map(normalizedWord);
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  }
  const matchedAnswer = new Set<number>();
  const matchedReference = new Set<number>();
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { matchedAnswer.add(i++); matchedReference.add(j++); }
    else if (matrix[i + 1][j] >= matrix[i][j + 1]) i++;
    else j++;
  }
  const matched = matchedReference.size;
  return {
    reference, matched, total: b.length, extra: a.length - matched,
    accuracy: Math.round(100 * matched / Math.max(1, a.length, b.length)),
    referenceWords: referenceWords.map((word, index) => ({ word, matched: matchedReference.has(index) })),
    answerWords: answerWords.map((word, index) => ({ word, matched: matchedAnswer.has(index) })),
  };
}

export function compareTranslation(answer: string, reference: string, alternatives: string[] = []): WordComparison {
  return [reference, ...alternatives].filter(Boolean).map((item) => compareWithReference(answer, item))
    .sort((a, b) => b.accuracy - a.accuracy || b.matched - a.matched)[0] ?? compareWithReference(answer, reference);
}

export function ratingForComparison(result: WordComparison): TranslationRating {
  return result.accuracy >= 95 ? "easy" : result.accuracy >= 75 ? "good" : result.accuracy >= 45 ? "hard" : "again";
}
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
