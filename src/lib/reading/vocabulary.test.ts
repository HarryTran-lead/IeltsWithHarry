import { describe, expect, it } from "vitest";
import { matchesReadingRecall, nextReadingProgress } from "./vocabulary";

describe("Reading vocabulary review", () => {
  it("checks the source answer without case or extra spaces", () => {
    expect(matchesReadingRecall("  Climate   Change. ", ["climate change"])).toBe(true);
    expect(matchesReadingRecall("weather", ["climate change"])).toBe(false);
  });

  it("schedules an incorrect recall soon even when rated easy", () => {
    const now = new Date("2026-10-29T08:00:00Z");
    const next = nextReadingProgress("RV0001", undefined, "easy", "recall", "incorrect", now);
    expect(next.last_grade).toBe("again");
    expect(next.due_at).toBe("2026-10-29T08:10:00.000Z");
    expect(next.mistake_open).toBe(true);
    expect(next.wrong_count).toBe(1);
  });

  it("clears a mistake only after two later good days and requires two formats for mastery", () => {
    const failed = nextReadingProgress("RV0001", undefined, "again", "recall", "incorrect", new Date("2026-10-29T08:00:00Z"));
    const dayOne = nextReadingProgress("RV0001", failed, "good", "flashcard", "self_reviewed", new Date("2026-10-30T08:00:00Z"));
    expect(dayOne.mistake_open).toBe(true);
    const dayTwo = nextReadingProgress("RV0001", dayOne, "good", "recall", "correct", new Date("2026-10-31T08:00:00Z"));
    expect(dayTwo.mistake_open).toBe(false);
    expect(dayTwo.mastered_at).toBe("2026-10-31T08:00:00.000Z");
  });

  it("treats ordinary and SRS flashcards as one exercise format", () => {
    const first = nextReadingProgress("RV0002", undefined, "good", "flashcard", "self_reviewed", new Date("2026-10-29T08:00:00Z"));
    const second = nextReadingProgress("RV0002", first, "good", "srs", "self_reviewed", new Date("2026-10-30T08:00:00Z"));
    expect(second.success_types).toEqual(["flashcard"]);
    expect(second.mastered_at).toBeNull();
  });
});
