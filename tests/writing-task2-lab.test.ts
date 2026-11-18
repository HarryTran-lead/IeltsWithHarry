import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task2Lesson } from "../src/lib/writing-task2/types";
import { drillSaved, essaySaved, parseTask2State, writingTargets } from "../src/lib/writing-task2/types";

const root = join(process.cwd(), "content/writing-task2");
const lessonsRaw = readFileSync(join(root, "lessons.json"), "utf8");
const lessons = (JSON.parse(lessonsRaw) as { lessons: Task2Lesson[] }).lessons;
const answers = (JSON.parse(readFileSync(join(root, "answers.json"), "utf8")) as { lessons: Record<string, { content_sha256: string; drills: Record<string, unknown>; model_essay?: { essay: string } }> }).lessons;
const vietnamese = /[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Writing Task 2 Lab content", () => {
  it("holds the 36 M112–M113 lessons with their drills and model essays", () => {
    expect(lessons).toHaveLength(36);
    expect(lessons.reduce((sum, lesson) => sum + lesson.drills.length, 0)).toBe(240);
    expect(lessons.filter((lesson) => lesson.has_model_essay)).toHaveLength(7);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(36);
  });

  it("keeps answers and model essays out of the learner file", () => {
    expect(lessonsRaw).not.toMatch(/answer_guide|explanation_vi|"essay"/);
    for (const answer of Object.values(answers)) {
      for (const text of [JSON.stringify(Object.values(answer.drills)[0]), answer.model_essay?.essay.slice(0, 60)].filter(Boolean)) {
        expect(lessonsRaw).not.toContain(text);
      }
    }
  });

  it("has answers written for the same lesson version, for every drill", () => {
    for (const lesson of lessons) {
      const answer = answers[lesson.id];
      expect(answer?.content_sha256, lesson.id).toBe(lesson.content_sha256);
      expect(Object.keys(answer.drills), lesson.id).toEqual(lesson.drills.map((drill) => drill.id));
      expect(Boolean(answer.model_essay), lesson.id).toBe(lesson.has_model_essay);
    }
  });

  it("gives every learner-facing Vietnamese field Vietnamese text, including the 12 M112 lessons", () => {
    for (const lesson of lessons) {
      const fields = [lesson.goal_vi, lesson.target_vi, ...lesson.steps.flatMap((step) => [step.title_vi, step.instruction_vi]),
        ...lesson.vocabulary.map((word) => word.meaning_vi), ...lesson.drills.flatMap((drill) => [drill.question_vi, drill.hint_vi])];
      for (const field of fields) expect(field, lesson.id).toMatch(vietnamese);
      for (const step of lesson.steps) expect(step.title_vi, lesson.id).not.toMatch(/^Bước \d+$/);
    }
  });
});

describe("Writing Task 2 Lab progress rules", () => {
  const state = (patch: object) => parseTask2State(JSON.stringify({ t2: 1, answers: {}, saved: {}, essay: "", checklist: {}, updatedAt: 1, ...patch }))!;
  const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

  it("counts a drill only after a non-trivial answer was saved", () => {
    expect(drillSaved(state({ answers: { D1: "A clear thesis." } }), "D1")).toBe(false);
    expect(drillSaved(state({ answers: { D1: "ok" }, saved: { D1: "2026-11-18T00:00:00Z" } }), "D1")).toBe(false);
    expect(drillSaved(state({ answers: { D1: "A clear thesis." }, saved: { D1: "2026-11-18T00:00:00Z" } }), "D1")).toBe(true);
  });

  it("asks each stage for its own writing length before the lesson completes", () => {
    for (const stage of ["foundation", "basic", "developing", "advanced"] as const) {
      const { min } = writingTargets[stage];
      expect(essaySaved(state({ essay: words(min - 1), essaySavedAt: "2026-11-18T00:00:00Z" }), stage), stage).toBe(false);
      expect(essaySaved(state({ essay: words(min), essaySavedAt: "2026-11-18T00:00:00Z" }), stage), stage).toBe(true);
      expect(essaySaved(state({ essay: words(min) }), stage), stage).toBe(false);
    }
  });

  it("ignores drafts that are not Writing Task 2 Lab state", () => {
    expect(parseTask2State("not json")).toBeNull();
    expect(parseTask2State(JSON.stringify({ book2: 1, answers: {} }))).toBeNull();
  });
});

describe("Writing Task 2 Lab release", () => {
  it("stays locked in production until its flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();
    const locked = (await import("../src/lib/runtime")).lockedLearnerPath;
    expect(locked("/app/self-study/writing-task-2")).toBe(true);
    expect(locked("/app/self-study/writing-task-2/T2-M113-01")).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_ENABLE_WRITING_TASK2_LAB", "true");
    vi.resetModules();
    const released = (await import("../src/lib/runtime")).lockedLearnerPath;
    expect(released("/app/self-study/writing-task-2/T2-M113-01")).toBe(false);
    expect(released("/app/self-study/writing-task-1")).toBe(true);
  });

  it("opens in development while the other unfinished labs stay locked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { lockedLearnerPath } = await import("../src/lib/runtime");
    expect(lockedLearnerPath("/app/self-study/writing-task-2")).toBe(false);
    for (const path of ["/app/self-study", "/app/self-study/writing-task-1", "/app/self-study/speaking", "/app/self-study/reading"]) expect(lockedLearnerPath(path)).toBe(true);
  });
});
