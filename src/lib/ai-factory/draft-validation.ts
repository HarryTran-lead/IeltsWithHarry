import { contentSchema, validateExam, type NormalizedExam } from "../ielts-bank/schema";

export type DraftEvidence = Record<string, string>;

/** Remove only decorative edge ellipses and recover the literal passage span. */
export function normalizeEvidenceQuote(passage: string, quoted: string): string {
  const trimmed = quoted.trim().replace(/^(?:\.{3,}|…)\s*/, "").replace(/\s*(?:\.{3,}|…)$/, "").trim();
  if (!trimmed) return quoted;
  const index = passage.toLocaleLowerCase("en").indexOf(trimmed.toLocaleLowerCase("en"));
  return index < 0 ? quoted : passage.slice(index, index + trimmed.length);
}

/** Bank-level checks every factory draft must pass on top of its kind's format gate (kinds.ts).
 *  Human approval is still required before publishing. */
export function validateFactoryDraft(exam: NormalizedExam): string[] {
  const warnings = validateExam(exam).filter((warning) => !(exam.skill === "Listening" && warning === "audio_missing"));
  if (!contentSchema.safeParse(exam.content).success) warnings.push("content_invalid");
  if (exam.mode !== "practice") warnings.push("practice_mode_required");
  if (!exam.aiGenerated) warnings.push("ai_generated_flag_required");
  return [...new Set(warnings)];
}
