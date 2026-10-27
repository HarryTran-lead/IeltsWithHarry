import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = "content/ielts-builder-5-6-v3";

describe("IELTS Builder 5.0–6.0 V3 package", () => {
  // The build script checks lengths, counts and that every answer is one of its options; it exits non-zero on any problem.
  const output = execFileSync(process.execPath, [`${root}/build.mjs`], { encoding: "utf8" });
  const course = JSON.parse(readFileSync(`${root}/dist/course_v2.json`, "utf8"));

  it("builds eight units in the Advanced V2 shape the importer accepts", () => {
    expect(output).toContain("L2U08");
    expect(course.schema_version).toBe("2.0.0");
    expect(course.course_id).toBe("ESL-IELTS-BUILDER-5-6-V3");
    expect(course.units).toHaveLength(8);
    for (const unit of course.units) {
      expect(unit.lessons.map((lesson: { type: string }) => lesson.type)).toEqual(["vocabulary", "grammar", "listening", "reading", "writing", "speaking"]);
      expect(unit.expanded_readings).toHaveLength(2);
      expect(unit.expanded_listenings).toHaveLength(2);
      expect(unit.unit_checkpoint_v2).toHaveLength(5);
      expect(unit.speaking_extensions).toHaveLength(4);
    }
    expect(course.diagnostic.reading.length).toBeGreaterThan(0);
  });

  it("keeps the first Builder package's lesson ids so learner progress carries over", () => {
    const ids = course.units.flatMap((unit: { lessons: { id: string }[] }) => unit.lessons.map((lesson) => lesson.id));
    expect(ids[0]).toBe("L2U01-L01");
    expect(ids.at(-1)).toBe("L2U08-L06");
    expect(new Set(ids).size).toBe(48);
  });

  it("writes Task 1 in units 1–4 and Task 2 in units 5–8", () => {
    const writing = course.units.map((unit: { lessons: { type: string; data_visual: unknown }[] }) => unit.lessons.find((lesson) => lesson.type === "writing")!);
    expect(writing.slice(0, 4).every((lesson: { data_visual: unknown }) => lesson.data_visual)).toBe(true);
    expect(writing.slice(4).every((lesson: { data_visual: unknown }) => !lesson.data_visual)).toBe(true);
  });
});
