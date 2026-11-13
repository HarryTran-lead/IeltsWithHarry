import { describe, expect, it } from "vitest";
import { listeningModules } from "./curriculum";
import { buildListeningPlacement, buildListeningPlan, summarizeListeningModules } from "./plan";
import { getStoredLesson } from "../dictation-skill-lab/lessons";
import { gradeAnswer } from "../dictation-skill-lab/grade";

describe("Listening Lab source index", () => {
  it("fills every step of all 28 modules from distinct recordings", () => {
    expect(listeningModules).toHaveLength(28);
    for (const unit of listeningModules) {
      const plan = buildListeningPlan(unit.id);
      expect(plan, unit.id).not.toBeNull();
      expect(plan?.counts, unit.id).toEqual({ guided: 4, independent: 10, transfer: unit.id === "28" ? 40 : 10 });
      const lessonIds = Object.values(plan!.phases).flat().map((task) => task.lessonId);
      expect(new Set(lessonIds).size, unit.id).toBe(lessonIds.length);
      expect(JSON.stringify(plan)).not.toMatch(/correct_answers|text_en|explanation_vi/);
    }
  }, 20_000);

  it("uses all four sections in the 40-question transfer set", () => {
    const transfer = buildListeningPlan("28")!.phases.transfer;
    expect([...new Set(transfer.map((task) => task.section))].sort()).toEqual([1, 2, 3, 4]);
    for (const section of [1, 2, 3, 4])
      expect(transfer.filter((task) => task.section === section).reduce((total, task) => total + task.questionIds.length, 0)).toBe(10);
  });

  it("makes a 12-question diagnostic without answer keys", () => {
    const tasks = buildListeningPlacement();
    expect(tasks.reduce((total, task) => total + task.questionIds.length, 0)).toBe(12);
    expect(JSON.stringify(tasks)).not.toMatch(/correct_answers|text_en|explanation_vi/);
  });

  it("asks every placement question only once", () => {
    const keys = buildListeningPlacement().flatMap((task) => task.questionIds.map((id) => `${task.lessonId}:${id}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("summarises every module with its real question types and length", () => {
    const summaries = summarizeListeningModules();
    expect(summaries).toHaveLength(28);
    for (const summary of summaries) {
      expect(Object.values(summary.types).reduce((sum, count) => sum + count, 0), summary.id).toBe(Object.values(summary.counts).reduce((sum, count) => sum + count, 0));
      expect(summary.durationMs, summary.id).toBeGreaterThan(0);
    }
    expect(JSON.stringify(summaries)).not.toMatch(/correct_answers|text_en|explanation_vi/);
  }, 20_000);

  it("uses foundation answers in practice mode and IELTS completions with word limits", () => {
    const foundation = buildListeningPlan("02")!.phases.guided[0];
    const foundationQuestion = getStoredLesson(foundation.lessonId)!.questions.find((item) => item.question_id === foundation.questionIds[0])!;
    expect(gradeAnswer(foundationQuestion, foundationQuestion.correct_answers[0], "practice").correct).toBe(true);
    for (const task of Object.values(buildListeningPlan("08")!.phases).flat()) {
      const lesson = getStoredLesson(task.lessonId)!;
      for (const id of task.questionIds) expect(lesson.questions.find((item) => item.question_id === id)?.word_limit).toBeGreaterThan(0);
    }
  });
});
