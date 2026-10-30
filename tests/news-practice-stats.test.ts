import { describe, expect, it } from "vitest";
import { formatDuration, sumBreakdowns, summarizeAttempts, type PracticeAttempt } from "../src/lib/news/practice-stats";

const attempt = (id: string, score: number, total: number, extra: Partial<PracticeAttempt> = {}): PracticeAttempt =>
  ({ id, article_id: "a", score, total, submitted_at: `2026-10-2${id}T10:00:00Z`, ...extra });

describe("Daily News practice statistics", () => {
  it("formats durations as minutes and seconds", () => {
    expect(formatDuration(75)).toBe("01:15");
    expect(formatDuration(3720)).toBe("1 giờ 2 phút");
  });

  it("adds per-type scores in IELTS order and skips empty types", () => {
    expect(sumBreakdowns([{ mcq: { correct: 2, total: 5 }, tfng: { correct: 6, total: 6 } }, { mcq: { correct: 3, total: 5 } }, null, {}]))
      .toEqual([{ type: "mcq", correct: 5, total: 10, percent: 50 }, { type: "tfng", correct: 6, total: 6, percent: 100 }]);
  });

  it("summarises history: accuracy, time per question, weakest type and trend", () => {
    const stats = summarizeAttempts([
      attempt("3", 3, 4, { partial: true, breakdown: { sentence_completion: { correct: 3, total: 4 } }, duration_seconds: 60 }),
      attempt("2", 14, 20, { breakdown: { tfng: { correct: 5, total: 6 }, mcq: { correct: 3, total: 6 }, sentence_completion: { correct: 3, total: 4 }, short_answer: { correct: 3, total: 4 } }, duration_seconds: 540 }),
      attempt("1", 10, 20),
    ]);
    expect(stats).toMatchObject({ attempts: 3, questions: 44, correct: 27, accuracy: 61, secondsPerQuestion: 25 });
    expect(stats.weakest).toMatchObject({ type: "mcq", percent: 50 });
    expect(stats.trend.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(stats.trend[2]).toMatchObject({ percent: 75, partial: true });
  });
});
