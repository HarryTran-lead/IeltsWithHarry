import { describe, expect, it } from "vitest";
import { evaluateByTask } from "../src/lib/writing-grading/evaluation";

describe("offline Writing evaluation (synthetic labels only)", () => {
  it("reports measured task-specific counts and never creates metrics for missing tasks", () => {
    const result = evaluateByTask([
      { sample_id: "synthetic-1", task_type: "academic_task1", human_band: 6, predicted_band: 6 },
      { sample_id: "synthetic-2", task_type: "academic_task1", human_band: 7, predicted_band: 6.5 },
    ]);
    expect(result.academic_task1).toMatchObject({ sample_size: 2, exact_rate: 0.5, within_0_5_rate: 1, mae: 0.25 });
    expect(result.academic_task2).toBeNull();
  });
  it("rejects duplicate sample IDs", () => {
    const row = { sample_id: "duplicate", task_type: "academic_task2" as const, human_band: 6, predicted_band: 6 };
    expect(() => evaluateByTask([row, row])).toThrow("Duplicate sample IDs");
  });
});
