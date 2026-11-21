/*
 * Writing Task 1 Lab on the shared path: its three chặng, "Bài 0" guide and lessons as a PathCourse, and a
 * learner's saved lesson states as PathProgress. Client-safe: it reads the lesson summaries the Lab API returns.
 */
import { TASK1_GUIDE_ID } from "@/lib/writing-task1/guide";
import { TASK1_BASE, drillSaved, lessonDone, stageInfo, stageOrder, type Task1LessonSummary, type Task1State } from "@/lib/writing-task1/types";
import { bandSpan, type LessonProgress, type PathCourse, type PathProgress, type PathStage } from "./path";

/** The guide is read once; any lesson started also means the learner is past it. */
export const TASK1_GUIDE_READ_KEY = "writing-task1-guide-read";

/** `withChecks` adds the review and end-of-stage nodes the design calls for; the Lab has no content for them yet. */
export function task1Course(lessons: Task1LessonSummary[], { withChecks = false } = {}): PathCourse {
  const stages: PathStage[] = stageOrder.map((stage) => {
    const own = lessons.filter((lesson) => lesson.stage === stage);
    return {
      id: stage, title: stageInfo[stage].name, tone: { color: stageInfo[stage].tone, soft: stageInfo[stage].soft }, band: bandSpan(own.map((lesson) => lesson.target_range)),
      lessons: own.map((lesson) => ({
        id: lesson.id, title: lesson.title, meta: `${lesson.group_label}${lesson.kind === "process" && lesson.subtopic ? ` · ${lesson.subtopic}` : ""}`,
        goal: lesson.question, minutes: lesson.minutes, href: `${TASK1_BASE}/${lesson.id}`,
      })),
      ...(withChecks ? { review: {}, checkpoint: { title: "Kiểm tra cuối chặng" } } : {}),
    };
  }).filter((stage) => stage.lessons.length);
  stages[0]?.lessons.unshift({
    id: TASK1_GUIDE_ID, title: "Bài 0 · Task 1 là gì và làm thế nào", meta: "Hướng dẫn · nên đọc trước bài 1",
    goal: "Đề yêu cầu gì, 4 tiêu chí chấm, bố cục 4 đoạn và cách đọc 7 dạng hình.", minutes: 8, href: `${TASK1_BASE}/${TASK1_GUIDE_ID}`, unnumbered: true,
  });
  return {
    lab: "writing-task-1", name: "Writing Task 1", base: TASK1_BASE, stages,
    steps: ["Hiểu đề: đọc đề, gạch chân đối tượng, đơn vị, thời gian", "Đọc hình: trả lời từng câu hỏi về số liệu", "Học mẫu: xem bài mẫu tô màu theo Mở bài, Overview, Body", "Luyện khung: viết từng câu theo khung gợi ý", "Viết bài: viết cả bài rồi tự chấm theo checklist"],
  };
}

/** Where a learner stands in one lesson; the step matches where the lesson page reopens. */
export function task1LessonProgress(lesson: Pick<Task1LessonSummary, "stage" | "check_count" | "drill_count">, state: Task1State | undefined): LessonProgress | undefined {
  if (!state) return undefined;
  const results = Object.values(state.results);
  const right = results.filter((result) => result.correct).length;
  const drills = Object.keys(state.saved).filter((id) => drillSaved(state, id)).length;
  const base = { right, total: lesson.check_count, mistakes: results.length - right };
  if (lessonDone(state, lesson.stage)) return { ...base, done: true };
  const started = results.length > 0 || drills > 0 || Boolean(state.essay.trim()) || Object.values(state.answers).some((text) => text.trim());
  if (!started) return undefined;
  const step = drills >= lesson.drill_count && lesson.drill_count > 0 ? 4 : drills ? 3 : results.length ? 1 : 0;
  return { ...base, step };
}

export function task1Progress(lessons: Task1LessonSummary[], states: Record<string, Task1State>, guideRead: boolean): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {} };
  for (const lesson of lessons) {
    const value = task1LessonProgress(lesson, states[lesson.id]);
    if (value) progress.lessons[lesson.id] = value;
  }
  if (guideRead || Object.keys(progress.lessons).length) progress.lessons[TASK1_GUIDE_ID] = { done: true };
  return progress;
}
