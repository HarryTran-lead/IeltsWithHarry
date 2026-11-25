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
  it("is locked in production while IELTS practice is closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();
    const production = (await import("../src/lib/runtime")).lockedLearnerPath;
    expect(production("/app/self-study/writing-task-2")).toBe(true);
    expect(production("/app/self-study/writing-task-2/T2-M113-01")).toBe(true);
  });

  it("opens in the unlocked preview, and the disable flag locks it again", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "true");
    vi.resetModules();
    const released = (await import("../src/lib/runtime")).lockedLearnerPath;
    expect(released("/app/self-study/writing-task-2")).toBe(false);
    expect(released("/app/self-study/writing-task-2/T2-M113-01")).toBe(false);
    expect(released("/app/self-study/reading")).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_DISABLE_WRITING_TASK2_LAB", "true");
    vi.resetModules();
    const locked = (await import("../src/lib/runtime")).lockedLearnerPath;
    expect(locked("/app/self-study/writing-task-2")).toBe(true);
    expect(locked("/app/self-study/writing-task-2/T2-M113-01")).toBe(true);
  });

  it("opens in development while the other unfinished labs stay locked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { lockedLearnerPath } = await import("../src/lib/runtime");
    expect(lockedLearnerPath("/app/self-study/writing-task-2")).toBe(false);
    for (const path of ["/app/self-study", "/app/self-study/reading"]) expect(lockedLearnerPath(path)).toBe(true);
  });
});

describe("Writing Task 2 Lab enrichment", () => {
  const countWordsIn = (text: string) => text.trim().split(/\s+/).length;

  it("applies every enrichment file to its lesson version, with exactly one key per choice drill", async () => {
    const { enrichmentProblem, readTask2Enrichments } = await import("../src/lib/writing-task2/content");
    const files = readTask2Enrichments();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(enrichmentProblem(lessons.find((lesson) => lesson.id === file.lesson_id), file), file.lesson_id).toBeNull();
  });

  it("keeps answers, option keys and models on the server side of the merge", async () => {
    const { task2Answers, task2Lesson } = await import("../src/lib/writing-task2/content");
    const lesson = task2Lesson("T2-M113-01")!;
    expect(lesson.enriched).toBe(true);
    // Grammar mini-drill answers and good/bad pairs are teaching material and stay visible; drill keys and the model do not.
    expect(JSON.stringify(lesson.drills)).not.toMatch(/"correct"|feedback_vi|answer_en|why_vi|common_mistake|answer_vi|alternatives_en/);
    expect(JSON.stringify(lesson)).not.toContain("I agree that local councils should organise free exchange markets.");
    const answer = task2Answers(lesson)!;
    expect(answer.drills["T2-M113-01-D1"].correct).toBe("a");
    expect(answer.drills["T2-M113-01-D5"].answer_guide).toMatch(/household waste/);
    expect(answer.model_essay?.kind).toBe("paragraph");
    expect(lesson.has_model_essay).toBe(true);
  });

  it("states real word counts and teaches before it asks in the foundation lessons", async () => {
    const { readTask2Enrichments } = await import("../src/lib/writing-task2/content");
    for (const file of readTask2Enrichments()) {
      if (file.model?.word_count) expect(Math.abs(file.model.word_count - countWordsIn(file.model.text_en)), file.lesson_id).toBeLessThanOrEqual(2);
      const lesson = lessons.find((item) => item.id === file.lesson_id)!;
      if (lesson.stage === "foundation" && file.drills) {
        const guided = file.drills.filter((drill) => drill.level === "recognize" || drill.level === "complete").length;
        expect(guided * 2, file.lesson_id).toBeGreaterThanOrEqual(file.drills.length);
      }
      const hints = (file.drills ?? []).flatMap((drill) => drill.hints ?? []);
      expect(new Set(hints).size, `${file.lesson_id} repeats a hint`).toBe(hints.length);
      for (const drill of file.drills ?? []) expect(drill.answer_en ?? "", drill.id).not.toMatch(/^(Keep|Explain|Use|Check|Make|Write|Add|Avoid)\b/);
    }
  });

  it("lets a stuck learner open the answer before writing, without counting it as done", () => {
    const peeked = parseTask2State(JSON.stringify({ t2: 1, answers: {}, saved: {}, peeked: { D1: "2026-11-18T00:00:00Z" }, essay: "", checklist: {}, updatedAt: 1 }))!;
    expect(peeked.peeked.D1).toBeTruthy();
    expect(drillSaved(peeked, "D1")).toBe(false);
    expect(parseTask2State(JSON.stringify({ t2: 1, answers: {}, essay: "", updatedAt: 1 }))).toMatchObject({ peeked: {}, choices: {}, fills: {} });
  });
});
