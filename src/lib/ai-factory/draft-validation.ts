import { contentSchema, validateExam, type NormalizedExam } from "../ielts-bank/schema";

export type DraftEvidence = Record<string, string>;

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);
const comparable = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");

/** Remove only decorative edge ellipses and recover the literal passage span. */
export function normalizeEvidenceQuote(passage: string, quoted: string): string {
  const trimmed = quoted.trim().replace(/^(?:\.{3,}|…)\s*/, "").replace(/\s*(?:\.{3,}|…)$/, "").trim();
  if (!trimmed) return quoted;
  const index = passage.toLocaleLowerCase("en").indexOf(trimmed.toLocaleLowerCase("en"));
  return index < 0 ? quoted : passage.slice(index, index + trimmed.length);
}

/** Conservative machine checks. Human approval is still required before publishing. */
export function validateFactoryDraft(exam: NormalizedExam, evidence: DraftEvidence = {}): string[] {
  const warnings = validateExam(exam).filter((warning) => !(exam.skill === "Listening" && warning === "audio_missing"));
  const parsed = contentSchema.safeParse(exam.content);
  if (!parsed.success) return [...new Set([...warnings, "content_invalid"])];
  const content = parsed.data;
  if (exam.mode !== "practice") warnings.push("practice_mode_required");
  if (exam.skill === "Reading") {
    if (content.sections.length !== 1) warnings.push("reading_section_count");
    const section = content.sections[0];
    if (section) {
      const length = words(section.passage).length;
      if (length < 500 || length > 1300) warnings.push("reading_passage_length");
      if (section.questions.length !== 10) warnings.push("reading_question_count");
      if (new Set(section.questions.map((question) => comparable(question.prompt))).size !== section.questions.length) warnings.push("duplicate_question_prompt");
      if (section.questions.filter((question) => question.type === "multiple_choice").length !== 5 || section.questions.filter((question) => question.type === "short_answer").length !== 5) warnings.push("reading_question_balance");
      for (const question of section.questions) {
        const quote = evidence[question.id]?.trim() || "";
        if (quote.length < 15 || !comparable(section.passage).includes(comparable(quote))) warnings.push(`evidence_missing:${question.id}`);
        if (!question.explanation.trim()) warnings.push(`explanation_missing:${question.id}`);
        if (question.type === "short_answer" && !question.answers.some((answer) => comparable(quote).includes(comparable(answer)))) warnings.push(`answer_not_in_evidence:${question.id}`);
        if (question.type === "multiple_choice" && (question.options.length !== 4 || !question.answers.some((answer) => /^[A-D]$/.test(answer)))) warnings.push(`mcq_invalid:${question.id}`);
      }
    }
  }
  if (exam.skill === "Writing") {
    if (!/task\s*2/i.test(content.taskType || "")) warnings.push("writing_task_type");
    if (content.minimumWords !== 250) warnings.push("writing_minimum_words");
    if (words(content.prompt).length < 30 || words(content.prompt).length > 180 || !content.prompt.includes("?")) warnings.push("writing_prompt_invalid");
  }
  if (exam.skill === "Speaking") {
    if (content.speakingPart !== 2) warnings.push("speaking_part");
    if (!/describe/i.test(content.prompt) || words(content.prompt).length < 25) warnings.push("speaking_cue_card_invalid");
    const questions = content.sections.flatMap((section) => section.questions);
    if (questions.length < 3 || questions.length > 8 || questions.some((question) => question.type !== "speaking" || !question.prompt.endsWith("?"))) warnings.push("speaking_followups_invalid");
  }
  if (exam.skill === "Listening") {
    if (content.sections.length !== 1 || content.sections[0]?.questions.length !== 10) warnings.push("listening_question_count");
    if (words(content.sections[0]?.transcript || "").length < 350) warnings.push("listening_script_short");
    if (new Set(content.sections[0]?.questions.map((question) => comparable(question.prompt))).size !== content.sections[0]?.questions.length) warnings.push("duplicate_question_prompt");
  }
  return [...new Set(warnings)];
}
