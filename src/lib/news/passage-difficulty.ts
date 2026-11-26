/**
 * A 0–100 difficulty score that decides which IELTS Reading passage (1, 2 or 3) an article reads like.
 *
 * In a Cambridge paper the three passages are about the same length (about 900 words) and sentence length, so
 * length cannot separate them. The score blends the passage map's judgement of the text (how abstract it is, how
 * much it argues, how much a reader must infer, how hard its vocabulary is, and its overall style) with cheap text
 * measures. The weights and cut-offs are a first estimate, to be calibrated against labelled Cambridge passages.
 */
export type DifficultyRubric = { abstraction: number; argument: number; inference: number; vocabulary: number };
export type PassageStyleLabel = "factual" | "sections" | "argument";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const RUBRIC_KEYS = ["abstraction", "argument", "inference", "vocabulary"] as const;
const STYLE_VALUE: Record<PassageStyleLabel, number> = { factual: 0, sections: 0.5, argument: 1 };
/** Linking words of complex, academic sentences. */
const COMPLEX_LINKS = /\b(which|whereas|although|though|whom|whose|despite|nevertheless|nonetheless|moreover|furthermore|consequently|thereby|hence|notwithstanding|whereby|insofar|albeit)\b/gi;

/** Cut-offs from score to passage: below 40 reads like Passage 1, from 62 like Passage 3. */
export const PASSAGE_CUTOFFS = { passage2: 40, passage3: 62 } as const;

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

/** The 0–100 score: 60% the model's judgement (rubric and style), 40% the text measures. Null without a rubric. */
export function passageScore(rubric: unknown, style: unknown, text: string) {
  const valid = validRubric(rubric);
  if (!valid) return null;
  const judged = RUBRIC_KEYS.map((key) => (valid[key] - 1) / 4);
  if (typeof style === "string" && Object.hasOwn(STYLE_VALUE, style)) judged.push(STYLE_VALUE[style as PassageStyleLabel]);
  const model = judged.reduce((sum, value) => sum + value, 0) / judged.length;
  const measured = textDifficulty(text);
  return Math.round(100 * (measured === null ? model : 0.6 * model + 0.4 * measured));
}

export function passageForScore(score: number): 1 | 2 | 3 {
  return score >= PASSAGE_CUTOFFS.passage3 ? 3 : score >= PASSAGE_CUTOFFS.passage2 ? 2 : 1;
}
