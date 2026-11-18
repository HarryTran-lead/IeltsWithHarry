import { allLessons, audioReady, catalog, getStoredLesson, type LessonQuestion, type StoredLesson } from "../dictation-skill-lab/lessons";
import { listeningModuleById, listeningModules, type ListeningModule } from "./curriculum";

export type ListeningPhase = "guided" | "independent" | "transfer";
export type ListeningTask = { lessonId: string; questionIds: string[]; title: string; section: number; types: string[] };
export type ListeningModulePlan = { module: ListeningModule; phases: Record<ListeningPhase, ListeningTask[]>; counts: Record<ListeningPhase, number> };

const phases: ListeningPhase[] = ["guided", "independent", "transfer"];
const target = (phase: ListeningPhase, moduleId: string) => moduleId === "28" && phase === "transfer" ? 40 : phase === "guided" ? 4 : 10;
const sourceStage = (lesson: StoredLesson) => lesson.lesson_id.match(/^(?:DICT-)?(F[1-3]|S[1-4])-/)?.[1] ?? (lesson.lesson_id.startsWith("FND2-") ? "FND2" : "");
const needsWordLimit = new Set(["form_completion", "note_completion", "table_completion", "sentence_completion", "summary_completion", "flow_chart_completion", "short_answer"]);
const usableQuestion = (question: LessonQuestion, unit: ListeningModule, lessonId: string) => unit.types.includes(question.type)
  && Boolean(question.evidence_turn_ids?.length && question.explanation_vi)
  && (lessonId.startsWith("FND2-") || !needsWordLimit.has(question.type) || Boolean(question.word_limit));

function eligible(lesson: StoredLesson, unit: ListeningModule) {
  if (!unit.stages.includes(sourceStage(lesson)) || !audioReady(lesson)) return false;
  if (unit.sourceFrom !== undefined && sourceStage(lesson) === "FND2") {
    const number = Number(lesson.lesson_id.match(/-(\d{3})$/)?.[1]);
    if (number < unit.sourceFrom || number > (unit.sourceTo ?? unit.sourceFrom)) return false;
  }
  return lesson.questions.some((question) => usableQuestion(question, unit, lesson.lesson_id));
}

/** A stable index over the existing bank: no answer key or transcript leaves this module. */
export function buildListeningPlan(id: string): ListeningModulePlan | null {
  const unit = listeningModuleById(id);
  if (!unit) return null;
  const eligibleLessons = allLessons().filter((lesson) => eligible(lesson, unit));
  const byStage = unit.stages.map((stage) => eligibleLessons.filter((lesson) => sourceStage(lesson) === stage).sort((a, b) => a.lesson_id.localeCompare(b.lesson_id)));
  const candidates: StoredLesson[] = [];
  for (let row = 0; byStage.some((items) => row < items.length); row += 1)
    for (const items of byStage) if (items[row]) candidates.push(items[row]);
  const used = new Set<string>();
  const result = { guided: [] as ListeningTask[], independent: [] as ListeningTask[], transfer: [] as ListeningTask[] };
  for (const phase of phases) {
    let remaining = target(phase, id);
    const sectionRemaining = id === "28" && phase === "transfer" ? new Map([1, 2, 3, 4].map((section) => [section, 10])) : null;
    // Spread questions over recordings. A transfer set never reuses a guided recording.
    for (const lesson of candidates) {
      if (remaining <= 0) break;
      if (used.has(lesson.lesson_id)) continue;
      const questions = lesson.questions.filter((question) => usableQuestion(question, unit, lesson.lesson_id));
      if (!questions.length) continue;
      const quota = sectionRemaining?.get(lesson.section) ?? remaining;
      if (quota <= 0) continue;
      const selected = questions.slice(0, Math.min(5, remaining, quota));
      result[phase].push({ lessonId: lesson.lesson_id, questionIds: selected.map((question) => question.question_id),
        title: lesson.title, section: lesson.section, types: [...new Set(selected.map((question) => question.type))] });
      used.add(lesson.lesson_id);
      remaining -= selected.length;
      if (sectionRemaining) sectionRemaining.set(lesson.section, quota - selected.length);
    }
  }
  return { module: unit, phases: result, counts: Object.fromEntries(phases.map((phase) => [phase, result[phase].reduce((sum, task) => sum + task.questionIds.length, 0)])) as Record<ListeningPhase, number> };
}

/** A short comprehension diagnostic; Dictation placement is deliberately kept separate. */
export function buildListeningPlacement() {
  const sections = [
    { moduleId: "01", take: 2 }, { moduleId: "02", take: 2 }, { moduleId: "05", take: 2 },
    { moduleId: "08", take: 2 }, { moduleId: "15", take: 2 }, { moduleId: "20", take: 1 }, { moduleId: "24", take: 1 },
  ];
  // Neighbouring modules can open with the same recording; a question is asked once so it is not weighted twice.
  const asked = new Set<string>();
  return sections.flatMap(({ moduleId, take }) => {
    const plan = buildListeningPlan(moduleId);
    let remaining = take;
    return (plan?.phases.guided ?? []).flatMap((task) => {
      const ids = task.questionIds.filter((id) => !asked.has(`${task.lessonId}:${id}`)).slice(0, Math.max(0, remaining));
      ids.forEach((id) => asked.add(`${task.lessonId}:${id}`));
      remaining -= ids.length;
      return ids.length ? [{ ...task, questionIds: ids, moduleId }] : [];
    });
  });
}

export type ListeningModuleSummary = {
  id: string;
  counts: Record<ListeningPhase, number>;
  recordings: number;
  /** Question types the selected questions really use, with how many of each. */
  types: Record<string, number>;
  durationMs: number;
};

let summaryCache: { at: number; value: ListeningModuleSummary[] } | null = null;

/** What each module really holds today, so the roadmap can show sizes and filter by the types actually selected. */
export function summarizeListeningModules(): ListeningModuleSummary[] {
  if (summaryCache && Date.now() - summaryCache.at < 60_000) return summaryCache.value;
  const duration = new Map(catalog().map((entry) => [entry.lesson_id, entry.duration_ms]));
  const value = listeningModules.flatMap((unit) => {
    const plan = buildListeningPlan(unit.id);
    if (!plan) return [];
    const tasks = Object.values(plan.phases).flat();
    const types: Record<string, number> = {};
    for (const task of tasks) {
      const lesson = getStoredLesson(task.lessonId);
      for (const id of task.questionIds) {
        const type = lesson?.questions.find((question) => question.question_id === id)?.type;
        if (type) types[type] = (types[type] ?? 0) + 1;
      }
    }
    return [{ id: unit.id, counts: plan.counts, recordings: tasks.length, types, durationMs: tasks.reduce((sum, task) => sum + (duration.get(task.lessonId) ?? 0), 0) }];
  });
  summaryCache = { at: Date.now(), value };
  return value;
}
