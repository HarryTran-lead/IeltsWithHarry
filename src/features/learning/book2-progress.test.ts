import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { book2AnswerCorrect, book2OptionOrder, evaluateBook2Progress, requiredBook2WritingWords, type Book2ScoredItem } from "./book2-progress";

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

  it("accepts answers that differ only in accents, quotes, currency, per cent or a leading article", () => {
    const key = (accepted: string[]) => ({ question_id: "q", answer: { kind: "objective", accepted } });
    expect(book2AnswerCorrect(key(["hotel and café"]), "Hotel & cafe")).toBe(true);
    expect(book2AnswerCorrect(key(["I’d"]), "I'd")).toBe(true);
    expect(book2AnswerCorrect(key(["22"]), "£22")).toBe(true);
    expect(book2AnswerCorrect(key(["40%"]), "40 per cent")).toBe(true);
    expect(book2AnswerCorrect(key(["old harbour"]), "the old harbour")).toBe(true);
    expect(book2AnswerCorrect(key(["old harbour"]), "harbour")).toBe(false);
    expect(book2AnswerCorrect(key(["a"]), "")).toBe(false);
  });

  it("keeps ordered option sets and spreads correct answers across positions", () => {
    expect(book2OptionOrder("q1", "true_false_not_given", ["TRUE", "FALSE", "NOT GIVEN"])).toEqual(["TRUE", "FALSE", "NOT GIVEN"]);
    expect(book2OptionOrder("q1", "multiple_choice", ["A", "B", "C", "D"])).toEqual(["A", "B", "C", "D"]);
    expect(book2OptionOrder("q2", "multiple_choice", ["Wednesday", "Monday", "Either"]).at(-1)).toBe("Either");
    expect(book2OptionOrder("q3", "multiple_choice", ["x", "y", "z"])).toEqual(book2OptionOrder("q3", "multiple_choice", ["x", "y", "z"]));
    const folder = join(process.cwd(), "public/book-2/lessons");
    const positions = [0, 0, 0, 0, 0, 0];
    for (const file of readdirSync(folder)) {
      const lesson = JSON.parse(readFileSync(join(folder, file), "utf8")) as { exercises: { questions: { question_id: string; item_type: string; options: string[]; answer: { kind: string; accepted: string[] } }[] }[] };
      for (const item of lesson.exercises.flatMap((exercise) => exercise.questions)) {
        if (item.answer.kind !== "objective" || item.options.length < 3) continue;
        const shown = book2OptionOrder(item.question_id, item.item_type, item.options);
        expect([...shown].sort()).toEqual([...item.options].sort());
        if (shown !== item.options) positions[shown.findIndex((option) => item.answer.accepted.includes(option))]++;
      }
    }
    const shuffled = positions.reduce((sum, count) => sum + count, 0);
    expect(shuffled).toBeGreaterThan(200);
    expect((positions[0] + positions[1]) / shuffled).toBeLessThan(0.65);
  });
});