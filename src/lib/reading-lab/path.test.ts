import { describe, expect, it } from "vitest";
import { buildPath } from "@/lib/self-study-path/path";
import { lessonName, passageSlug, readingCourse, readingProgress, readingStages } from "./path";
import type { ReadingLabSummary } from "./types";

const catalog: ReadingLabSummary[] = Array.from({ length: 36 }, (_, index) => {
  const number = index + 2;
  const id = `M08_${String(number).padStart(2, "0")}`;
  const full = number >= 34;
  const role = full ? "" : ["guided", "independent", "mastery", "checkpoint"][(number - 2) % 4];
  return {
    id, title: full ? `IELTS Reading Full Test ${"ABCD"[number - 34]} — M08.${number}` : `IELTS Reading M08.${String(number).padStart(2, "0")} — ${role}`,
    sections: role === "checkpoint" ? 2 : 3, questions: 30, minutes: 60, fullTest: full, questionTypes: [],
  };
});
const pass = (id: string, sections: number, correct = 10) =>
  Object.fromEntries(Array.from({ length: sections }, (_, index) => [passageSlug(id, index), { correct, checked: 10, total: 10 }]));

describe("Reading Lab path", () => {
  it("groups the set into eight stages with a checkpoint each, then the full tests", () => {
    const course = readingCourse(catalog);
    expect(course.stages).toHaveLength(9);
    expect(course.stages[0].lessons.map((lesson) => lesson.id)).toEqual(["M08_02", "M08_03", "M08_04"]);
    expect(course.stages[0].checkpoint?.href).toBe("/app/reading/lab/M08_05");
    expect(course.stages[8].lessons).toHaveLength(4);
    expect(course.stages[8].checkpoint).toBeUndefined();
    expect(readingStages.flatMap((stage) => [...stage.lessons, ...(stage.check ? [stage.check] : [])])).toHaveLength(36);
  });

  it("names lessons by their role", () => {
    expect(lessonName({ title: "IELTS Reading M08.03 — independent", fullTest: false })).toBe("Tự làm");
    expect(lessonName({ title: "IELTS Reading Full Test B — M08.35", fullTest: true })).toBe("Full test B");
  });

  it("marks a lesson done once every Passage is submitted, and in progress before that", () => {
    const progress = readingProgress(catalog, { ...pass("M08_02", 3, 7), ...pass("M08_03", 1) });
    expect(progress.lessons.M08_02).toMatchObject({ done: true, right: 21, total: 30, mistakes: 9 });
    expect(progress.lessons.M08_03).toMatchObject({ step: 1, note: "Đã nộp 1/3 Passage" });
  });

  it("opens the next stage only after the checkpoint reaches 70%", () => {
    const course = readingCourse(catalog);
    const lessons = { ...pass("M08_02", 3), ...pass("M08_03", 3), ...pass("M08_04", 3) };
    const failed = buildPath(course, readingProgress(catalog, { ...lessons, ...pass("M08_05", 2, 6) }));
    expect(failed.next?.node.kind).toBe("checkpoint");
    expect(failed.stages[1].status).toBe("locked");
    const passed = buildPath(course, readingProgress(catalog, { ...lessons, ...pass("M08_05", 2, 7) }));
    expect(passed.stages[0].status).toBe("done");
    expect(passed.next?.node.id).toBe("M08_06");
  });

  it("skips milestones the catalog does not publish", () => {
    const course = readingCourse(catalog.filter((item) => item.id !== "M08_09" && !item.fullTest));
    expect(course.stages).toHaveLength(8);
    expect(course.stages[1].checkpoint).toBeUndefined();
  });
});
