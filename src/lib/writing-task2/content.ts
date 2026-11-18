import "server-only";
/*
 * Writing Task 2 Lab content, imported from the M123 package by scripts/import-writing-task2-m123.py.
 * Both files stay in content/ (not public/) and are read on the server: answers.json holds the
 * reference answers and model essays, which only the reveal route hands out after a saved attempt.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task2DrillAnswer, Task2Lesson, Task2LessonSummary, Task2ModelEssay } from "./types";

type AnswerFile = { lessons: Record<string, { content_sha256: string; drills: Record<string, Task2DrillAnswer>; model_essay?: Task2ModelEssay }> };

const root = join(process.cwd(), "content/writing-task2");
let lessonsCache: Task2Lesson[] | null = null;
let answersCache: AnswerFile | null = null;

export function task2Lessons(): Task2Lesson[] {
  lessonsCache ??= (JSON.parse(readFileSync(join(root, "lessons.json"), "utf8")) as { lessons: Task2Lesson[] }).lessons;
  return lessonsCache;
}

export function task2Lesson(id: string) {
  return task2Lessons().find((lesson) => lesson.id === id) ?? null;
}

export function task2Summaries(): Task2LessonSummary[] {
  return task2Lessons().map((lesson) => ({
    id: lesson.id, pack: lesson.pack, stage: lesson.stage, target_range: lesson.target_range, question_type: lesson.question_type,
    topic: lesson.topic, prompt: lesson.prompt, minutes: lesson.minutes, goal_vi: lesson.goal_vi, target_vi: lesson.target_vi,
    has_model_essay: lesson.has_model_essay, drill_count: lesson.drills.length,
  }));
}

/** Answers for a lesson, only when they were written for the lesson version learners see. */
export function task2Answers(lesson: Task2Lesson) {
  answersCache ??= JSON.parse(readFileSync(join(root, "answers.json"), "utf8")) as AnswerFile;
  const answers = answersCache.lessons[lesson.id];
  return answers && answers.content_sha256 === lesson.content_sha256 ? answers : null;
}
