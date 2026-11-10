import { z } from "zod";

export const rubricVersion = "ielts-writing-public-2026-11";
export const schemaVersion = "1.0";
export type TaskType = "academic_task1" | "academic_task2";
export const criterionKeys = {
  academic_task1: ["TA", "CC", "LR", "GRA"],
  academic_task2: ["TR", "CC", "LR", "GRA"],
} as const;

const evidenceSchema = z.object({ quote: z.string().min(1).max(500), start: z.number().int().nonnegative(), end: z.number().int().positive(), note_vi: z.string().min(1).max(1000), fact_ref: z.string().max(100).optional() });
const criterionSchema = z.object({
  key: z.enum(["TA", "TR", "CC", "LR", "GRA"]),
  score_raw: z.number().min(0).max(9),
  reason_vi: z.string().min(1).max(2000),
  reason_en: z.string().min(1).max(2000),
  evidence: z.array(evidenceSchema).min(1).max(6),
  next_step_vi: z.string().min(1).max(1000),
});
const errorSchema = z.object({
  category: z.enum(["grammar", "spelling", "punctuation", "lexical", "cohesion", "task_response", "data_accuracy", "style"]),
  severity: z.enum(["minor", "moderate", "major"]),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), original_text: z.string().min(1).max(500),
  suggestion: z.string().max(500).nullable(), explanation_vi: z.string().min(1).max(1000), explanation_en: z.string().min(1).max(1000),
  affected_criterion: z.enum(["TA", "TR", "CC", "LR", "GRA"]).nullable(),
  fact_ref: z.string().max(100).optional(),
});

export const modelDraftSchema = z.object({
  criteria: z.array(criterionSchema).length(4),
  errors: z.array(errorSchema).max(20),
  strengths_vi: z.array(z.string().max(500)).max(5),
  improvements_vi: z.array(z.string().max(500)).min(1).max(5),
  summary_vi: z.string().min(1).max(2000), summary_en: z.string().min(1).max(2000),
  revised_paragraph: z.string().max(3000).nullable(),
}).strict();
export type ModelDraft = z.infer<typeof modelDraftSchema>;

export function countEnglishWords(essay: string) {
  return essay.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function displayHalfBand(raw: number) {
  return Math.min(9, Math.max(0, Math.round(raw * 2) / 2));
}

export function combineWritingBands(task1Raw: number | null, task2Raw: number | null) {
  if (task1Raw === null || task2Raw === null) return null;
  const raw = (task1Raw + 2 * task2Raw) / 3;
  return { raw, display: displayHalfBand(raw) };
}

/** Reject model claims that cannot be tied to the exact immutable essay snapshot. Offsets are UTF-16. */
export function verifyModelDraft(input: unknown, taskType: TaskType, essay: string, verifiedFactIds: string[]) {
  const draft = modelDraftSchema.parse(input);
  const expected = criterionKeys[taskType];
  if (draft.criteria.some((criterion, index) => criterion.key !== expected[index])) throw new Error("CRITERIA_MISMATCH");
  const factIds = new Set(verifiedFactIds);
  const anchored = (start: number, end: number, quote: string) => start < end && end <= essay.length && essay.slice(start, end) === quote;
  for (const criterion of draft.criteria) for (const evidence of criterion.evidence) {
    if (!anchored(evidence.start, evidence.end, evidence.quote)) throw new Error("EVIDENCE_OFFSET_MISMATCH");
    if (evidence.fact_ref && !factIds.has(evidence.fact_ref)) throw new Error("UNVERIFIED_FACT_REFERENCE");
  }
  for (const error of draft.errors) {
    if (!anchored(error.start, error.end, error.original_text)) throw new Error("ERROR_OFFSET_MISMATCH");
    if (error.category === "data_accuracy" && (!error.fact_ref || !factIds.has(error.fact_ref))) throw new Error("UNVERIFIED_DATA_CLAIM");
  }
  const taskBandRaw = draft.criteria.reduce((sum, criterion) => sum + criterion.score_raw, 0) / 4;
  return {
    schema_version: schemaVersion, task_type: taskType, estimated_only: true,
    source_facts_status: taskType === "academic_task1" ? "verified" : "not_applicable",
    task_band_raw: taskBandRaw, task_band_display: displayHalfBand(taskBandRaw),
    criteria: draft.criteria.map((criterion) => ({ ...criterion, score_display: displayHalfBand(criterion.score_raw) })),
    errors: draft.errors, strengths_vi: draft.strengths_vi, improvements_vi: draft.improvements_vi,
    summary_vi: draft.summary_vi, summary_en: draft.summary_en, revised_paragraph: draft.revised_paragraph,
  };
}
