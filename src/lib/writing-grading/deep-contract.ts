import { z } from "zod";
import { criterionKeys, type TaskType } from "./contract";

export const deepReportVersion = "1.0";
export const deepReportSchema = z.object({
  coverage: z.array(z.object({
    requirement_vi: z.string().min(1).max(200),
    status: z.enum(["covered", "partial", "missing"]),
    evidence_quote: z.string().min(1).max(220).nullable(),
    action_vi: z.string().min(1).max(350),
  })).min(1).max(5),
  paragraphs: z.array(z.object({
    anchor_quote: z.string().min(1).max(220),
    role_vi: z.string().min(1).max(140),
    strength_vi: z.string().min(1).max(350),
    revision_vi: z.string().min(1).max(350),
  })).min(1).max(5),
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
  const allowed = new Set(criterionKeys[taskType]);
  const coverage = report.coverage.map((item) => {
    if (item.status === "missing") return { ...item, evidence_quote: null };
    if (!inEssay(item.evidence_quote) || (item.status === "covered" && !item.evidence_quote)) {
      return { ...item, status: "partial" as const, evidence_quote: null };
    }
    return item;
  });
  const paragraphs = report.paragraphs.filter((item) => inEssay(item.anchor_quote));
  const lexical = report.lexical.filter((item) => inEssay(item.original_text));
  const grammar = report.grammar.filter((item) => inEssay(item.anchor_quote));
  const seen = new Set<number>();
  const error_audit = report.error_audit.filter((item) => {
    if (item.error_index >= errorCount || seen.has(item.error_index)) return false;
    seen.add(item.error_index);
    return true;
  });
  const drills = report.drills.filter((item) => allowed.has(item.criterion));
  const omitted_count = report.paragraphs.length - paragraphs.length + report.lexical.length - lexical.length
    + report.grammar.length - grammar.length + report.error_audit.length - error_audit.length
    + report.drills.length - drills.length
    + report.coverage.filter((item, index) => item.evidence_quote !== coverage[index].evidence_quote).length;
  return { ...report, coverage, paragraphs, lexical, grammar, error_audit, drills, omitted_count,
    version: deepReportVersion, task_type: taskType, estimated_only: true as const };
}
