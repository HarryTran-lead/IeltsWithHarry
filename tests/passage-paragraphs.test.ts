import { describe, expect, it } from "vitest";
import { MAX_PARAGRAPHS, mergeShortParagraphs } from "../src/lib/news/passage-paragraphs";
import { PASSAGE_TEMPLATES_BY_LEVEL, selectQuestionTypes } from "../src/lib/news/adaptive-quiz";

const sentence = (n: number) => `Sentence ${n} reports that the regional health agency counted ${n * 3} new cases in the week to Friday.`;

describe("passage-sized paragraphs for feed articles", () => {
  it("joins one-sentence paragraphs into paragraphs of about 70–140 words without changing the words", () => {
    const text = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join("\n\n");
    const merged = mergeShortParagraphs(text);
    const paragraphs = merged.split("\n\n");
    expect(paragraphs.length).toBeLessThanOrEqual(MAX_PARAGRAPHS);
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const paragraph of paragraphs) expect(paragraph.split(/\s+/).length).toBeGreaterThanOrEqual(35);
    expect(merged.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });
  it("folds a list into its lead-in sentence and keeps a subheading on its own line", () => {
    const text = ["Uptake last winter varied by condition. Uptake was:", "less than 48% among those with a weakened immune system",
      "less than 45% among those with a chronic neurological disease", "Interim findings", sentence(1), sentence(2)].join("\n\n");
    const paragraphs = mergeShortParagraphs(text).split("\n\n");
    expect(paragraphs[0]).toBe("Uptake last winter varied by condition. Uptake was: less than 48% among those with a weakened immune system; less than 45% among those with a chronic neurological disease.");
    expect(paragraphs).toContain("Interim findings");
  });
  it("drops a paragraph repeated word for word by the page extraction", () => {
    const repeated = "Affordability challenges: millions of people face financial barriers to private dental care, with cost leading some to delay treatment.";
    expect(mergeShortParagraphs([repeated, repeated, sentence(1)].join("\n\n")).split(repeated).length).toBe(2);
  });
});

describe("question forms by IELTS passage level", () => {
  const long = Array.from({ length: 32 }, (_, i) => `Paragraph ${i} explains how Seabrook Water Board staff measured ${i + 10} samples in 2022 because residents asked, while the Harbor Office compared results.`)
    .reduce((text, line, i) => text + (i % 4 === 0 ? "\n\n" : " ") + line, "").trim();
  const words = long.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  it("keeps every set within one template of its level", () => {
    for (const level of [1, 2, 3] as const) for (let n = 0; n < 40; n++) {
      const selected = selectQuestionTypes(long, words, `level-${level}-${n}`, level, false);
      expect(PASSAGE_TEMPLATES_BY_LEVEL[level].some((template) => selected.every((type, slot) => template[slot]?.includes(type)))).toBe(true);
      expect(selected).not.toContain("ynng");
    }
  });
  it("gives Passage 1 statements with notes or a summary, and never single-answer choice", () => {
    const sets = Array.from({ length: 200 }, (_, n) => selectQuestionTypes(long, words, `factual-${n}`, 1, false));
    expect(sets.filter((types) => types.includes("tfng")).length).toBeGreaterThan(100);
    expect(sets.some((types) => types.includes("mcq"))).toBe(false);
  });
});
