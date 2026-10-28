import { describe, expect, it } from "vitest";
import { balancedCatalog, catalogEntriesForSelection, catalogGroups, catalogHref, catalogQuestionTypeIds, catalogSectionEntries, sectionSummaries, type CatalogExam } from "../src/lib/ielts-bank/catalog";

describe("IELTS catalog grouping", () => {
  it("interleaves formats so one large category does not fill the first page", () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `essay-${i}`, practice_type: "task2" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `chart-${i}`, practice_type: "task1_academic" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `letter-${i}`, practice_type: "task1_general" })),
    ];
    const result = balancedCatalog(items, catalogGroups.Writing.map((group) => group.id));
    expect(result.slice(0, 6).map((item) => item.practice_type)).toEqual([
      "task1_academic", "task1_general", "task2",
      "task1_academic", "task1_general", "task2",
    ]);
    expect(result).toHaveLength(items.length);
    expect(new Set(result.map((item) => item.id)).size).toBe(items.length);
  });

  it("links every type to its own skill page", () => {
    expect(catalogHref("Writing", "task1_general")).toBe("/app/writing?type=task1_general");
    expect(catalogHref("Speaking", "part2")).toBe("/app/speaking?type=part2");
  });

  it("splits published full exams into independently selectable passages and sections", () => {
    const reading = { id: "reading", title: "Reading Test 1", skill: "Reading", practice_type: "full_test", sections: [
      { title: "A History of Cinema", question_types: ["true_false_not_given"], question_count: 13 },
      { title: "Passage 2", question_types: ["matching_headings"], question_count: 13 },
      { title: "A New Technology", question_types: ["multiple_choice"], question_count: 14 },
    ] } as CatalogExam;
    const listening = { id: "listening", title: "Listening Test 1", skill: "Listening", practice_type: "full_test", sections: Array.from({ length: 4 }, (_, index) => ({ title: `Section ${index + 1}`, question_types: ["form_completion"], question_count: 10 })) } as CatalogExam;
    const passages = catalogSectionEntries([reading], "Reading");
    const sections = catalogSectionEntries([listening], "Listening");
    expect(passages.map((entry) => [entry.part, entry.title, entry.questionCount])).toEqual([
      [1, "A History of Cinema", 13], [2, "Reading Test 1", 13], [3, "A New Technology", 14],
    ]);
    expect(sections.map((entry) => entry.part)).toEqual([1, 2, 3, 4]);
    expect(passages.every((entry) => entry.splitFromFull)).toBe(true);
    expect(passages.filter((entry) => entry.part === 2)).toHaveLength(1);
    const standalone = { id: "single", title: "Listening Section 2", skill: "Listening", practice_type: "part" } as CatalogExam;
    const single = catalogSectionEntries([standalone], "Listening")[0];
    expect(single.part).toBe(2);
    expect(single.splitFromFull).toBeUndefined();
  });

  it("returns section metadata without passage text or answer keys", () => {
    const summaries = sectionSummaries({ sections: [{ title: "Passage 1", questions: [
      { type: "matching_headings", answers: ["A"], prompt: "Secret" },
      { type: "matching_headings", answers: ["B"], prompt: "Secret" },
    ] }] });
    expect(summaries).toEqual([{ title: "Passage 1", question_types: ["matching_headings"], question_count: 2 }]);
    expect(JSON.stringify(summaries)).not.toContain("Secret");
  });

  it("uses the same question types for sidebar filters and library entries", () => {
    const exam = { id: "reading", title: "Reading Test", skill: "Reading", practice_type: "full_test", sections: [
      { title: "Passage 1", question_types: ["matching_headings", "true_false_not_given"], question_count: 13 },
      { title: "Passage 2", question_types: ["multiple_choice_single_answer"], question_count: 13 },
    ] } as CatalogExam;
    const first = catalogEntriesForSelection([exam], "Reading", false, 1);
    const full = catalogEntriesForSelection([exam], "Reading", true, 0);
    expect(first).toHaveLength(1);
    expect(catalogQuestionTypeIds(first[0].questionTypes)).toEqual(["headings", "tfng"]);
    expect(catalogQuestionTypeIds(full[0].questionTypes)).toEqual(["headings", "tfng", "mc_one"]);
  });
});
