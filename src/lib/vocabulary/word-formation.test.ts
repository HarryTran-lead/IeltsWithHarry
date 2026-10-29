import { describe, expect, it } from "vitest";
import {
  choiceOptions, completeSentence, cueForm, eligibleForMode, nextFormationProgress,
  normalizeFormationAnswer, recommendFamilies, type WordFamily,
} from "./word-formation";

const family = (id: number, warning: string | null = null): WordFamily => ({
  id, noun: `success${id}`, verb: `succeed${id}`, adjective: `successful${id}`, adverb: `successfully${id}`,
  meaning_vi: "Thành công", example_pos: "adv", example_blank_en: "The team ____ completed the task.",
  example_vi: "Nhóm đã hoàn thành nhiệm vụ.", source_warning: warning,
});

describe("Word Formation exercises", () => {
  it("uses only source forms and a single intended answer in four-choice exercises", () => {
    const row = family(1);
    expect(eligibleForMode(row, "choice")).toBe(true);
    const options = choiceOptions(row, "basic");
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain("successfully1");
    expect(cueForm(row)).not.toBe("successfully1");
    expect(completeSentence(row)).toBe("The team successfully1 completed the task.");
  });

  it("excludes warned or incomplete families from auto-choice", () => {
    expect(eligibleForMode(family(2, "Meaning differs"), "choice")).toBe(false);
    expect(eligibleForMode({ ...family(3), adverb: null }, "choice")).toBe(false);
  });

  it("prioritizes due work and keeps open answers out of automatic correctness counts", () => {
    const now = new Date("2026-10-29T08:00:00Z");
    const due = nextFormationProgress(family(2), "blank", "basic", undefined, "wrong", new Date("2026-10-28T08:00:00Z"));
    const suggested = recommendFamilies([family(1), family(2)], [due], "blank", 10, now);
    expect(suggested.map((item) => item.id)).toEqual([2, 1]);
    const open = nextFormationProgress(family(1), "translation", "basic", undefined, "self_checked", now);
    expect(open.correct_count).toBe(0);
    expect(open.self_checked_count).toBe(1);
  });

  it("accepts case and surrounding sentence punctuation", () => {
    expect(normalizeFormationAnswer("  SUCCESSFULLY. ")).toBe(normalizeFormationAnswer("successfully"));
  });
});
