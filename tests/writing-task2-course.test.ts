import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { answerOf, buildCourseModule, exampleOf, practiceOf, unitOf, type CourseSourceFile } from "../src/lib/writing-task2/course-normalize";
import { attemptDone, courseModuleIds, parseCourseAttempt } from "../src/lib/writing-task2/course-types";

/*
 * The course data is private and lives outside the repository (TASK2_COURSE_DIR); CI has none, so the data
 * checks run only on a machine that has it. The shape checks below always run.
 */
const dir = process.env.TASK2_COURSE_DIR ?? "";
const hasData = Boolean(dir) && existsSync(join(dir, "DATASET_INDEX.json"));

function filesFor(id: string): CourseSourceFile[] {
  const index = JSON.parse(readFileSync(join(dir, "DATASET_INDEX.json"), "utf8")) as { source_path: string; milestone: string; visibility: string }[];
  return index.filter((entry) => entry.milestone === id).map((entry) => ({ path: entry.source_path, visibility: entry.visibility, data: JSON.parse(readFileSync(join(dir, entry.source_path), "utf8")) }));
}

describe("Writing Task 2 course normaliser", () => {
  it("reads a teaching unit by role and keeps unknown fields as rows", () => {
    const unit = unitOf({ id: "U1", name_vi: "Đọc đề", learning_goal_vi: "Biết đề hỏi gì", teacher_steps_vi: ["Bước 1", "Bước 2"], bad_en: "Weak.", good_en: "Strong.", why_vi: "Vì…", extra_note_vi: "Ghi chú" }, 0);
    expect(unit).toMatchObject({ title: "Đọc đề", goal: "Biết đề hỏi gì", steps: ["Bước 1", "Bước 2"], bad_en: "Weak.", good_en: "Strong.", why: "Vì…" });
    expect(unit.fields).toEqual([{ label: "Extra note", vi: "Ghi chú" }]);
  });

  it("turns practice into prompt, task, stimulus, hints and options without answer keys", () => {
    const item = practiceOf({ id: "R04-01-01", stage: "foundation", prompt_en: "P", task_vi: "Làm", hints_vi: ["h1"], options: [{ id: "A", text_en: "One", correct: true }], answer_locked: true, draft_en: "Draft." }, "Luyện tập", true);
    expect(item).toMatchObject({ id: "R04-01-01", task: "Làm", hints: ["h1"], options: [{ id: "A", text: "One" }], stimulus: [{ label: "Bản nháp cần sửa", en: "Draft." }] });
    expect(JSON.stringify(item)).not.toMatch(/correct|answer_locked/);
  });

  it("picks the model, its translation and the right option from answer records", () => {
    const answer = answerOf([{ id: "X", model_thesis_en: "Thesis.", model_thesis_vi: "Dịch.", correct_type: "agree_disagree", reason_vi: "Vì", assigned_band: "7", source_sha256: "abc" }]);
    expect(answer).toMatchObject({ correct: "agree_disagree", model_en: "Thesis.", model_vi: "Dịch." });
    expect(JSON.stringify(answer)).not.toMatch(/assigned_band|"7"|abc/);
  });

  it("shows a worked paragraph with its labelled steps", () => {
    const example = exampleOf({ id: "W1", prompt_en: "P", paragraph_en: "Text.", paragraph_vi: "Văn.", steps: [{ id: "topic", text_en: "T.", coaching_vi: "C" }] }, 0);
    expect(example).toMatchObject({ main_en: "Text.", main_vi: "Văn.", steps: [{ label: "Câu chủ đề", en: "T.", note: "C" }] });
  });

  it("only counts a real attempt", () => {
    expect(attemptDone(parseCourseAttempt(JSON.stringify({ c: 1, text: "ok", savedAt: "x" })))).toBe(false);
    expect(attemptDone(parseCourseAttempt(JSON.stringify({ c: 1, text: "", choice: "A", savedAt: "x" })))).toBe(true);
    expect(parseCourseAttempt("{\"t2\":1}")).toBeNull();
  });
});

describe.skipIf(!hasData)("Writing Task 2 course data (local private copy)", () => {
  let built: Record<string, ReturnType<typeof buildCourseModule>> = {};
  beforeAll(() => { built = Object.fromEntries(courseModuleIds.map((id) => [id, buildCourseModule(id, filesFor(id))])); });

  it("builds all 16 milestones with teaching and practice", () => {
    for (const id of courseModuleIds) {
      const { module } = built[id];
      expect(module.title, id).not.toBe(id);
      expect(module.units.length + module.sections.length, id).toBeGreaterThan(0);
      expect(module.practice.length, id).toBeGreaterThan(0);
    }
  });

  it("links an answer to every practice item, and keeps every answer out of the learner module", () => {
    for (const id of courseModuleIds) {
      const { module, answers } = built[id];
      const learner = JSON.stringify(module);
      // A few practice answers reuse a sentence the authors also published as a teaching example; those are not leaks.
      const published = filesFor(id).filter((file) => file.visibility === "learner_guided").map((file) => JSON.stringify(file.data)).join("\n");
      // Timed essays are reviewed with their checklist; every other practice item has reference guidance.
      for (const item of module.practice) expect(Boolean(answers[item.id]) || item.group === "Viết có giờ", item.id).toBe(true);
      for (const item of module.practice) expect(item.reference, item.id).toBe(Boolean(answers[item.id]));
      for (const [practiceId, answer] of Object.entries(answers)) {
        if (answer.model_en && answer.model_en.length > 40 && !published.includes(answer.model_en)) expect(learner, `${practiceId} leaks its model`).not.toContain(answer.model_en);
      }
      expect(learner, id).not.toMatch(/assigned_band|correct_option_id|server_only_after/);
    }
  });

  it("never exposes the final milestone's locked prompts", () => {
    const locked = filesFor("R16").find((file) => file.path.includes("FINAL_LOCKED"));
    const prompts = ((locked?.data as { items?: { prompt_en?: string }[] })?.items ?? []).map((item) => item.prompt_en).filter((text): text is string => Boolean(text));
    const learner = JSON.stringify(built.R16.module) + JSON.stringify(built.R16.answers);
    for (const prompt of prompts) expect(learner).not.toContain(prompt);
    expect(built.R16.module.practice.every((item) => !item.peek)).toBe(true);
  });
});
