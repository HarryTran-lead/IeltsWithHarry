import { describe, expect, it } from "vitest";
import { catalog, filterTerms, makeQuiz, normalizeWord, quizScore } from "../src/lib/vocabulary/catalog";
import { nextWordReview } from "../src/lib/news/review";

describe("vocabulary hub", () => {
  it("filters authored terms by level and topic", () => {
    expect(filterTerms(catalog, "B1", "Education").map((term) => term.word)).toEqual(["acquire"]);
    expect(filterTerms(catalog, "A2", "Business")).toEqual([]);
  });

  it("normalizes word keys so a News save and a Learn save are the same word", () => {
    expect(normalizeWord("  INFLUENCE ")).toBe(normalizeWord("influence"));
    expect(normalizeWord("   daily   routine ")).toBe("daily routine");
  });

  it("builds questions with four distinct choices and only one correct answer", () => {
    let seed = 17;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const questions = makeQuiz(catalog, random);
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThan(4);
    }
    expect(new Set(questions.map((question) => question.answer)).size).toBeGreaterThan(1);
    expect(quizScore(questions, questions.map((question) => question.answer))).toBe(5);
    expect(quizScore(questions, questions.map((question) => (question.answer + 1) % 4))).toBe(0);
  });

  it("persists a real FSRS card for all four ratings", () => {
    const now = new Date("2026-10-25T08:00:00Z");
    const outcomes = (["again", "hard", "good", "easy"] as const).map((grade) => nextWordReview(undefined, grade, now));
    expect(outcomes.every((item) => item.fsrs_state && new Date(item.due_at).getTime() > now.getTime())).toBe(true);
    expect(new Set(outcomes.map((item) => item.due_at)).size).toBeGreaterThan(1);
    const persisted = JSON.parse(JSON.stringify({ notebook_entry_id: "one", ...outcomes[2] }));
    const later = nextWordReview(persisted, "good", new Date(outcomes[2].due_at));
    expect(later.repetitions).toBe(2);
  });
});
