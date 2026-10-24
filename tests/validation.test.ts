import { describe, expect, it } from "vitest";
import { dailyGoalSchema, draftSchema, exerciseAnswersSchema, taskSchema } from "../src/lib/validation/study";

const task = { title: "  Read a passage  ", skill: "Reading", date: "2026-10-24", time: "09:00", priority: "Medium", completed: false };
describe("learner input validation", () => {
  it("normalizes a valid task and rejects malformed due dates", () => {
    expect(taskSchema.parse(task).title).toBe("Read a passage");
    expect(taskSchema.safeParse({ ...task, date: "2026-02-30" }).success).toBe(false);
  });
  it("bounds goals and draft size", () => {
    expect(dailyGoalSchema.safeParse(21).success).toBe(false);
    expect(dailyGoalSchema.safeParse(5).success).toBe(true);
    expect(draftSchema.safeParse("a".repeat(20001)).success).toBe(false);
  });
  it("rejects answer indexes outside the supported range", () => {
    expect(exerciseAnswersSchema.safeParse({ q1: 2 }).success).toBe(true);
    expect(exerciseAnswersSchema.safeParse({ q1: 99 }).success).toBe(false);
  });
});
