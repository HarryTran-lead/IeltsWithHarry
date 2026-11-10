import { z } from "zod";

export const evaluationRowSchema = z.object({
  sample_id: z.string().min(1), task_type: z.enum(["academic_task1", "academic_task2"]),
  human_band: z.number().min(0).max(9), predicted_band: z.number().min(0).max(9),
}).strict();
export type EvaluationRow = z.infer<typeof evaluationRowSchema>;

export function evaluateBands(rows: EvaluationRow[]) {
  if (!rows.length) throw new Error("No independently labeled rows supplied");
  const errors = rows.map((row) => Math.abs(row.predicted_band - row.human_band));
  const n = rows.length;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const observed = rows.reduce((sum, row) => sum + (row.predicted_band - row.human_band) ** 2, 0) / n;
  const human = rows.map((row) => row.human_band), model = rows.map((row) => row.predicted_band);
  const expected = human.reduce((sum, h) => sum + model.reduce((inner, m) => inner + (h - m) ** 2, 0), 0) / (n * n);
  return {
    sample_size: n,
    exact_rate: errors.filter((error) => error < 1e-9).length / n,
    within_0_5_rate: errors.filter((error) => error <= 0.5 + 1e-9).length / n,
    within_1_0_rate: errors.filter((error) => error <= 1 + 1e-9).length / n,
    mae: mean(errors), rmse: Math.sqrt(mean(errors.map((error) => error ** 2))),
    qwk: expected === 0 ? (observed === 0 ? 1 : null) : 1 - observed / expected,
  };
}

export function evaluateByTask(rows: EvaluationRow[]) {
  const validated = rows.map((row) => evaluationRowSchema.parse(row));
  if (new Set(validated.map((row) => row.sample_id)).size !== validated.length) throw new Error("Duplicate sample IDs");
  return Object.fromEntries((["academic_task1", "academic_task2"] as const).map((task) => {
    const subset = validated.filter((row) => row.task_type === task);
    return [task, subset.length ? evaluateBands(subset) : null];
  }));
}
