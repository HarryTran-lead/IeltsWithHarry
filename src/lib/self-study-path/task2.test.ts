import { describe, expect, it } from "vitest";
import { practiceLevels, requiredPractice, type CourseModuleSummary } from "@/lib/writing-task2/course-types";
import { task2SkillsProgress } from "./task2";

const practice = [
  { id: "f1", stage: "foundation" }, { id: "f2", stage: "foundation" },
  { id: "b1", stage: "basic" }, { id: "a1", stage: "advanced" },
  { id: "timed" },
];
const levels = practiceLevels(practice);
const milestone = (id: string): CourseModuleSummary => ({ id, layer: "1", title: id, overview: "", counts: { units: 0, examples: 0, practice: practice.length }, levels });

describe("requiredPractice", () => {
  it("asks for the learner's own level plus the items every level does", () => {
    expect(requiredPractice(levels, "foundation")).toEqual(["f1", "f2", "timed"]);
    expect(requiredPractice(levels, "advanced")).toEqual(["a1", "timed"]);
  });

  it("falls back to the nearest lower level when a milestone has nothing at the learner's level", () => {
    expect(requiredPractice(levels, "developing")).toEqual(["b1", "timed"]);
  });
});

describe("task2SkillsProgress", () => {
  it("marks a milestone done once the learner's level is finished, without the other levels", () => {
    const progress = task2SkillsProgress([milestone("R01"), milestone("R02")], { R01: ["f1", "f2", "timed"], R02: ["f1", "a1"] }, "foundation");
    expect(progress.lessons.R01).toMatchObject({ done: true });
    expect(progress.lessons.R02).toMatchObject({ step: 0, note: "Đã làm 1/3 câu · mức Nền tảng" });
  });

  it("does not count other levels towards the learner's own", () => {
    const progress = task2SkillsProgress([milestone("R01")], { R01: ["b1", "a1"] }, "foundation");
    expect(progress.lessons.R01?.done).toBeUndefined();
  });
});
