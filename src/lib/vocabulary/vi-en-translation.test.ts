import { describe, expect, it } from "vitest";
import { chooseTranslationSession, nextTranslationProgress, type TranslationExercise } from "./vi-en-translation";

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
  it("schedules self ratings without treating text similarity as a score", () => {
    const first = nextTranslationProgress("a", undefined, "good", new Date("2026-10-29T00:00:00Z"));
    expect(first.interval_days).toBe(3);
    expect(first.attempts_count).toBe(1);
    const second = nextTranslationProgress("a", first, "again", new Date("2026-11-01T00:00:00Z"));
    expect(second.repetitions).toBe(0);
    expect(second.attempts_count).toBe(2);
  });
});
