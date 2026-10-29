import { describe, expect, it } from "vitest";
import { nextCollocationProgress, recommendCollocations, type CollocationEntry } from "./collocation-recommendations";

const entry = (id: string, level: CollocationEntry["level"], source_order: number): CollocationEntry => ({
  id, level, source_order, phrase: id, meaning_vi: id, example_en: id, example_vi: id, note: "", qa_flags: [],
});

describe("collocation suggestions", () => {
  it("puts due reviews before unseen words and respects the selected level", () => {
    const now = new Date("2026-10-29T08:00:00Z");
    const due = nextCollocationProgress("b", undefined, "again", new Date("2026-10-28T08:00:00Z"));
    const future = nextCollocationProgress("c", undefined, "easy", now);
    const results = recommendCollocations([entry("a", "A1", 1), entry("b", "A1", 2), entry("c", "A1", 3), entry("d", "B2", 4)], [due, future], "A1", 10, now);
    expect(results.map((item) => [item.entry.id, item.reason])).toEqual([["b", "due"], ["a", "new"]]);
  });

  it("excludes reviewed cards within the current session", () => {
    const results = recommendCollocations([entry("a", "A1", 1), entry("b", "A1", 2)], [], "all", 5, new Date(), new Set(["a"]));
    expect(results.map((item) => item.entry.id)).toEqual(["b"]);
  });
});
