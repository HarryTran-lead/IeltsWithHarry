import { ieltsQuestionTypes, type IeltsQuestionType } from "./ielts-passage";
export type QuestionType = IeltsQuestionType;
export type TypeScore = { correct: number; total: number };
export type Breakdown = Partial<Record<QuestionType, TypeScore>>;
export type PracticeAttempt = {
  id: string; article_id: string; score: number; total: number; submitted_at: string;
  partial?: boolean; breakdown?: Breakdown | null; duration_seconds?: number | null;
  mode?: "practice" | "timed";
};

export const questionTypes: QuestionType[] = [...ieltsQuestionTypes];
export const typeLabels: Record<QuestionType, string> = {
  mcq: "Multiple Choice", tfng: "True / False / Not Given", ynng: "Yes / No / Not Given",
  matching_headings: "Matching Headings", matching_information: "Matching Information",
  matching_features: "Matching Features", matching_sentence_endings: "Matching Sentence Endings",
  sentence_completion: "Sentence Completion", summary_completion: "Summary Completion",
  note_completion: "Note Completion", table_completion: "Table Completion",
  flow_chart_completion: "Flow-chart Completion", diagram_label_completion: "Diagram Label Completion",
  short_answer: "Short-answer Questions",
  summary_word_list: "Summary Completion (word list)", mcq_multiple: "Multiple Choice (choose TWO)",
};

export function percent(correct: number, total: number) { return total ? Math.round(correct / total * 100) : 0; }

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Adds up per-type scores in the fixed IELTS order; types never practised are left out. */
export function sumBreakdowns(list: (Breakdown | null | undefined)[]) {
  const totals = new Map<QuestionType, TypeScore>();
  for (const breakdown of list) for (const type of questionTypes) {
    const item = breakdown?.[type];
    if (!item || !(item.total > 0)) continue;
    const current = totals.get(type) ?? { correct: 0, total: 0 };
    totals.set(type, { correct: current.correct + item.correct, total: current.total + item.total });
  }
  return questionTypes.flatMap((type) => totals.has(type) ? [{ type, ...totals.get(type)!, percent: percent(totals.get(type)!.correct, totals.get(type)!.total) }] : []);
}

/** History numbers for the stats panel. Attempts are expected newest first. */
export function summarizeAttempts(attempts: PracticeAttempt[]) {
  const questions = attempts.reduce((sum, item) => sum + item.total, 0);
  const correct = attempts.reduce((sum, item) => sum + item.score, 0);
  const timed = attempts.filter((item) => typeof item.duration_seconds === "number" && item.duration_seconds > 0);
  const timedQuestions = timed.reduce((sum, item) => sum + item.total, 0);
  const types = sumBreakdowns(attempts.map((item) => item.breakdown));
  // Repeated reviews must not turn into evidence about first-attempt proficiency.
  const seen=new Set<string>();
  const firstFull=[...attempts].reverse().filter((item)=>{if(item.partial||seen.has(item.article_id))return false;seen.add(item.article_id);return true;});
  const firstTypes=sumBreakdowns(firstFull.map((item)=>item.breakdown));
  const weakest = firstTypes.filter((item) => item.total >= 10&&firstFull.filter((attempt)=>(attempt.breakdown?.[item.type]?.total??0)>0).length>=3).sort((a, b) => a.percent - b.percent)[0] ?? null;
  return {
    attempts: attempts.length,
    questions,
    correct,
    accuracy: percent(correct, questions),
    secondsPerQuestion: timedQuestions ? Math.round(timed.reduce((sum, item) => sum + item.duration_seconds!, 0) / timedQuestions) : null,
    types,
    weakest,
    trend: attempts.slice(0, 12).reverse().map((item) => ({ id: item.id, at: item.submitted_at, percent: percent(item.score, item.total), score: item.score, total: item.total, partial: Boolean(item.partial) })),
  };
}
