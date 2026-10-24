import { describe, expect, it } from "vitest";
import { completeNextLinkedTask } from "../src/lib/learning-progress";
import type { StudyTask } from "../src/lib/demo-data";

const task = (id: string, date: string, lesson: string, completed = false): StudyTask => ({
  id, title: id, date, lesson, completed, skill: "Reading", time: "09:00", priority: "Medium",
});

describe("linked planner tasks", () => {
  it("completes only the next open task for a submitted lesson", () => {
    const tasks = [task("later", "2026-10-26", "reading-a"), task("other", "2026-10-24", "reading-b"), task("first", "2026-10-24", "reading-a")];
    const result = completeNextLinkedTask(tasks, "reading-a");
    expect(result.find((item) => item.id === "first")?.completed).toBe(true);
    expect(result.find((item) => item.id === "later")?.completed).toBe(false);
    expect(result.find((item) => item.id === "other")?.completed).toBe(false);
  });
});
