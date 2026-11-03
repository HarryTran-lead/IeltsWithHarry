import "server-only";
import type { GrammarLevel } from "./types";
import { normalizeGuide, normalizeItem, wrongFeedback, type SourceLesson, type SourceQuestion } from "./normalize";

const loaders = {
  A1: () => import("@/data/grammar-editorial/A1.json"),
  A2: () => import("@/data/grammar-editorial/A2.json"),
  B1: () => import("@/data/grammar-editorial/B1.json"),
  B2: () => import("@/data/grammar-editorial/B2.json"),
  C1: () => import("@/data/grammar-editorial/C1.json"),
  C2: () => import("@/data/grammar-editorial/C2.json"),
};

function codeLevel(code: string): GrammarLevel | null {
  const match = /^(A1|A2|B1|B2|C1|C2)-\d{2}$/.exec(code);
  return match ? match[1] as GrammarLevel : null;
}

export async function loadEditorialLesson(code: string) {
  const level = codeLevel(code);
  if (!level) return null;
  const levelData = (await loaders[level]()).default as unknown as Record<string, { lesson: SourceLesson; questions: SourceQuestion[] }>;
  return levelData[code] ?? null;
}

export function publicEditorialLesson(source: NonNullable<Awaited<ReturnType<typeof loadEditorialLesson>>>) {
  return { guide: normalizeGuide(source.lesson), items: source.questions.map(normalizeItem) };
}

function normalizeAnswer(value: string, grading: Record<string, unknown> = {}) {
  let result = value.trim().replace(/\s+/g, " ");
  result = result.replace(/\s*—\s*/g, "—");
  if (grading.normalize_apostrophes !== false && grading.normalise_apostrophes !== false) {
    result = result.replace(/[‘’ʼ`]/g, "'");
  }
  if (grading.ignore_final_punctuation !== false && grading.ignore_terminal_punctuation !== false) {
    result = result.replace(/[.!?。]+$/u, "").trim();
  }
  if (grading.case_insensitive !== false && grading.ignore_case !== false) result = result.toLocaleLowerCase("en");
  return result;
}

export function gradeEditorialAnswer(question: SourceQuestion, answer: string) {
  const response = normalizeAnswer(answer, question.grading);
  const accepted = [question.correct_answer, ...(question.accepted_answers ?? [])];
  const isChoice = ["mcq", "error_choice"].includes(question.type);
  const validChoice = !isChoice || (question.options ?? []).some((option) => normalizeAnswer(option, question.grading) === response);
  const correct = question.auto_gradable === false || question.auto_gradable == null
    ? null
    : validChoice && accepted.some((candidate) => normalizeAnswer(candidate, question.grading) === response);
  return {
    correct,
    referenceAnswer: question.correct_answer,
    explanation: question.explanation_correct_vi ?? "",
    feedback: correct === false ? wrongFeedback(question, answer) : "",
    errorTag: correct === false ? question.error_tag ?? null : null,
    publishable: question.publishable,
  };
}
