/**
 * A 0–100 difficulty score that decides which IELTS Reading passage (1, 2 or 3) an article reads like.
 *
 * In a Cambridge paper the three passages are about the same length (about 900 words) and sentence length, so
 * length cannot separate them. The score is the mean of four parts on 0–1: the passage map's style, its ratings of
 * how abstract the text is and how much it argues, and cheap text measures.
 *
 * Calibrated on 120 labelled Cambridge passages (one map request each, 2026-11-27): 69% exact and 95%
 * within one passage, against 48% for the first estimate, which put most Passage 3 texts in Passage 2. The map's
 * inference and vocabulary ratings barely differ between passages, so they are recorded but not scored.
 */
export type DifficultyRubric = { abstraction: number; argument: number; inference: number; vocabulary: number };
export type PassageStyleLabel = "factual" | "sections" | "argument";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const RUBRIC_KEYS = ["abstraction", "argument", "inference", "vocabulary"] as const;
const STYLE_VALUE: Record<PassageStyleLabel, number> = { factual: 0, sections: 0.5, argument: 1 };
/** Linking words of complex, academic sentences. */
const COMPLEX_LINKS = /\b(which|whereas|although|though|whom|whose|despite|nevertheless|nonetheless|moreover|furthermore|consequently|thereby|hence|notwithstanding|whereby|insofar|albeit)\b/gi;

/** When articles began to get a measured passage label; older articles keep their earlier length-based level. */
export const PASSAGE_LABEL_SINCE = Date.parse("2026-11-26T16:48:56Z");
/** Cut-offs from score to passage: below 30 reads like Passage 1, from 46 like Passage 3. */
export const PASSAGE_CUTOFFS = { passage2: 30, passage3: 46 } as const;
/** The ratings that separate the passages; the others are kept in the map for review only. */
const SCORED_RATINGS = ["abstraction", "argument"] as const;

/** Text measures on 0–1: sentence length, share of long words and density of complex linking words. */
export function textDifficulty(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => /\p{L}/u.test(sentence));
  const words = text.match(/\p{L}+(?:['’-]\p{L}+)*/gu) ?? [];
  if (!sentences.length || words.length < 50) return null;
  const sentenceLength = clamp((words.length / sentences.length - 14) / 14);
  const longWords = clamp((words.filter((word) => word.length >= 9).length / words.length - 0.06) / 0.1);
  const links = clamp(((text.match(COMPLEX_LINKS) ?? []).length / sentences.length) / 0.8);
  return (sentenceLength + longWords + links) / 3;
}

/** A rubric with every dimension scored 1–5, or null. */
export function validRubric(value: unknown): DifficultyRubric | null {
  if (!value || typeof value !== "object") return null;
  const rubric = value as Record<string, unknown>;
  return RUBRIC_KEYS.every((key) => Number.isInteger(rubric[key]) && Number(rubric[key]) >= 1 && Number(rubric[key]) <= 5)
    ? Object.fromEntries(RUBRIC_KEYS.map((key) => [key, Number(rubric[key])])) as DifficultyRubric : null;
}

/** The 0–100 score: the mean of style, abstraction, argument and the text measures. Null without a rubric. */
export function passageScore(rubric: unknown, style: unknown, text: string) {
  const valid = validRubric(rubric);
  if (!valid) return null;
  const parts = SCORED_RATINGS.map((key) => (valid[key] - 1) / 4);
  if (typeof style === "string" && Object.hasOwn(STYLE_VALUE, style)) parts.push(STYLE_VALUE[style as PassageStyleLabel]);
  const measured = textDifficulty(text);
  if (measured !== null) parts.push(measured);
  return Math.round(100 * parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

export function passageForScore(score: number): 1 | 2 | 3 {
  return score >= PASSAGE_CUTOFFS.passage3 ? 3 : score >= PASSAGE_CUTOFFS.passage2 ? 2 : 1;
}
