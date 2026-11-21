"use client";
/*
 * The two halves of Writing Task 2 Lab as paths, shared by both halves so each can point at the other:
 * the prompt lessons (Luyện đề) and the R01–R16 skills course (Khoá kỹ năng).
 */
import { useEffect, useMemo, useState } from "react";
import { buildPath, type PathNode } from "@/lib/self-study-path/path";
import { readTask2Level, task2LessonsCourse, task2LessonsProgress, task2SkillsCourse, task2SkillsProgress } from "@/lib/self-study-path/task2";
import { COURSE_API, skillForType, type CourseModuleSummary } from "@/lib/writing-task2/course-types";
import { TASK2_API, type Task2LessonSummary, type Task2Stage, type Task2State } from "@/lib/writing-task2/types";
import { loadCourseDone } from "./course-state";
import { loadAllTask2States } from "./task2-state";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

/** Prompt lessons, the learner's saved work and chosen level, and the path built from them. */
export function useTask2Path() {
  const [lessons, setLessons] = useState<Task2LessonSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, Task2State> | null>(null);
  const [level, setLevel] = useState<Task2Stage | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void getJson<{ lessons: Task2LessonSummary[] }>(TASK2_API).then(async ({ lessons: list }) => {
      if (!alive) return;
      setLevel(readTask2Level());
      setLessons(list);
      const saved = await loadAllTask2States(list.map((lesson) => lesson.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const course = useMemo(() => lessons ? task2LessonsCourse(lessons) : null, [lessons]);
  const view = useMemo(() => course && lessons && states ? buildPath(course, task2LessonsProgress(lessons, states, level)) : null, [course, lessons, states, level]);
  return { lessons, course, view, error, level, setLevel };
}

/** The skills milestone that teaches a question type, with where the learner stands on it. Null while loading or when none. */
export function useSkillFor(questionType: string): { module: CourseModuleSummary; node?: PathNode } | null {
  const [found, setFound] = useState<{ module: CourseModuleSummary; node?: PathNode } | null>(null);
  useEffect(() => {
    const id = skillForType(questionType);
    if (!id) return;
    let alive = true;
    void Promise.all([getJson<{ modules: CourseModuleSummary[] }>(COURSE_API), loadCourseDone().catch(() => ({}))]).then(([{ modules }, done]) => {
      if (!alive) return;
      const milestone = modules.find((item) => item.id === id);
      if (!milestone) return;
      const view = buildPath(task2SkillsCourse(modules), task2SkillsProgress(modules, done, readTask2Level()));
      setFound({ module: milestone, node: view.stages.flatMap((stage) => stage.nodes).find((node) => node.id === id) });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [questionType]);
  return found;
}
