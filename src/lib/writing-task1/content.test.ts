import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drillFrames, groupGuides } from "./guide";
import { countWords, essaySaved, lessonDone, modelFirst, modelParagraphs, parseTask1State, type Task1Lesson, type Task1Model } from "./types";

const root = join(process.cwd(), "content/writing-task1");
const { lessons } = JSON.parse(readFileSync(join(root, "lessons.json"), "utf8")) as { lessons: Task1Lesson[] };
const answers = (JSON.parse(readFileSync(join(root, "answers.json"), "utf8")) as { lessons: Record<string, { content_sha256: string; checks: Record<string, { answer: string }>; model?: unknown }> }).lessons;
const hash = (lesson: Task1Lesson) => {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])])) : value;
  const body: Partial<Task1Lesson> = { ...lesson };
  delete body.content_sha256;
  return createHash("sha256").update(JSON.stringify(sorted(body))).digest("hex");
};

describe("Writing Task 1 Lab content", () => {
  it("has 37 lessons with unique ids across three stages", () => {
    expect(lessons).toHaveLength(37);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(37);
    expect(new Set(lessons.map((lesson) => lesson.stage))).toEqual(new Set(["foundation", "developing", "advanced"]));
    expect(lessons.filter((lesson) => lesson.kind === "process")).toHaveLength(29);
  });

  it("keeps answers out of the learner file", () => {
    const text = readFileSync(join(root, "lessons.json"), "utf8");
    expect(text).not.toMatch(/"(correct|answer|answer_id|answer_guide|body1|body2)"\s*:/);
  });

  it("binds every guided lesson's answers to the lesson version learners see", () => {
    for (const lesson of lessons.filter((item) => item.kind === "guided")) {
      expect(lesson.content_sha256).toBe(hash(lesson));
      expect(answers[lesson.id]?.content_sha256).toBe(lesson.content_sha256);
      for (const check of lesson.checks) expect(check.options.map((option) => option.id)).toContain(answers[lesson.id].checks[check.id].answer);
      expect(answers[lesson.id].model).toBeTruthy();
    }
  });

  it("serves every figure from public/", () => {
    for (const lesson of lessons) if (lesson.visual.type === "image") expect(existsSync(join(process.cwd(), "public", lesson.visual.src))).toBe(true);
  });

  it("does not ship the owner-only Process keys in answers.json", () => {
    for (const lesson of lessons.filter((item) => item.kind === "process")) expect(answers[lesson.id]).toBeUndefined();
  });
});

describe("Writing Task 1 Lab state", () => {
  it("counts words and the stage length that completes a lesson", () => {
    expect(countWords("Overall, metro use rose by 35%.")).toBe(6);
    const state = parseTask1State(JSON.stringify({ t1: 1, answers: {}, essay: "word ".repeat(30), essaySavedAt: "2026-11-18T00:00:00Z", updatedAt: 1 }))!;
    expect(essaySaved(state, "foundation")).toBe(true);
    expect(essaySaved(state, "developing")).toBe(false);
    expect(parseTask1State("{\"t2\":1}")).toBeNull();
  });

});

describe("Writing Task 1 Lab release", () => {
  afterEach(() => vi.unstubAllEnvs());
  const runtime = async () => { vi.resetModules(); return (await import("../runtime")).lockedLearnerPath; };

  it("is open to learners in production while the other unfinished labs stay locked", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    const locked = await runtime();
    expect(locked("/app/self-study/writing-task-1")).toBe(false);
    expect(locked("/app/self-study/writing-task-1/line")).toBe(false);
    expect(locked("/app/self-study/reading")).toBe(true);
  });

  it("can be closed again with the emergency flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_WRITING_TASK1_LAB", "true");
    const locked = await runtime();
    expect(locked("/app/self-study/writing-task-1/line")).toBe(true);
  });
});

describe("Writing Task 1 Lab teaching flow", () => {
  it("shows a model before writing only in foundation lessons that have one", () => {
    const first = lessons.filter((lesson) => modelFirst(lesson)).map((lesson) => lesson.id).sort();
    expect(first).toEqual(lessons.filter((lesson) => lesson.stage === "foundation" && lesson.has_model).map((lesson) => lesson.id).sort());
    expect(first.length).toBeGreaterThan(0);
    for (const lesson of lessons.filter((item) => item.stage !== "foundation")) expect(modelFirst(lesson)).toBe(false);
  });

  it("has a built-in guide for every figure type and a frame for every drill", () => {
    for (const lesson of lessons) {
      expect(groupGuides[lesson.group], lesson.group).toBeDefined();
      for (const drill of lesson.drills) expect(drillFrames[drill.mode]?.(lesson.group), `${lesson.id}:${drill.mode}`).toBeTruthy();
    }
  });

  it("reads plain and annotated model paragraphs alike", () => {
    const plain: Task1Model = { paragraphs: ["Intro.", "Overall, ...", "Body one.", "Body two."], word_count: 6 };
    expect(modelParagraphs(plain).map((paragraph) => paragraph.role)).toEqual(["intro", "overview", "body1", "body2"]);
    const annotated: Task1Model = { paragraphs: [{ role: "overview", sentences: [{ en: "Overall, x rose.", note_vi: "Hai ý chính." }] }], word_count: 3 };
    expect(modelParagraphs(annotated)[0]).toEqual({ role: "overview", sentences: [{ en: "Overall, x rose.", note_vi: "Hai ý chính." }] });
  });

  it("completes a lesson once the writing is saved at the stage length", () => {
    const state = parseTask1State(JSON.stringify({ t1: 1, answers: {}, essay: "word ".repeat(30), essaySavedAt: "2026-11-18T00:00:00Z" }));
    expect(lessonDone(state ?? undefined, "foundation")).toBe(true);
    expect(lessonDone(state ?? undefined, "developing")).toBe(false);
    expect(lessonDone(undefined, "foundation")).toBe(false);
  });
});
