/*
 * Server-side grading for Skill Lab dictation lessons (port of the M16.2 reference grader).
 * Dictation accuracy is practice feedback only. It is never converted into an IELTS band.
 */
import { wordDifferences } from "../listening/youtube";

export type GradeMode = "practice" | "ielts";
export type GradableQuestion = {
  question_id: string;
  type: string;
  correct_answers: string[];
  practice_aliases?: string[];
  word_limit?: number;
  scoring_policy?: string;
};
export type GradeResult = {
  correct: boolean;
  reason: "matched" | "not_in_accepted_answers" | "empty_answer" | "word_limit_exceeded" | "missing_word_limit_config";
  allowed_words?: number;
  found_words?: number;
  found_numbers?: number;
  /** Share of reference words heard correctly, for dictation questions only. */
  accuracy?: number;
};

export const COMPLETION_TYPES = new Set(["form_completion", "note_completion", "table_completion", "sentence_completion", "summary_completion", "flow_chart_completion", "short_answer"]);

export function normalizeAnswer(value: string) {
  return String(value).normalize("NFKC").replace(/[‘’]/g, "'").toLowerCase()
    .replace(/[^\p{L}\p{N}_\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

/** IELTS completion limit: a hyphenated form is one word, a number counts separately, a UK postcode is one number. */
export function countWordsNumbers(value: string): [words: number, numbers: number] {
  const text = String(value).trim();
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(text)) return [0, 1];
  const tokens = text.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*|\d+(?:[.,:]\d+)*/g) ?? [];
  const numbers = tokens.filter((token) => /\d/.test(token)).length;
  return [tokens.length - numbers, numbers];
}

export function acceptedAnswers(question: GradableQuestion, mode: GradeMode) {
  return mode === "practice" ? [...question.correct_answers, ...(question.practice_aliases ?? [])] : [...question.correct_answers];
}

export function gradeAnswer(question: GradableQuestion, learnerAnswer: string, mode: GradeMode = "ielts"): GradeResult {
  const answer = normalizeAnswer(learnerAnswer ?? "");
  if (!answer) return { correct: false, reason: "empty_answer", ...(question.type === "dictation" ? { accuracy: 0 } : {}) };
  if (COMPLETION_TYPES.has(question.type) && mode === "ielts") {
    const limit = question.word_limit;
    if (!limit) return { correct: false, reason: "missing_word_limit_config" };
    const [words, numbers] = countWordsNumbers(learnerAnswer);
    if (words > limit || numbers > 1) return { correct: false, reason: "word_limit_exceeded", allowed_words: limit, found_words: words, found_numbers: numbers };
  }
  const accepted = new Set(acceptedAnswers(question, mode).map(normalizeAnswer));
  const correct = accepted.has(answer);
  const result: GradeResult = { correct, reason: correct ? "matched" : "not_in_accepted_answers" };
  if (question.type === "dictation") result.accuracy = correct ? 1 : dictationAccuracy(question.correct_answers[0] ?? "", learnerAnswer);
  return result;
}

export function dictationAccuracy(reference: string, typed: string) {
  const diff = wordDifferences(reference, typed);
  const expected = diff.filter((item) => item.kind !== "incorrect").length;
  if (!expected) return 0;
  return Math.round((diff.filter((item) => item.kind === "correct").length / expected) * 100) / 100;
}
