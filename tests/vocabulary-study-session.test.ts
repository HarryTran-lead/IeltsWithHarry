import { describe, expect, it } from "vitest";
import { buildLearnQueue, checkTyped, intervalLabel, requeue, reviewQueue, sessionGrade, wordState } from "../src/lib/vocabulary/study-session";
import type { WordReview } from "../src/lib/news/review";

describe("Learn session queue", () => {
  it("teaches each group as intro, then choice, then typing", () => {
    const queue = buildLearnQueue(["a", "b", "c"], 2);
    expect(queue.map((item) => `${item.id}:${item.stage}`)).toEqual(["a:intro", "b:intro", "a:choice", "b:choice", "a:type", "b:type", "c:intro", "c:choice", "c:type"]);
  });

  it("brings a missed item back three cards later", () => {
    const queue = buildLearnQueue(["a", "b", "c", "d", "e"]).slice(5);
    const next = requeue(queue, queue[0]);
    expect(next.slice(0, 4).map((item) => item.id)).toEqual(["b", "c", "d", "a"]);
    expect(requeue([queue[0]], queue[0])).toEqual([queue[0]]);
  });

  it("grades the session by how often the word was missed", () => {
    expect([0, 1, 2, 3].map(sessionGrade)).toEqual(["good", "hard", "hard", "again"]);
  });
});

describe("typed answers", () => {
  it("ignores case and punctuation and forgives one typo in longer words", () => {
    expect(checkTyped(" Sustainable! ", "sustainable")).toBe("exact");
    expect(checkTyped("sustainble", "sustainable")).toBe("close");
    expect(checkTyped("cat", "car")).toBe("wrong");
    expect(checkTyped("", "car")).toBe("wrong");
  });
});

describe("review scheduling helpers", () => {
  const review = (id: string, due: string, interval = 1, state = 2): WordReview => ({ notebook_entry_id: id, due_at: due, interval_days: interval, repetitions: 2, last_reviewed_at: null, fsrs_state: { state } as WordReview["fsrs_state"] });

  it("labels intervals in Vietnamese", () => {
    expect([30_000, 6 * 60_000, 3 * 3_600_000, 4 * 86_400_000, 90 * 86_400_000].map(intervalLabel)).toEqual(["<1 phút", "6 phút", "3 giờ", "4 ngày", "3 tháng"]);
  });

  it("names the four word states", () => {
    expect(wordState(undefined)).toBe("new");
    expect(wordState(review("a", "2026-01-01", 0, 1))).toBe("learning");
    expect(wordState(review("a", "2026-01-01", 5))).toBe("reviewing");
    expect(wordState(review("a", "2026-01-01", 30))).toBe("mastered");
  });

  it("puts overdue cards first and caps new words", () => {
    const entries = ["late", "early", "new1", "new2", "new3", "future"].map((id) => ({ id }));
    const reviews = new Map([["late", review("late", "2026-01-02")], ["early", review("early", "2026-01-01")], ["future", review("future", "2099-01-01")]]);
    const queue = reviewQueue(entries, reviews, Date.parse("2026-02-01"), { fresh: 2, total: 50 });
    expect(queue.map((entry) => entry.id)).toEqual(["early", "late", "new1", "new2"]);
  });
});
