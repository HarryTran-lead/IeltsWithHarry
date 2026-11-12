import { createHash } from "node:crypto";
import { z } from "zod";

export const skillSchema = z.enum(["Reading", "Listening", "Writing", "Speaking"]);
const supportedTypes = new Set([
  "multiple_choice", "multiple-choice", "multiple_answers", "multiple-answers",
  "true_false_not_given", "true-false-not-given", "yes_no_not_given", "yes-no-not-given",
  "matching_headings", "matching-headings", "matching_information", "matching-information",
  "matching_features", "matching-features", "matching_sentence_endings", "matching-sentence-endings", "matching",
  "sentence_completion", "sentence-completion", "summary_completion", "summary-completion", "summary_completion_bank",
  "note_completion", "note-completion", "table_completion", "table-completion",
  "flow_chart_completion", "flowchart-completion", "diagram_labelling", "diagram-labelling",
  "short_answer", "short-answer", "map_labelling", "map-labelling", "plan_labelling", "plan-labelling", "form_completion", "form-completion", "speaking",
]);
const bilingual = { en: z.string().max(4000).default(""), vi: z.string().max(4000).default("") };
/**
 * A worked explanation in five steps (understand the question, word class, paraphrase,
 * evidence, final answer and trap), in English and Vietnamese. It carries the answer, so
 * like `answers` it never leaves the server before the attempt is graded.
 */
export const fiveStepSchema = z.object({
  understand: z.object(bilingual),
  wordClass: z.object(bilingual),
  paraphrase: z.object({ ...bilingual, pairs: z.array(z.object({ question: z.string().max(400), passage: z.string().max(600) })).max(12).default([]) }),
  evidence: z.object({ ...bilingual, quotes: z.array(z.object({ paragraph: z.string().max(40).default(""), quote: z.string().min(1).max(1200), role: z.string().max(40).default("supports"), exact: z.boolean().default(true) })).max(12).default([]) }),
  final: z.object({ ...bilingual, answer: z.string().max(200).default(""), trapEn: z.string().max(2000).default(""), trapVi: z.string().max(2000).default(""), tipEn: z.string().max(2000).default(""), tipVi: z.string().max(2000).default("") }),
});
export type FiveStep = z.infer<typeof fiveStepSchema>;

export const questionSchema = z.object({
  id: z.string().min(1), number: z.number().int().positive(),
  type: z.string().min(1), prompt: z.string().min(1), instructions: z.string().default(""),
  options: z.array(z.string()).default([]), answers: z.array(z.string()).default([]),
  explanation: z.string().default(""), wordLimit: z.string().optional(),
  mediaReference: z.string().optional(), mediaUrl: z.url().optional(),
  // Questions sharing a group form one "Choose TWO letters" item: each is answered with one letter,
  // and every distinct correct letter in the group earns one mark, in any order.
  group: z.string().optional(),
  fiveStep: fiveStepSchema.optional(),
});
export const sectionSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), passage: z.string().default(""),
  transcript: z.string().default(""), audioUrl: z.string().url().optional(),
  questions: z.array(questionSchema).default([]),
});
export const contentSchema = z.object({
  sections: z.array(sectionSchema).default([]), prompt: z.string().default(""),
  taskType: z.string().optional(), minimumWords: z.number().int().nonnegative().optional(),
  speakingPart: z.number().int().min(1).max(3).optional(),
  visual: z.unknown().optional(), figureDescription: z.string().optional(),
  mediaReference: z.string().optional(), imageUrl: z.url().optional(),
});
export type ExamContent = z.infer<typeof contentSchema>;
export type ExamQuestion = z.infer<typeof questionSchema>;
export type NormalizedExam = {
  externalId: string; skill: z.infer<typeof skillSchema>; format: string; mode: string;
  title: string; topic?: string; difficulty?: string; durationMinutes: number;
  sourceUrl: string; attribution: string; license: string; licenseUrl: string;
  aiGenerated: boolean; upstreamVersion: string; content: ExamContent;
};

export function validateExam(exam: NormalizedExam): string[] {
  const warnings: string[] = [];
  if (!exam.license || !exam.licenseUrl || !exam.sourceUrl) warnings.push("license_missing");
  if (!exam.title.trim()) warnings.push("title_missing");
  if (!contentSchema.safeParse(exam.content).success) warnings.push("content_invalid");
  const questions = exam.content.sections.flatMap((section) => section.questions);
  if (["Reading", "Listening"].includes(exam.skill) && !questions.length) warnings.push("questions_missing");
  if (new Set(questions.map((q) => q.id)).size !== questions.length) warnings.push("duplicate_question_id");
  for (const question of questions) {
    if (!question.prompt.trim()) warnings.push(`empty_question:${question.id}`);
    if (!supportedTypes.has(question.type)) warnings.push(`unsupported_question_type:${question.id}`);
    if (["Reading", "Listening"].includes(exam.skill) && !question.answers.length) warnings.push(`answer_key_missing:${question.id}`);
    if (question.type.includes("multiple") && question.options.length < 2) warnings.push(`options_missing:${question.id}`);
    if (question.mediaReference && !question.mediaUrl) warnings.push(`media_missing:${question.id}`);
  }
  if (exam.skill === "Reading" && exam.content.sections.some((s) => !s.passage)) warnings.push("passage_missing");
  if (exam.skill === "Listening" && exam.content.sections.some((s) => !s.audioUrl)) warnings.push("audio_missing");
  if (["synthetic_mock", "full_mock"].includes(exam.mode) && ["Reading", "Listening"].includes(exam.skill)) {
    const sections = exam.skill === "Reading" ? 3 : 4;
    if (exam.content.sections.length !== sections || questions.length !== 40) warnings.push("mock_incomplete");
  }
  if (["Writing", "Speaking"].includes(exam.skill) && !exam.content.prompt && !questions.length) warnings.push("prompt_missing");
  if (exam.content.mediaReference && !exam.content.imageUrl) warnings.push("media_missing");
  return [...new Set(warnings)];
}

export function contentHash(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function publicContent(content: ExamContent): ExamContent {
  return { ...content, sections: content.sections.map((section) => ({
    ...section, transcript: "", questions: section.questions.map((question) => { const visible = { ...question, answers: [], explanation: "" }; delete visible.fiveStep; return visible; }),
  })) };
}

export function scoreAnswers(content: ExamContent, answers: Record<string, string>) {
  const questions = content.sections.flatMap((s) => s.questions).filter((q) => q.answers.length);
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const optionKey = (v: string) => qOptionKey(v);
  // Correct letters still unclaimed in each "Choose TWO" group, so one letter cannot score twice.
  const unclaimed = new Map<string, Set<string>>();
  for (const q of questions) if (q.group) {
    const letters = unclaimed.get(q.group) ?? new Set<string>();
    q.answers.forEach((answer) => letters.add(normalize(answer)));
    unclaimed.set(q.group, letters);
  }
  const review = questions.map((q) => {
    const given = String(answers[q.id] ?? "");
    const selected = q.options.length ? optionKey(given) : given;
    const letters = q.group ? unclaimed.get(q.group) : undefined;
    const correct = letters
      ? letters.delete(normalize(selected))
      : /multiple[_-]answers/.test(q.type)
        ? q.answers.map(normalize).sort().join("|") === given.split(",").map((part) => normalize(optionKey(part))).filter(Boolean).sort().join("|")
        : q.answers.some((answer) => normalize(answer) === normalize(selected));
    return { id: q.id, given, correct, answers: q.answers, explanation: q.explanation, type: q.type, ...(q.fiveStep ? { fiveStep: q.fiveStep } : {}) };
  });
  return { score: review.filter((q) => q.correct).length, total: review.length, review };
}

/** Limit grading to the passage chosen when the attempt began. */
export function attemptContent(content: ExamContent, notes: Record<string, string> | null | undefined): ExamContent {
  const sectionId = notes?.__section;
  if (!sectionId) return content;
  const section = content.sections.find((item) => item.id === sectionId);
  return section ? { ...content, sections: [section] } : content;
}

export const readingFullMinutes = [50, 55, 60, 65, 70] as const;
export const readingPassageMinutes = [10, 15, 20, 25, 30] as const;
export const listeningFullMinutes = [30, 35, 40, 45] as const;
export const listeningPartMinutes = [10, 15, 20] as const;

export function attemptMinutes(skill: string, examMinutes: number, notes: Record<string, string> | null | undefined) {
  const selected = Number(notes?.__minutes);
  if (notes?.__section) {
    if (skill === "Reading") return readingPassageMinutes.some((value) => value === selected) ? selected : 20;
    return skill === "Listening" ? listeningPartMinutes.some((value) => value === selected) ? selected : 10 : examMinutes;
  }
  // Keep the duration of attempts started before the current time choices changed.
  if (skill === "Reading" && ([...readingFullMinutes, 30, 45] as number[]).includes(selected)) return selected;
  if (skill === "Listening" && listeningFullMinutes.some((value) => value === selected)) return selected;
  return examMinutes;
}
/** The scored key of an option: "G — text" → G, "iii — text" → iii, " — B. text" → B, "C. text" → C; plain keys pass through. */
export function qOptionKey(value: string) {
  const text = value.trim();
  return /^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—/.exec(text)?.[1] ?? /^—\s*([A-Z])\.\s/.exec(text)?.[1] ?? /^([A-Z])\.\s/.exec(text)?.[1] ?? text;
}

/**
 * Why explanations cannot be attached to this content: a question that does not exist,
 * or an answer the live key does not accept. A choose-several set must equal the keys of
 * its whole group, in any order. An empty list means every item matches.
 */
export function explanationMismatches(content: ExamContent, items: { questionId: string; answers: string[] }[]) {
  const questions = new Map(content.sections.flatMap((section) => section.questions).map((question) => [question.id, question]));
  const normal = (value: string) => qOptionKey(value).trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const mismatches: string[] = [];
  for (const item of items) {
    const question = questions.get(item.questionId);
    if (!question) { mismatches.push(`${item.questionId}: không có câu này trong đề đang chạy`); continue; }
    const accepted = new Set((question.group ? [...questions.values()].filter((other) => other.group === question.group).flatMap((other) => other.answers) : question.answers).map(normal));
    const wanted = item.answers.map(normal);
    const same = question.group ? wanted.length === accepted.size && wanted.every((value) => accepted.has(value)) : wanted.length > 0 && wanted.every((value) => accepted.has(value));
    if (!same) mismatches.push(`${item.questionId}: lời giải ghi “${item.answers.join(", ")}”, đề đang chạy chấm “${[...accepted].join(", ")}”`);
  }
  return mismatches;
}
