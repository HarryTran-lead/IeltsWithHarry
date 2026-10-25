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

  it("schedules a reviewed word for tomorrow or later", () => {
    const now = new Date("2026-10-25T08:00:00Z");
    const first = nextWordReview(undefined, "again", now);
    expect(new Date(first.due_at).getTime()).toBeGreaterThanOrEqual(now.getTime() + 86400000);
    const later = nextWordReview({ notebook_entry_id: "one", ...first }, "easy", now);
    expect(later.interval_days).toBeGreaterThan(first.interval_days);
  });
});
