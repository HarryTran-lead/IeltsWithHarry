/*
 * Writing Task 2 Lab on the shared path. The Lab has two halves and each becomes its own path:
 * - "Luyện đề": 36 prompt lessons in four chặng (Nền tảng → Nâng cao), four steps per lesson;
 * - "Khoá kỹ năng": the R01–R16 milestones grouped in six layers.
 * Client-safe: built from the summaries the Lab APIs return and the learner's saved work.
 */
import { COURSE_BASE, courseLayers, type CourseModuleSummary } from "@/lib/writing-task2/course-types";
import { TASK2_BASE, drillSaved, essaySaved, questionTypeLabels, stageInfo, stageOrder, type Task2LessonSummary, type Task2Stage, type Task2State } from "@/lib/writing-task2/types";
import { bandSpan, type LessonProgress, type PathCourse, type PathProgress, type PathStage } from "./path";

/** The level a new learner picked to start from (the Lab already stored it under this key). */
export const TASK2_LEVEL_KEY = "writing-task2-level";

export function readTask2Level(): Task2Stage | undefined {
  try {
    const saved = localStorage.getItem(TASK2_LEVEL_KEY);
    return saved && stageOrder.includes(saved as Task2Stage) ? saved as Task2Stage : undefined;
  } catch { return undefined; }
}

/* ── Luyện đề ── */

export function task2LessonsCourse(lessons: Task2LessonSummary[], { withChecks = false } = {}): PathCourse {
  const stages: PathStage[] = stageOrder.map((stage) => {
    const own = lessons.filter((lesson) => lesson.stage === stage);
    return {
      id: stage, title: stageInfo[stage].name, tone: { color: stageInfo[stage].tone, soft: stageInfo[stage].soft }, band: bandSpan(own.map((lesson) => lesson.target_range)),
      lessons: own.map((lesson) => ({
        id: lesson.id, title: lesson.topic, meta: questionTypeLabels[lesson.question_type] ?? lesson.question_type,
        goal: lesson.goal_vi, minutes: lesson.minutes, href: `${TASK2_BASE}/${lesson.id}`,
      })),
      ...(withChecks ? { review: {}, checkpoint: { title: "Kiểm tra cuối chặng" } } : {}),
    };
  }).filter((stage) => stage.lessons.length);
  return {
    lab: "writing-task-2", name: "Writing Task 2", base: TASK2_BASE, stages, stepCount: 4,
    steps: ["Hiểu đề: dạng đề, từ khoá, bẫy cần tránh", "Học cách làm: bài giảng ngắn, khung câu, ngữ pháp", "Làm mẫu: xem từng bước của bài mẫu có chú thích", "Luyện từng câu: có cách làm, gợi ý 3 bậc, đáp án mẫu", "Viết bài: ghép các câu đã viết, tự kiểm tra"],
  };
}

/** A lesson is complete once every drill is saved and the essay is saved at the stage's length, as before. */
export function task2LessonProgress(lesson: Pick<Task2LessonSummary, "stage" | "drill_count">, state: Task2State | undefined): LessonProgress | undefined {
  if (!state) return undefined;
  const drills = Object.keys(state.saved).filter((id) => drillSaved(state, id)).length;
  const essay = essaySaved(state, lesson.stage);
  if (essay && drills >= lesson.drill_count) return { done: true };
  const started = drills > 0 || Boolean(state.essay.trim()) || Object.values(state.answers).some((text) => text.trim()) || Object.keys(state.peeked).length > 0;
  if (!started) return undefined;
  return { step: essay || drills >= lesson.drill_count ? 3 : drills ? 2 : 1 };
}

export function task2LessonsProgress(lessons: Task2LessonSummary[], states: Record<string, Task2State>, startAt?: Task2Stage): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {}, startAt };
  for (const lesson of lessons) {
    const value = task2LessonProgress(lesson, states[lesson.id]);
    if (value) progress.lessons[lesson.id] = value;
  }
  return progress;
}

/* ── Khoá kỹ năng ── */

export function task2SkillsCourse(modules: CourseModuleSummary[]): PathCourse {
  const byId = new Map(modules.map((item) => [item.id, item]));
  return {
    lab: "writing-task-2-course", name: "Writing Task 2 · Khoá kỹ năng", base: COURSE_BASE,
    stages: courseLayers.map((layer) => ({
      id: `layer-${layer.id}`, title: layer.name, about: layer.about,
      lessons: layer.modules.map((id) => byId.get(id)).filter((item): item is CourseModuleSummary => Boolean(item)).map((item) => ({
        id: item.id, title: item.title, goal: item.overview, href: `${COURSE_BASE}/${item.id}`,
        meta: `${item.id} · ${item.counts.units} bài giảng${item.counts.examples ? ` · ${item.counts.examples} ví dụ` : ""} · ${item.counts.practice} câu luyện`,
      })),
    })).filter((stage) => stage.lessons.length),
    steps: ["Bài giảng: đọc các bài giảng của chặng", "Ví dụ mẫu: xem cách làm trước khi tự viết", "Luyện tập: từng câu, có gợi ý", "Bài thi cuối: viết có giờ (R16)", "Sổ lỗi: ôn lại lỗi đã gặp"],
  };
}

/** A milestone is complete once every practice item has a saved attempt. `counts` comes from loadCourseProgress. */
export function task2SkillsProgress(modules: CourseModuleSummary[], counts: Record<string, number>): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {} };
  for (const item of modules) {
    const done = Math.min(counts[item.id] ?? 0, item.counts.practice);
    if (item.counts.practice > 0 && done >= item.counts.practice) progress.lessons[item.id] = { done: true, note: `Đã làm ${done}/${item.counts.practice} câu` };
    else if (done > 0) progress.lessons[item.id] = { step: 0, note: `Đã làm ${done}/${item.counts.practice} câu` };
  }
  return progress;
}
