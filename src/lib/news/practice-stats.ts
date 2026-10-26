export type QuestionType = "tfng" | "mcq" | "sentence_completion" | "short_answer";
export type TypeScore = { correct: number; total: number };
export type Breakdown = Partial<Record<QuestionType, TypeScore>>;
export type PracticeAttempt = {
  id: string; article_id: string; score: number; total: number; submitted_at: string;
  partial?: boolean; breakdown?: Breakdown | null; duration_seconds?: number | null;
};

export const questionTypes: QuestionType[] = ["tfng", "mcq", "sentence_completion", "short_answer"];
export const typeLabels: Record<QuestionType, string> = {
  tfng: "True / False / Not Given", mcq: "Multiple choice", sentence_completion: "Sentence completion", short_answer: "Short answer",
};

/** IELTS Academic Reading conversion, applied to a full quiz scaled to 40 questions. An estimate, not an official score. */
export function estimateBand(score: number, total: number) {
  if (total < 10 || score < 0 || score > total) return null;
  const raw = Math.round(score / total * 40);
  const steps: [number, number][] = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
  const band = steps.find(([min]) => raw >= min)?.[1] ?? 2;
  return band.toFixed(1);
}

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
  const full = attempts.filter((item) => !item.partial);
  const best = full.reduce<PracticeAttempt | null>((top, item) => !top || item.score / item.total > top.score / top.total ? item : top, null);
  const types = sumBreakdowns(attempts.map((item) => item.breakdown));
  // A type needs a few answers before it is called a weak spot.
  const weakest = types.filter((item) => item.total >= 3).sort((a, b) => a.percent - b.percent)[0] ?? null;
  return {
    attempts: attempts.length,
    questions,
    correct,
    accuracy: percent(correct, questions),
    secondsPerQuestion: timedQuestions ? Math.round(timed.reduce((sum, item) => sum + item.duration_seconds!, 0) / timedQuestions) : null,
    bestBand: best ? estimateBand(best.score, best.total) : null,
    types,
    weakest,
    trend: attempts.slice(0, 12).reverse().map((item) => ({ id: item.id, at: item.submitted_at, percent: percent(item.score, item.total), score: item.score, total: item.total, partial: Boolean(item.partial) })),
  };
}
