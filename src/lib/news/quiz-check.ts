import { normalizeAnswer } from "./enrichment";

export type QuizKey = {
  id: string;
  question_type: string;
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
      correct = (key.accepted_answers ?? []).some((accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer));
    }
    review.push({ id: key.id, type: key.question_type, correct, correctIndex: key.correct_index, acceptedAnswers: key.accepted_answers,
      explanation: key.explanation, optionNotes: key.option_notes, supportingSentence: key.supporting_sentence });
  }
  return review.length === Object.keys(answers).length ? review : null;
}
