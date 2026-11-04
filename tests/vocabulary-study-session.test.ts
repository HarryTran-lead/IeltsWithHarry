import { describe, expect, it } from "vitest";
import { buildLearnQueue, buildTest, checkTyped, headwordForms, intervalLabel, learnProgress, requeue, reviewQueue, sessionGrade, testCorrect, wordState } from "../src/lib/vocabulary/study-session";
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
    expect(next[3].retry).toBe(true);
    expect(requeue([queue[0]], queue[0])).toEqual([{ ...queue[0], retry: true }]);
  });

  it("counts a step as done only once it leaves the queue", () => {
    const queue = buildLearnQueue(["a", "b"]);
    expect(learnProgress(queue, 2)).toBe(0);
    expect(learnProgress(queue.slice(2), 2)).toBeCloseTo(2 / 6);
    expect(learnProgress(requeue(queue.slice(2), queue[2]), 2)).toBeCloseTo(2 / 6);
    expect(learnProgress([], 2)).toBe(1);
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

  it("accepts any spelling of a headword written as variants", () => {
    expect(headwordForms("a.m./A.M./am/AM")).toEqual(["a.m.", "A.M.", "am", "AM"]);
    expect(headwordForms("and/or")).toEqual(["and/or"]);
    expect(checkTyped("am", "a.m./A.M./am/AM")).toBe("exact");
    expect(checkTyped("A.M.", "a.m./A.M./am/AM")).toBe("exact");
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

describe("mixed vocabulary test", () => {
  const pool = ["one", "two", "three", "four", "five", "six"].map((title, index) => ({ id: String(index), title, meaningVi: `nghĩa ${index}` }));
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  it("mixes the four question kinds with the right answer among the options", () => {
    const test = buildTest(pool, 6, random);
    expect(test).toHaveLength(6);
    expect(new Set(test.map((question) => question.kind))).toEqual(new Set(["meaning", "word", "type", "truefalse"]));
    for (const question of test) {
      if (question.kind !== "type") expect(question.options).toContain(question.answer);
      expect(testCorrect(question, question.answer)).toBe(true);
    }
    const typed = test.find((question) => question.kind === "type")!;
    expect(testCorrect(typed, typed.answer.toUpperCase())).toBe(true);
  });

  it("falls back to typing when there are too few words for options", () => {
    expect(buildTest(pool.slice(0, 2), 2, random).every((question) => question.kind === "type")).toBe(true);
  });
});
