import { describe, expect, it } from "vitest";
import { diagnosticQuestions, gradeDiagnostic, gradeLab, labItem, labsForLesson, labsForLevel } from "../src/lib/grammar/labs-server";
import { labKinds } from "../src/lib/grammar/labs-types";
import { grammarLevels } from "../src/lib/grammar/types";

// Private-bank fields that must never reach the browser before an answer is submitted.
const SECRET = /"(correct_index|correct_answer|correctIndex|rationales_vi|option_rationales_vi|option_feedback_vi|reference_answers_en|reference_model_en|reference_en|error_slots|reference_error_slots|rubric_vi)"/;

describe("Grammar practice labs", () => {
  it("lists every lab bank for the six levels", () => {
    const totals = Object.fromEntries(labKinds.map((lab) => [lab, grammarLevels.reduce((sum, level) => sum + labsForLevel(level).labs[lab].length, 0)]));
    expect(totals).toEqual({ clinic: 100, contrast: 150, transform: 45, context: 360, transfer: 540 });
  });

  it("projects items without answer keys or reference answers", { timeout: 60_000 }, () => {
    for (const level of grammarLevels) {
      for (const lab of labKinds) {
        for (const summary of labsForLevel(level).labs[lab]) {
          const item = labItem(lab, summary.id);
          expect(item, summary.id).not.toBeNull();
          expect(JSON.stringify(item), summary.id).not.toMatch(SECRET);
        }
      }
      expect(JSON.stringify(diagnosticQuestions(level))).not.toMatch(SECRET);
    }
  });

  it("links labs and the concept map to a lesson", () => {
    const lesson = labsForLesson("A2-23");
    expect(lesson.concept?.id).toBe("GC-A2-23");
    expect(lesson.concept?.skills.length).toBeGreaterThan(0);
    expect(lesson.labs.clinic.map((x) => x.id)).toContain("M22-CL-A2-23");
  });

  it("grades choices on the server and keeps open answers as self-review", () => {
    const clinic = labItem("clinic", "M22-CL-A2-23");
    if (!clinic || clinic.lab !== "clinic") throw new Error("clinic missing");
    const results = [0, 1, 2].map((answer) => gradeLab("clinic", clinic.id, clinic.practice[0].id, answer));
    expect(results.filter((r) => r?.kind === "choice" && r.correct)).toHaveLength(1);
    expect(gradeLab("clinic", clinic.id, clinic.practice[0].id, 7)).toBeNull();
    const open = gradeLab("transform", "M24-F-A1-OWNERSHIP", "M24-ST-A1-OWNERSHIP-01", "This camera belongs to Mia.");
    expect(open).toMatchObject({ kind: "open", matchedReference: true });
    const other = gradeLab("transform", "M24-F-A1-OWNERSHIP", "M24-ST-A1-OWNERSHIP-01", "Mia owns this camera.");
    expect(other).toMatchObject({ kind: "open", matchedReference: false });
  });

  it("scores the diagnostic without granting access", () => {
    const questions = diagnosticQuestions("B1");
    expect(questions.length).toBeGreaterThanOrEqual(10);
    const result = gradeDiagnostic("B1", Object.fromEntries(questions.map((q) => [q.id, 0])), ["A1", "A2", "B1"]);
    expect(result?.total).toBe(questions.length);
    expect(gradeDiagnostic("B1", { "M21-DIAG-NOPE": 0 }, ["A1"])).toBeNull();
  });
});
