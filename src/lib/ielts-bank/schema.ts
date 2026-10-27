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
export const questionSchema = z.object({
  id: z.string().min(1), number: z.number().int().positive(),
  type: z.string().min(1), prompt: z.string().min(1), instructions: z.string().default(""),
  options: z.array(z.string()).default([]), answers: z.array(z.string()).default([]),
  explanation: z.string().default(""), wordLimit: z.string().optional(),
  mediaReference: z.string().optional(), mediaUrl: z.url().optional(),
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
    ...section, transcript: "", questions: section.questions.map((question) => ({ ...question, answers: [], explanation: "" })),
  })) };
}

export function scoreAnswers(content: ExamContent, answers: Record<string, string>) {
  const questions = content.sections.flatMap((s) => s.questions).filter((q) => q.answers.length);
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const optionKey = (v: string) => qOptionKey(v);
  const review = questions.map((q) => {
    const given = String(answers[q.id] ?? "");
    const selected = q.options.length ? optionKey(given) : given;
    const correct = /multiple[_-]answers/.test(q.type)
      ? q.answers.map(normalize).sort().join("|") === given.split(",").map((part) => normalize(optionKey(part))).filter(Boolean).sort().join("|")
      : q.answers.some((answer) => normalize(answer) === normalize(selected));
    return { id: q.id, given, correct, answers: q.answers, explanation: q.explanation, type: q.type };
  });
  return { score: review.filter((q) => q.correct).length, total: review.length, review };
}
/** The scored key of an option: "G — text" → G, "iii — text" → iii, " — B. text" → B, "C. text" → C; plain keys pass through. */
export function qOptionKey(value: string) {
  const text = value.trim();
  return /^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—/.exec(text)?.[1] ?? /^—\s*([A-Z])\.\s/.exec(text)?.[1] ?? /^([A-Z])\.\s/.exec(text)?.[1] ?? text;
}
