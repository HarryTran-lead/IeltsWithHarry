/*
 * The IELTS Skill Lab path F1 → S4: where to start (placement), when a stage counts as done,
 * and the weekly goal. Pure functions, shared by the API and the learner screens.
 */
import { skillLabStages } from "./stages";

export type StageId = (typeof skillLabStages)[number]["id"];
export const stageIds = skillLabStages.map((stage) => stage.id) as StageId[];

/** Sentences per stage in the placement check (10 in all, easiest first). */
export const placementPlan: Record<StageId, number> = { F1: 2, F2: 2, F3: 1, S1: 2, S2: 1, S3: 1, S4: 1 };
export const STAGE_TEST_SIZE = 10;
/** A stage test passes at 80% of sentences; the next stage is suggested once 70% of a stage's lessons are done. */
export const STAGE_TEST_PASS = 0.8;
export const UNLOCK_SHARE = 0.7;
export const weeklyGoalChoices = [3, 5, 7, 10] as const;
export const DEFAULT_WEEKLY_GOAL = 5;

export type PlacementAnswer = { stage: string; accuracy: number; passed: boolean };

/**
 * The first stage the learner did not handle: fewer than half its sentences passed, or average
 * word accuracy under 80%. Stages missing from the check (no audio yet, or sentences too long for
 * a placement) are skipped; when every tested stage went well, the stage after the highest one.
 */
export function recommendStage(answers: PlacementAnswer[]): StageId {
  let highest = -1;
  for (const [index, stage] of stageIds.entries()) {
    const here = answers.filter((answer) => answer.stage === stage);
    if (!here.length) continue;
    highest = index;
    const passed = here.filter((answer) => answer.passed).length / here.length;
    const accuracy = here.reduce((sum, answer) => sum + answer.accuracy, 0) / here.length;
    if (passed < 0.5 || accuracy < 0.8) return stage;
  }
  return stageIds[Math.min(stageIds.length - 1, highest + 1)];
}

export function stageIndex(stage: string) {
  return Math.max(0, stageIds.indexOf(stage as StageId));
}

/** Monday 00:00 (local time) of the week that contains `date`. */
export function weekStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}
