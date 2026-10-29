import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { starterPagesForLesson, starterSourceTotals } from "./starter-book-source";

const skills = ["Vocabulary", "Grammar", "Reading", "Listening", "Writing", "Speaking"];
const physicalPages = Array.from({ length: 8 }, (_, unit) => skills.flatMap((skill, lesson) => starterPagesForLesson(unit, lesson, `${unit}-${lesson}`, skill))).flat();
const pages = physicalPages.flatMap((page) => page.sections ?? [page]);
const sources = Array.from({ length: 8 }, (_, index) => JSON.parse(readFileSync(resolve(`content/ielts-starter-4-5-supplement/units/U${String(index + 1).padStart(2, "0")}/unit.json`), "utf8")));

describe("Starter coursebook source pages", () => {
  it("prints every authored exercise once and keeps its group action", () => {
    const sourceIds = sources.flatMap((unit) => unit.activities.flatMap((group: { items: { id: string }[] }) => group.items.map((item) => item.id)));
    const printed = pages.filter((page) => page.type === "group").flatMap((page) => page.items?.map((item) => ({ id: item.id, groupId: page.groupId })) ?? []);
    expect(starterSourceTotals()).toEqual({ groups: 392, items: 1462 });
    expect(printed.map((item) => item.id).sort()).toEqual(sourceIds.sort());
    expect(printed.every((item) => item.groupId)).toBe(true);
  });

  it("combines short exercise groups and keeps the Writing diagrams with their tasks", () => {
    expect(physicalPages.some((page) => page.type === "bundle" && (page.sections?.length ?? 0) > 1)).toBe(true);
    for (const [unit, groupId] of [[0, "M01-W11"], [1, "M02-W15"], [2, "U03-W11"], [3, "U04-W15"]] as const) {
      const writing = pages.filter((page) => page.unitIndex === unit && page.lessonIndex === 4 && page.type === "group");
      expect(writing.some((page) => page.groupId === groupId && page.visual)).toBe(true);
    }
  });

  it("includes each passage, track, structured visual, and image inside the book", () => {
    expect(new Set(pages.filter((page) => page.type === "passage").map((page) => `${page.unitIndex}:${page.subtitle?.split(" · ")[0]}`)).size).toBe(17);
    const audio = new Set(pages.map((page) => page.audioUrl).filter(Boolean));
    expect(audio.size).toBe(52);
    const images = new Set(pages.map((page) => page.imageUrl).filter(Boolean));
    expect(images.size).toBe(14);
    for (const url of [...audio, ...images]) expect(existsSync(resolve(`public${url}`))).toBe(true);
    expect(pages.filter((page) => page.type === "visual" && page.visual).length).toBe(15);
  });

  it("prints all Writing and Speaking model text and translations", () => {
    for (const [unitIndex, source] of sources.entries()) {
      const printed = pages.filter((page) => page.unitIndex === unitIndex && page.type === "model").flatMap((page) => page.paragraphs ?? []).join(" ").replace(/\s+/g, " ");
      for (const model of [...(source.writing_models ?? []), ...(source.speaking_models ?? [])]) {
        expect(printed).toContain(model.text.replace(/\s+/g, " "));
        if (model.vi) expect(printed).toContain(model.vi.replace(/\s+/g, " "));
      }
      if (source.model_writing_task1) expect(printed).toContain(source.model_writing_task1.replace(/\s+/g, " "));
      if (source.writing_task1_model_en) expect(printed).toContain(source.writing_task1_model_en.replace(/\s+/g, " "));
      if (source.writing_task1_model_vi) expect(printed).toContain(source.writing_task1_model_vi.replace(/\s+/g, " "));
    }
  });
});
