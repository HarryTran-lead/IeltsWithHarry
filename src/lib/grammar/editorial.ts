import "server-only";
import type { GrammarLevel } from "./types";

const loaders = {
  A1: () => import("@/data/grammar-editorial/A1.json"),
  A2: () => import("@/data/grammar-editorial/A2.json"),
  B1: () => import("@/data/grammar-editorial/B1.json"),
  B2: () => import("@/data/grammar-editorial/B2.json"),
  C1: () => import("@/data/grammar-editorial/C1.json"),
  C2: () => import("@/data/grammar-editorial/C2.json"),
};

type SourceQuestion = {
  id: string; stage: string; type: string; instruction_vi?: string; prompt_en: string;
  translation_vi?: string | null; options?: string[]; hint_vi?: string;
  chunks?: (string | { text: string })[]; segments?: string[]; tokens?: (string | { text: string })[];
  correct_answer: string; accepted_answers?: string[]; explanation_correct_vi?: string;
  explanation_wrong_vi?: string; feedback_on_wrong_vi?: string; error_tag?: string;
  option_rationales_vi?: Record<string, string>; auto_gradable?: boolean;
  grading?: Record<string, unknown>; publishable: boolean;
};

type SourceLesson = {
  id?: string; lesson_id?: string; title?: string; name_en?: string;
  sections?: Record<string, unknown>[];
  common_errors?: { wrong: string; correct: string; why_vi: string }[];
  additional_common_errors?: { wrong: string; correct: string; why_vi: string }[];
  exceptions?: string[]; usage_caveats_vi?: string[];
  learn?: { title?: string; objectives_vi?: string[]; rules?: Record<string, unknown>[]; caveats_vi?: string[]; misconceptions?: { wrong: string; correct: string; why_vi: string }[]; exception_notes_vi?: string[] };
  learning_objectives?: string[];
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
  const { lesson, questions } = source;
  const sections = lesson.sections ?? lesson.learn?.rules ?? [];
  return {
    guide: {
      code: lesson.id ?? lesson.lesson_id,
      title: lesson.title ?? lesson.learn?.title ?? lesson.name_en,
      objectives: lesson.learning_objectives ?? lesson.learn?.objectives_vi ?? [],
      sections: sections.map((part) => ({
        heading: part.heading ?? part.heading_en ?? part.function_vi ?? "Quy tắc",
        formula: part.formula ?? part.formula_or_pattern ?? "",
        explanation: part.explanation_vi ?? "",
        examples: part.examples ?? [],
        mistake: part.common_mistake ?? null,
        note: part.exception_note_vi ?? part.note_vi ?? "",
      })),
      mistakes: [...(lesson.common_errors ?? []), ...(lesson.additional_common_errors ?? []), ...(lesson.learn?.misconceptions ?? [])],
      caveats: [...(lesson.exceptions ?? []), ...(lesson.usage_caveats_vi ?? []), ...(lesson.learn?.caveats_vi ?? []), ...(lesson.learn?.exception_notes_vi ?? [])],
    },
    items: questions.map((question) => ({
      id: question.id,
      stage: question.stage,
      type: question.type === "fill" ? "fill_blank" : question.type === "sentence_order" ? "sentence_ordering" : question.type,
      instruction: question.instruction_vi ?? "",
      prompt: question.prompt_en,
      translation: question.translation_vi ?? null,
      options: question.options ?? null,
      chunks: (question.chunks ?? question.segments ?? question.tokens ?? []).map((chunk) => typeof chunk === "string" ? chunk : chunk.text),
      hint: question.hint_vi ?? null,
      publishable: question.publishable,
    })),
  };
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
    feedback: correct === false ? question.option_rationales_vi?.[answer] ?? question.feedback_on_wrong_vi ?? question.explanation_wrong_vi ?? "" : "",
    errorTag: correct === false ? question.error_tag ?? null : null,
    publishable: question.publishable,
  };
}
