import { describe, expect, it } from "vitest";
import { evaluateBook2Progress, requiredBook2WritingWords, type Book2ScoredItem } from "./book2-progress";

const questions: Book2ScoredItem[] = [
  { question_id: "objective", answer: { kind: "objective", accepted: ["science"] } },
  { question_id: "writing", answer: { kind: "self_assessment" } },
];

describe("Book 2 progress", () => {
  it("does not mark a mixed lesson as mastered after only the objective answer", () => {
    const result = evaluateBook2Progress(questions, { objective: "Science" }, { objective: true }, {});
    expect(result.mastered).toBe(false);
    expect(result.completedCount).toBe(1);
    expect(result.problems.map((item) => item.question_id)).toEqual(["writing"]);
  });

  it("requires explicit self-rating and keeps low-rated writing in review", () => {
    const answers = { objective: "science", writing: "My essay" };
    const checked = { objective: true, writing: true };
    const low = evaluateBook2Progress(questions, answers, checked, { writing: 2 });
    expect(low.mastered).toBe(false);
    expect(low.needsReview).toBe(true);
    expect(low.problems.map((item) => item.question_id)).toEqual(["writing"]);
    const ready = evaluateBook2Progress(questions, answers, checked, { writing: 3 });
    expect(ready.mastered).toBe(true);
    expect(ready.needsReview).toBe(false);
    const edited = evaluateBook2Progress(questions, answers, { objective: true, writing: false }, { writing: 3 });
    expect(edited.mastered).toBe(false);
    expect(edited.problems.map((item) => item.question_id)).toContain("writing");
  });

  it("shows a corrected objective answer as done after retry", () => {
    const wrong = evaluateBook2Progress(questions, { objective: "history" }, { objective: true }, {});
    expect(wrong.needsReview).toBe(true);
    const retried = evaluateBook2Progress(questions, { objective: "science" }, { objective: true }, {});
    expect(retried.needsReview).toBe(false);
    expect(retried.objectiveCorrect).toHaveLength(1);
  });

  it("uses full-task writing minimums without blocking short planning prompts", () => {
    expect(requiredBook2WritingWords("open_writing", "Discuss the advantages and disadvantages.", "b2-u05-w-l04")).toBe(250);
    expect(requiredBook2WritingWords("open_writing", "The table shows the data. Summarise the main features.", "b2-u02-w-l04")).toBe(150);
    expect(requiredBook2WritingWords("open_writing", "Write an introduction and overview.", "b2-u02-w-l02")).toBe(0);
  });
});
