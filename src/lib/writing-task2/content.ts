import "server-only";
/*
 * Writing Task 2 Lab content, imported from the M123 package by scripts/import-writing-task2-m123.py.
 * Both files stay in content/ (not public/) and are read on the server: answers.json holds the
 * reference answers and model essays, which only the reveal route hands out.
 *
 * content/writing-task2/enrich/<lessonId>.json deepens one lesson for self-study (the "Prompt 7" shape in
 * docs/WRITING_TASK2_CONTENT_PROMPTS.md). It is merged here: learner-facing fields go to the lesson, while
 * answers, option keys and the model go to the answers, so they never reach the browser unasked.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task2Annotation, Task2Drill, Task2DrillAnswer, Task2DrillLevel, Task2Lesson, Task2LessonSummary, Task2ModelEssay } from "./types";

type LessonAnswers = { content_sha256: string; drills: Record<string, Task2DrillAnswer>; model_essay?: Task2ModelEssay };
type AnswerFile = { lessons: Record<string, LessonAnswers> };

/** One lesson's enrichment file. Every field is optional except the lesson id and the drills' ids. */
export type Task2Enrichment = {
  lesson_id: string;
  /** The lesson version it was written for; a changed lesson ignores stale enrichment. */
  content_sha256?: string;
  topic_id?: string; skill_ids?: string[];
  goal_vi?: string; prompt_vi?: string;
  prompt_analysis?: Task2Lesson["prompt_analysis"];
  mini_lesson?: Task2Lesson["mini_lesson"];
  vocabulary?: Task2Lesson["vocabulary"];
  grammar_focus?: Task2Lesson["grammar_focus"];
  steps?: Task2Lesson["steps"];
  drills?: {
    id: string; level?: Task2DrillLevel; how_to_vi?: string; question_vi?: string; hints?: string[];
    options?: { id: string; text_en: string; correct?: boolean; feedback_vi?: string }[];
    frame_en?: string; word_bank_en?: string[];
    answer_en?: string; answer_vi?: string; why_vi?: string; alternatives_en?: string[];
    common_mistake?: { wrong_en: string; fix_en: string; why_vi: string; error_id?: string };
  }[];
  model?: { kind?: Task2ModelEssay["kind"]; title?: string; text_en: string; text_vi?: string; word_count?: number; why_vi?: string; outline_vi?: string; annotations?: Task2Annotation[] };
  self_check_vi?: string[];
  review?: Task2Lesson["review"] & { next_practice?: string[] };
};

const root = join(process.cwd(), "content/writing-task2");
let cache: { lessons: Task2Lesson[]; answers: Record<string, LessonAnswers> } | null = null;

export function readTask2Enrichments(dir = join(root, "enrich")): Task2Enrichment[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Task2Enrichment);
}

/** Why an enrichment cannot apply to its lesson, or null when it fits. */
export function enrichmentProblem(lesson: Task2Lesson | undefined, enrichment: Task2Enrichment) {
  if (!lesson) return `no lesson ${enrichment.lesson_id}`;
  if (enrichment.content_sha256 && enrichment.content_sha256 !== lesson.content_sha256) return `${lesson.id}: written for another lesson version`;
  if (enrichment.drills) {
    const ids = enrichment.drills.map((drill) => drill.id).join(",");
    if (ids !== lesson.drills.map((drill) => drill.id).join(",")) return `${lesson.id}: drill ids differ from the lesson`;
    for (const drill of enrichment.drills) {
      if (drill.options?.length && drill.options.filter((option) => option.correct).length !== 1) return `${drill.id}: needs exactly one correct option`;
    }
  }
  return null;
}

export function applyTask2Enrichment(lesson: Task2Lesson, answers: LessonAnswers | undefined, enrichment: Task2Enrichment): { lesson: Task2Lesson; answers: LessonAnswers | undefined } {
  const next: Task2Lesson = { ...lesson, enriched: true };
  for (const key of ["topic_id", "skill_ids", "goal_vi", "prompt_vi", "prompt_analysis", "mini_lesson", "grammar_focus", "self_check_vi"] as const) {
    if (enrichment[key] !== undefined) (next as Record<string, unknown>)[key] = enrichment[key];
  }
  if (enrichment.vocabulary?.length) next.vocabulary = enrichment.vocabulary;
  if (enrichment.steps?.length) next.steps = enrichment.steps;
  if (enrichment.review) next.review = { remember_vi: enrichment.review.remember_vi ?? [], mistakes_vi: enrichment.review.mistakes_vi ?? [] };

  const drills = { ...(answers?.drills ?? {}) };
  const byId = new Map((enrichment.drills ?? []).map((drill) => [drill.id, drill]));
  next.drills = lesson.drills.map((drill): Task2Drill => {
    const extra = byId.get(drill.id);
    if (!extra) return drill;
    const merged: Task2Drill = { ...drill };
    if (extra.level) merged.level = extra.level;
    if (extra.how_to_vi) merged.how_to_vi = extra.how_to_vi;
    if (extra.question_vi) merged.question_vi = extra.question_vi;
    if (extra.hints?.length) merged.hints = extra.hints;
    if (extra.options?.length) merged.options = extra.options.map(({ id, text_en }) => ({ id, text_en }));
    if (extra.frame_en) merged.frame_en = extra.frame_en;
    if (extra.word_bank_en?.length) merged.word_bank_en = extra.word_bank_en;
    const previous = drills[drill.id];
    drills[drill.id] = {
      answer_guide: extra.answer_en ?? previous?.answer_guide ?? "",
      explanation_vi: extra.why_vi ?? previous?.explanation_vi ?? "",
      ...(extra.answer_vi && { answer_vi: extra.answer_vi }),
      ...(extra.alternatives_en?.length && { alternatives_en: extra.alternatives_en }),
      ...(extra.common_mistake && { common_mistake: { wrong_en: extra.common_mistake.wrong_en, fix_en: extra.common_mistake.fix_en, why_vi: extra.common_mistake.why_vi } }),
      ...(extra.options?.length && {
        correct: extra.options.find((option) => option.correct)?.id,
        option_feedback: Object.fromEntries(extra.options.filter((option) => option.feedback_vi).map((option) => [option.id, option.feedback_vi!])),
      }),
    };
    return merged;
  });

  let model = answers?.model_essay;
  if (enrichment.model?.text_en) {
    const source = enrichment.model;
    model = {
      title: source.title ?? lesson.topic, essay: source.text_en, word_count: source.word_count ?? source.text_en.trim().split(/\s+/).length,
      explanation_vi: source.why_vi ?? "", outline_vi: source.outline_vi ?? "", kind: source.kind, text_vi: source.text_vi, annotations: source.annotations,
    };
    next.has_model_essay = true;
  }
  return { lesson: next, answers: { content_sha256: lesson.content_sha256, drills, ...(model && { model_essay: model }) } };
}

function load() {
  if (cache) return cache;
  const lessons = (JSON.parse(readFileSync(join(root, "lessons.json"), "utf8")) as { lessons: Task2Lesson[] }).lessons;
  const answers = (JSON.parse(readFileSync(join(root, "answers.json"), "utf8")) as AnswerFile).lessons;
  const byId = new Map(lessons.map((lesson, index) => [lesson.id, index]));
  for (const enrichment of readTask2Enrichments()) {
    const index = byId.get(enrichment.lesson_id);
    const lesson = index === undefined ? undefined : lessons[index];
    const problem = enrichmentProblem(lesson, enrichment);
    if (problem || !lesson || index === undefined) { console.warn(`[writing-task2] enrichment skipped: ${problem}`); continue; }
    const base = answers[lesson.id];
    const merged = applyTask2Enrichment(lesson, base && base.content_sha256 === lesson.content_sha256 ? base : undefined, enrichment);
    lessons[index] = merged.lesson;
    if (merged.answers) answers[lesson.id] = merged.answers;
  }
  cache = { lessons, answers };
  return cache;
}

export function task2Lessons(): Task2Lesson[] {
  return load().lessons;
}

export function task2Lesson(id: string) {
  return task2Lessons().find((lesson) => lesson.id === id) ?? null;
}

export function task2Summaries(): Task2LessonSummary[] {
  return task2Lessons().map((lesson) => ({
    id: lesson.id, pack: lesson.pack, stage: lesson.stage, target_range: lesson.target_range, question_type: lesson.question_type,
    topic: lesson.topic, prompt: lesson.prompt, minutes: lesson.minutes, goal_vi: lesson.goal_vi, target_vi: lesson.target_vi,
    has_model_essay: lesson.has_model_essay, drill_count: lesson.drills.length,
    ...(lesson.enriched && { enriched: true }), ...(lesson.prompt_vi && { prompt_vi: lesson.prompt_vi }),
  }));
}

/** Answers for a lesson, only when they were written for the lesson version learners see. */
export function task2Answers(lesson: Task2Lesson) {
  const answers = load().answers[lesson.id];
  return answers && answers.content_sha256 === lesson.content_sha256 ? answers : null;
}
