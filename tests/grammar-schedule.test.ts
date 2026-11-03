import { describe, expect, it } from "vitest";
import { dueLessons, flaggedQuestions, isDue, mainStagesDone, openStage, scheduleAfterLearn, scheduleAfterReview, spacedQueue, stageQueue } from "../src/lib/grammar/schedule";
import type { GrammarLessonProgress, GrammarPracticeItem } from "../src/lib/grammar/types";

const now = "2026-11-03T08:00:00.000Z";
const item = (id: string, stage: GrammarPracticeItem["stage"]): GrammarPracticeItem => ({ id, stage, type: "mcq", instruction: "", prompt: id, translation: null, options: ["a", "b"], chunks: [], hint: null, publishable: false });
const items = [
  ...Array.from({ length: 15 }, (_, i) => item(`A1-01-Q${String(i + 1).padStart(2, "0")}`, "guided")),
  ...Array.from({ length: 5 }, (_, i) => item(`A1-01-Q${i + 16}`, "independent")),
  item("A1-01-Q21", "mastery"), item("A1-01-Q22", "mastery"),
  item("A1-01-SR-01", "spaced_review"), item("A1-01-SR-02", "spaced_review"),
];
const lesson = (statuses: Record<string, "UNDERSTOOD" | "NEED_REVIEW" | "SKIPPED">, extra: Partial<GrammarLessonProgress> = {}): GrammarLessonProgress => ({
  theorySeen: true, updatedAt: now, ...extra,
  responses: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { answer: "a", status, updatedAt: now }])),
});

describe("Grammar sessions", () => {
  it("serves the next twelve unanswered questions of a stage and skips answered ones", () => {
    const progress = lesson({ "A1-01-Q01": "UNDERSTOOD", "A1-01-Q02": "NEED_REVIEW", "A1-01-Q03": "SKIPPED" });
    const queue = stageQueue(items, "guided", progress);
    expect(queue).toHaveLength(12);
    expect(queue[0].id).toBe("A1-01-Q03");
    expect(queue.map((q) => q.id)).not.toContain("A1-01-Q01");
  });

  it("puts mistakes first when a finished stage is practised again", () => {
    const statuses = Object.fromEntries(items.filter((q) => q.stage === "independent").map((q) => [q.id, "UNDERSTOOD" as const]));
    statuses["A1-01-Q19"] = "NEED_REVIEW" as never;
    expect(stageQueue(items, "independent", lesson(statuses))[0].id).toBe("A1-01-Q19");
  });

  it("moves to the next teaching stage and knows when teaching is done", () => {
    const guided = Object.fromEntries(items.filter((q) => q.stage === "guided").map((q) => [q.id, "UNDERSTOOD" as const]));
    expect(openStage(items, lesson(guided))).toBe("independent");
    const all = Object.fromEntries(items.filter((q) => q.stage !== "spaced_review").map((q) => [q.id, "UNDERSTOOD" as const]));
    expect(mainStagesDone(items, lesson(all))).toBe(true);
    expect(mainStagesDone(items, lesson(guided))).toBe(false);
  });
});

describe("Grammar spaced review", () => {
  it("starts a day after learning and climbs the ladder on a good round", () => {
    const first = scheduleAfterLearn(now);
    expect(first).toEqual({ step: 0, due: "2026-11-04T08:00:00.000Z" });
    expect(isDue(first, now)).toBe(false);
    expect(isDue(first, "2026-11-04T09:00:00.000Z")).toBe(true);
    const second = scheduleAfterReview(first, 0.9, "2026-11-04T09:00:00.000Z");
    expect(second).toMatchObject({ step: 1, due: "2026-11-07T09:00:00.000Z" });
  });

  it("returns the lesson tomorrow after a weak round", () => {
    expect(scheduleAfterReview({ step: 3, due: now }, 0.5, now)).toMatchObject({ step: 0, due: "2026-11-04T08:00:00.000Z" });
  });

  it("mixes the lesson's mistakes with review questions", () => {
    const queue = spacedQueue(items, lesson({ "A1-01-Q05": "NEED_REVIEW" }), 5);
    expect(queue[0].id).toBe("A1-01-Q05");
    expect(queue.map((q) => q.id)).toEqual(expect.arrayContaining(["A1-01-SR-01", "A1-01-SR-02"]));
    expect(queue).toHaveLength(5);
  });

  it("lists due lessons and open mistakes oldest first", () => {
    const progress = {
      "A1-01": lesson({ "A1-01-Q02": "NEED_REVIEW" }, { review: { step: 0, due: "2026-11-02T08:00:00.000Z" } }),
      "A1-02": lesson({}, { review: { step: 1, due: "2026-11-09T08:00:00.000Z" } }),
      "A1-03": { theorySeen: true, updatedAt: now, responses: { "A1-03-Q01": { answer: "x", status: "NEED_REVIEW" as const, updatedAt: now, wrongAt: "2026-11-01T08:00:00.000Z" } } },
    };
    expect(dueLessons(progress, now)).toEqual(["A1-01"]);
    expect(flaggedQuestions(progress).map((q) => q.id)).toEqual(["A1-03-Q01", "A1-01-Q02"]);
  });
});
