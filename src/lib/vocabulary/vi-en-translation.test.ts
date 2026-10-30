import { describe, expect, it } from "vitest";
import { chooseTranslationSession, compareTranslation, matchesCopiedWord, nextTranslationProgress, ratingForComparison, type TranslationExercise } from "./vi-en-translation";

const entry = (id: string): TranslationExercise => ({
  id, topic: "Cities & Urban Life", mode: "speaking", term: "urbanisation", meaning_vi: "đô thị hóa",
  pattern: "", collocations: "", prompt_vi: "Đô thị hóa đã thay đổi thành phố.",
  reference_en: "Urbanisation has changed the city.", alternatives: [], editor_note: "", revision: 1,
});
describe("VI to EN practice", () => {
  it("keeps new and due exercises separate without duplicating a session", () => {
    const progress = nextTranslationProgress("a", undefined, "again", new Date("2026-10-29T00:00:00Z"));
    expect(chooseTranslationSession([entry("a"), entry("b")], [progress], "new", 10).map((item) => item.id)).toEqual(["b"]);
    expect(chooseTranslationSession([entry("a"), entry("b")], [progress], "due", 10, Date.parse("2026-10-29T00:11:00Z")).map((item) => item.id)).toEqual(["a"]);
  });
  it("schedules review from the computed rating", () => {
    const first = nextTranslationProgress("a", undefined, "good", new Date("2026-10-29T00:00:00Z"));
    expect(first.interval_days).toBe(3);
    expect(first.attempts_count).toBe(1);
    const second = nextTranslationProgress("a", first, "again", new Date("2026-11-01T00:00:00Z"));
    expect(second.repetitions).toBe(0);
    expect(second.attempts_count).toBe(2);
  });
  it("checks copied vocabulary without case or punctuation differences", () => {
    expect(matchesCopiedWord("3D printing!", "3D printing")).toBe(true);
    expect(matchesCopiedWord("3D print", "3D printing")).toBe(false);
  });
  it("counts ordered matching words and highlights missing or extra words", () => {
    const result = compareTranslation("The local policy protects wild animals", "The policy protects animals in local areas.");
    expect(result.matched).toBe(4);
    expect(result.total).toBe(7);
    expect(result.extra).toBe(2);
    expect(result.referenceWords.filter((word) => !word.matched).map((word) => word.word)).toEqual(["in", "local", "areas"]);
  });
  it("accepts the closest published alternative and assigns a review interval", () => {
    const result = compareTranslation("Wildlife needs protection", "We must protect wildlife.", ["Wildlife needs protection."]);
    expect(result.accuracy).toBe(100);
    expect(result.reference).toBe("Wildlife needs protection.");
    expect(ratingForComparison(result)).toBe("easy");
  });
});
