import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Each package's build checks lengths, counts and that every answer is one of its options; it exits non-zero on any problem.
function build(dir: string) {
  const output = execFileSync(process.execPath, ["content/build-package.mjs", dir], { encoding: "utf8" });
  return { output, course: JSON.parse(readFileSync(`${dir}/dist/course_v2.json`, "utf8")) };
}

type Unit = { unit_id: string; lessons: { id: string; type: string; data_visual?: unknown }[]; expanded_readings: unknown[]; expanded_listenings: unknown[]; unit_checkpoint_v2: unknown[]; speaking_extensions: unknown[] };

describe.each([
  { dir: "content/ielts-builder-5-6-v3", id: "ESL-IELTS-BUILDER-5-6-V3", first: "L2U01-L01", last: "L2U08-L06" },
  { dir: "content/ielts-advanced-6-7-v3", id: "ESL-IELTS-ADVANCED-6-7PLUS-V3", first: "L3U01-L01", last: "L3U08-L06" },
])("course package $id", ({ dir, id, first, last }) => {
  const { output, course } = build(dir);

  it("builds eight units in the Advanced V2 shape the importer accepts", () => {
    expect(output).toContain(last.slice(0, 5));
    expect(course.schema_version).toBe("2.0.0");
    expect(course.course_id).toBe(id);
    expect(course.units).toHaveLength(8);
    for (const unit of course.units as Unit[]) {
      expect(unit.lessons.map((lesson) => lesson.type)).toEqual(["vocabulary", "grammar", "listening", "reading", "writing", "speaking"]);
      expect(unit.expanded_readings).toHaveLength(2);
      expect(unit.expanded_listenings).toHaveLength(2);
      expect(unit.unit_checkpoint_v2).toHaveLength(5);
      expect(unit.speaking_extensions).toHaveLength(4);
    }
    expect(course.diagnostic.reading.length).toBeGreaterThan(0);
  });

  it("keeps the earlier package's lesson ids so learner progress carries over", () => {
    const ids = (course.units as Unit[]).flatMap((unit) => unit.lessons.map((lesson) => lesson.id));
    expect(ids[0]).toBe(first);
    expect(ids.at(-1)).toBe(last);
    expect(new Set(ids).size).toBe(48);
  });
});

describe("IELTS Builder 5.0–6.0 V3 writing", () => {
  it("writes Task 1 in units 1–4 and Task 2 in units 5–8", () => {
    const { course } = build("content/ielts-builder-5-6-v3");
    const writing = (course.units as Unit[]).map((unit) => unit.lessons.find((lesson) => lesson.type === "writing")!);
    expect(writing.slice(0, 4).every((lesson) => lesson.data_visual)).toBe(true);
    expect(writing.slice(4).every((lesson) => !lesson.data_visual)).toBe(true);
  });
});
