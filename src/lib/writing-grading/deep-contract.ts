import { z } from "zod";
import { criterionKeys, type TaskType } from "./contract";

export const deepReportVersion = "1.0";
export const deepReportSchema = z.object({
  coverage: z.array(z.object({
    requirement_vi: z.string().min(1).max(200),
    status: z.enum(["covered", "partial", "missing"]),
    evidence_quote: z.string().min(1).max(220).nullable(),
    action_vi: z.string().min(1).max(350),
  })).min(1).max(3),
  paragraphs: z.array(z.object({
    anchor_quote: z.string().min(1).max(220),
    role_vi: z.string().min(1).max(140),
    strength_vi: z.string().min(1).max(350),
    revision_vi: z.string().min(1).max(350),
  })).min(1).max(3),
  lexical: z.array(z.object({
    original_text: z.string().min(1).max(140),
    replacement: z.string().min(1).max(140),
    why_vi: z.string().min(1).max(300),
    example_en: z.string().min(1).max(280),
  })).max(4),
  grammar: z.array(z.object({
    anchor_quote: z.string().min(1).max(180),
    pattern_vi: z.string().min(1).max(180),
    fix_vi: z.string().min(1).max(280),
    micro_practice_vi: z.string().min(1).max(300),
  })).max(2),
  error_audit: z.array(z.object({
    error_index: z.number().int().nonnegative(),
    verdict: z.enum(["valid", "optional", "uncertain"]),
    reason_vi: z.string().min(1).max(280),
  })).max(6),
  drills: z.array(z.object({
    criterion: z.enum(["TA", "TR", "CC", "LR", "GRA"]),
    task_vi: z.string().min(1).max(320),
    check_vi: z.string().min(1).max(280),
  })).length(2),
  priority_vi: z.string().min(1).max(450),
}).strict();

export type DeepReport = z.infer<typeof deepReportSchema>;

export function verifyDeepReport(input: unknown, taskType: TaskType, essay: string, errorCount: number) {
  const report = deepReportSchema.parse(input);
  const inEssay = (quote: string | null) => quote === null || essay.includes(quote);
  if (report.coverage.some((item) => !inEssay(item.evidence_quote) || (item.status === "missing" && item.evidence_quote !== null))) throw new Error("DEEP_COVERAGE_QUOTE_INVALID");
  if (report.paragraphs.some((item) => !inEssay(item.anchor_quote))) throw new Error("DEEP_PARAGRAPH_QUOTE_INVALID");
  if (report.lexical.some((item) => !inEssay(item.original_text))) throw new Error("DEEP_LEXICAL_QUOTE_INVALID");
  if (report.grammar.some((item) => !inEssay(item.anchor_quote))) throw new Error("DEEP_GRAMMAR_QUOTE_INVALID");
  const indices = report.error_audit.map((item) => item.error_index);
  if (indices.some((index) => index >= errorCount) || new Set(indices).size !== indices.length) throw new Error("DEEP_AUDIT_INDEX_INVALID");
  const allowed = new Set(criterionKeys[taskType]);
  if (report.drills.some((item) => !allowed.has(item.criterion))) throw new Error("DEEP_DRILL_CRITERION_INVALID");
  return { ...report, version: deepReportVersion, task_type: taskType, estimated_only: true as const };
}
