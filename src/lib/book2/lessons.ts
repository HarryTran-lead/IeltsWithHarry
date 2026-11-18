import { readFile } from "node:fs/promises";
import path from "node:path";
// Relative paths so vitest, which has no "@/" alias here, can load this module.
import catalog from "../../data/book2/catalog.json";
import { book2AnswerCorrect, requiredBook2WritingWords } from "../../features/learning/book2-progress";

/**
 * Book 2 lessons with answer keys live in content/book2/lessons, outside public/, and are read only here.
 * The browser gets a student projection; keys, explanations, evidence, models and transcripts are released
 * per question after the learner submits, as the C09 import policy requires.
 */
type Question = {
  question_id: string; item_type: string; prompt_en: string;
  answer: { kind: string; accepted?: string[]; model_en?: string; model_vi?: string; [key: string]: unknown };
  explanation_en?: string; explanation_vi?: string; evidence?: string; audio_id?: string;
  [key: string]: unknown;
};
type Audio = { id: string; transcript?: string; [key: string]: unknown };
export type Book2SourceLesson = {
  source_id: string; exercises: { questions: Question[]; [key: string]: unknown }[]; audios: Audio[]; [key: string]: unknown;
};

const slugs = new Set(catalog.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.slug)));
const folder = path.join(process.cwd(), "content/book2/lessons");

export function isBook2Slug(slug: string) {
  return slugs.has(slug);
}

export async function loadBook2Lesson(slug: string): Promise<Book2SourceLesson | null> {
  if (!slugs.has(slug)) return null;
  try { return JSON.parse(await readFile(path.join(folder, `${slug}.json`), "utf8")) as Book2SourceLesson; } catch { return null; }
}

const questionsOf = (lesson: Book2SourceLesson) => lesson.exercises.flatMap((exercise) => exercise.questions);

/** The lesson without anything that would answer a question before the learner has tried it. */
export function studentBook2Lesson(lesson: Book2SourceLesson) {
  return {
    ...lesson,
    audios: lesson.audios.map(({ transcript, ...audio }) => ({ ...audio, has_transcript: Boolean(transcript?.trim()) })),
    exercises: lesson.exercises.map((exercise) => ({
      ...exercise,
      questions: exercise.questions.map(({ explanation_en: _en, explanation_vi: _vi, evidence: _evidence, answer, ...question }) => {
        void _en; void _vi; void _evidence;
        return { ...question, answer: { kind: answer.kind, has_model: Boolean(answer.model_en?.trim()) } };
      }),
    })),
  };
}

export type Book2Verdict = { correct: boolean; accepted: string[]; explanation_vi?: string; explanation_en?: string; evidence?: string };

/** Grades submitted objective answers; open questions are self-assessed and never graded here. */
export function gradeBook2Answers(lesson: Book2SourceLesson, answers: Record<string, string>) {
  const verdicts: Record<string, Book2Verdict> = {};
  for (const question of questionsOf(lesson)) {
    const value = answers[question.question_id];
    if (typeof value !== "string" || !value.trim() || question.answer.kind !== "objective") continue;
    verdicts[question.question_id] = {
      correct: book2AnswerCorrect(question, value),
      accepted: question.answer.accepted ?? [],
      explanation_vi: question.explanation_vi, explanation_en: question.explanation_en, evidence: question.evidence,
    };
  }
  return verdicts;
}

/** The model answer of an open question, only once the learner's response meets the task's minimum. */
export function book2Model(lesson: Book2SourceLesson, questionId: string, response: string, recorded: boolean) {
  const question = questionsOf(lesson).find((item) => item.question_id === questionId);
  if (!question || question.answer.kind === "objective") return { error: "Câu hỏi không có bài mẫu." } as const;
  const words = response.trim() ? response.trim().split(/\s+/).length : 0;
  const minimum = requiredBook2WritingWords(question.item_type, question.prompt_en, lesson.source_id.toLowerCase());
  if ((!words && !recorded) || words < minimum) return { error: minimum ? `Bài mẫu mở khi bạn viết đủ ${minimum} từ.` : "Hãy trả lời trước khi xem bài mẫu." } as const;
  return { model_en: question.answer.model_en ?? "", model_vi: question.answer.model_vi ?? "", explanation_vi: question.explanation_vi ?? "" } as const;
}

/** A listening transcript, released after the learner has answered at least one question about that recording. */
export function book2Transcript(lesson: Book2SourceLesson, audioId: string, answers: Record<string, string>) {
  const audio = lesson.audios.find((item) => item.id === audioId);
  if (!audio?.transcript) return { error: "Bài nghe không có transcript." } as const;
  const tried = questionsOf(lesson).some((question) => question.audio_id === audioId && typeof answers[question.question_id] === "string" && answers[question.question_id].trim());
  if (!tried) return { error: "Hãy nghe và trả lời ít nhất một câu trước khi xem transcript." } as const;
  return { transcript: audio.transcript } as const;
}
