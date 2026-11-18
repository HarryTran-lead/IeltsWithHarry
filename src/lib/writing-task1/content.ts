import "server-only";
/*
 * Writing Task 1 Lab content, imported from the F37 owner package by scripts/import-writing-task1-f37.py.
 * Everything stays in content/ (not public/) and is read on the server. answers.json holds the guided
 * lessons' quiz keys and model answers; private/process-keys.json holds the Process keys, which the
 * package marks owner-only, so it is gitignored and absent on deployments until it gets a private home.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task1CheckResult, Task1DrillAnswer, Task1Lesson, Task1LessonSummary, Task1Model } from "./types";

type LessonAnswers = { content_sha256: string; checks: Record<string, Omit<Task1CheckResult, "correct"> & { explanation_en?: string }>; drills: Record<string, Task1DrillAnswer>; model?: Task1Model };
type AnswerFile = { lessons: Record<string, LessonAnswers> };

const root = join(process.cwd(), "content/writing-task1");
let lessonsCache: Task1Lesson[] | null = null;
let answersCache: Record<string, LessonAnswers> | null = null;

export function task1Lessons(): Task1Lesson[] {
  lessonsCache ??= (JSON.parse(readFileSync(join(root, "lessons.json"), "utf8")) as { lessons: Task1Lesson[] }).lessons;
  return lessonsCache;
}

export function task1Lesson(id: string) {
  return task1Lessons().find((lesson) => lesson.id === id) ?? null;
}

export function task1Summaries(): Task1LessonSummary[] {
  return task1Lessons().map((lesson) => ({
    id: lesson.id, kind: lesson.kind, group: lesson.group, group_label: lesson.group_label, subtopic: lesson.subtopic, stage: lesson.stage,
    target_range: lesson.target_range, title: lesson.title, question: lesson.question, minutes: lesson.minutes, has_model: lesson.has_model,
    check_count: lesson.checks.length, drill_count: lesson.drills.length,
  }));
}

function readAnswers(file: string): Record<string, LessonAnswers> {
  const path = join(root, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as AnswerFile).lessons : {};
}

/** Answers for a lesson, only when they were written for the lesson version learners see. */
export function task1Answers(lesson: Task1Lesson) {
  answersCache ??= { ...readAnswers("answers.json"), ...readAnswers("private/process-keys.json") };
  const answers = answersCache[lesson.id];
  return answers && answers.content_sha256 === lesson.content_sha256 ? answers : null;
}
