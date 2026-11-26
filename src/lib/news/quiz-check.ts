import { normalizeAnswer } from "./enrichment";

export type QuizKey = {
  id: string;
  question_type: string;
  prompt?: string;
  supporting_sentence: string;
  correct_index: number | null;
  accepted_answers: string[] | null;
  explanation: string;
  option_notes: string[] | null;
};
export type QuizReview = {
  id: string; type: string; correct: boolean; correctIndex: number | null; acceptedAnswers: string[] | null;
  explanation: string; optionNotes: string[] | null; supportingSentence: string;
};

const HEDGE = /^(approximately|about|around|roughly|nearly|almost|some) /;
/**
 * Same rule as SQL `news_answer_matches`: a hedge in the key is optional ("approximately 300" accepts "300"),
 * and one or two words repeated from the question are ignored ("44 brands" for "How many brands…?").
 * Spelling, singular/plural and other extra words still count as wrong.
 */
export function answerMatches(answer: string, accepted: string, prompt = "") {
  const given = normalizeAnswer(answer), key = normalizeAnswer(accepted);
  if (!given || !key) return false;
  if (given === key) return true;
  const core = key.replace(HEDGE, "");
  if (core !== key && given === core) return true;
  const promptWords = new Set(normalizeAnswer(prompt).split(" ").filter(Boolean));
  const keyWords = new Set(key.split(" "));
  const kept: string[] = [];
  let dropped = 0;
  for (const word of given.split(" ")) {
    const fromPrompt = promptWords.has(word) || promptWords.has(`${word}s`) || (word.length > 3 && word.endsWith("s") && promptWords.has(word.slice(0, -1)));
    if (!keyWords.has(word) && fromPrompt) dropped += 1; else kept.push(word);
  }
  if (dropped < 1 || dropped > 2 || !kept.length) return false;
  const trimmed = kept.join(" ");
  return trimmed === key || trimmed === core;
}

/** Parses `{ questionId: choice }` for a practice round of 1–30 questions; returns null when anything is malformed. */
export function parsePracticeAnswers(value: unknown): Record<string, number | string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > 30) return null;
  const answers: Record<string, number | string> = {};
  for (const [id, answer] of entries) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    if (typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer <= 3) answers[id] = answer;
    else if (typeof answer === "string" && answer.trim() && answer.length <= 120) answers[id] = answer.trim();
    else return null;
  }
  return answers;
}

/** Grades the answered questions only, in the quiz's own order. Returns null if an answer is the wrong kind for its question. */
export function gradePractice(keys: QuizKey[], answers: Record<string, number | string>): QuizReview[] | null {
  const review: QuizReview[] = [];
  for (const key of keys) {
    const answer = answers[key.id];
    if (answer === undefined) continue;
    let correct: boolean;
    if (key.correct_index !== null) {
      if (typeof answer !== "number") return null;
      correct = answer === key.correct_index;
    } else {
      if (typeof answer !== "string" || !normalizeAnswer(answer)) return null;
      correct = (key.accepted_answers ?? []).some((accepted) => answerMatches(answer, accepted, key.prompt ?? ""));
    }
    review.push({ id: key.id, type: key.question_type, correct, correctIndex: key.correct_index, acceptedAnswers: key.accepted_answers,
      explanation: key.explanation, optionNotes: key.option_notes, supportingSentence: key.supporting_sentence });
  }
  return review.length === Object.keys(answers).length ? review : null;
}
