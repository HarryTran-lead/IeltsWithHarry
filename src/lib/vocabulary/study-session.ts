import type { ReviewGrade, WordReview } from "@/lib/news/review";

/** One step of a Learn session: see the word, recognise it among options, then recall and type it. */
export type LearnStage = "intro" | "choice" | "type";
export type LearnItem = { id: string; stage: LearnStage };
const stages: LearnStage[] = ["intro", "choice", "type"];

/** Words are taught in small groups so each one comes back while it is still fresh. */
export function buildLearnQueue(ids: string[], groupSize = 5): LearnItem[] {
  const queue: LearnItem[] = [];
  for (let start = 0; start < ids.length; start += groupSize) {
    const group = ids.slice(start, start + groupSize);
    for (const stage of stages) group.forEach((id) => queue.push({ id, stage }));
  }
  return queue;
}

/** A missed question returns a few cards later instead of at the end of the session. */
export function requeue(queue: LearnItem[], item: LearnItem, gap = 3): LearnItem[] {
  const rest = queue.slice(1);
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/** How a whole Learn session went for one word, as the first FSRS grade. */
export function sessionGrade(misses: number): ReviewGrade {
  return misses === 0 ? "good" : misses <= 2 ? "hard" : "again";
}

export const normalizeAnswer = (value: string) => value.toLocaleLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim();

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

/** Typed answers forgive case, punctuation and, for longer words, a single typo. */
export function checkTyped(typed: string, expected: string): "exact" | "close" | "wrong" {
  const given = normalizeAnswer(typed);
  const target = normalizeAnswer(expected);
  if (!given) return "wrong";
  if (given === target) return "exact";
  return target.length >= 5 && distance(given, target) <= 1 ? "close" : "wrong";
}

/** Short Vietnamese label for when a card comes back, e.g. "6 phút" or "4 ngày". */
export function intervalLabel(ms: number) {
  if (ms < 60000) return "<1 phút";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ngày`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} tháng` : `${Math.round(months / 12)} năm`;
}

/** The four word states used on every Vocabulary screen. A word counts as known once FSRS spaces it three weeks apart. */
export type WordState = "new" | "learning" | "reviewing" | "mastered";
export const MASTERED_DAYS = 21;
export function wordState(review: WordReview | undefined): WordState {
  if (!review) return "new";
  const state = Number((review.fsrs_state as { state?: number } | null | undefined)?.state ?? (review.repetitions > 0 ? 2 : 0));
  if (state === 1 || state === 3 || state === 0) return "learning";
  return review.interval_days >= MASTERED_DAYS ? "mastered" : "reviewing";
}
export const wordStateLabels: Record<WordState, string> = { new: "Mới", learning: "Đang học", reviewing: "Đang ôn", mastered: "Đã thuộc" };

/** Today's review: overdue cards first, then a limited number of never-reviewed words, so a session stays short. */
export function reviewQueue<T extends { id: string }>(entries: T[], reviewById: Map<string, WordReview>, now: number, limits = { fresh: 20, total: 50 }) {
  const due = entries.filter((entry) => { const review = reviewById.get(entry.id); return review && new Date(review.due_at).getTime() <= now; })
    .sort((a, b) => new Date(reviewById.get(a.id)!.due_at).getTime() - new Date(reviewById.get(b.id)!.due_at).getTime());
  const fresh = entries.filter((entry) => !reviewById.has(entry.id)).slice(0, limits.fresh);
  return [...due, ...fresh].slice(0, limits.total);
}

/** A mixed test like Quizlet's: pick the meaning, pick the word, type the word, or judge a pairing. */
export type TestKind = "meaning" | "word" | "type" | "truefalse";
export type TestQuestion<T> = { entry: T; kind: TestKind; options: string[]; answer: string; statement?: string };
export const testKindLabels: Record<TestKind, string> = { meaning: "Chọn nghĩa", word: "Chọn từ", type: "Gõ từ", truefalse: "Đúng / Sai" };

export function buildTest<T extends { id: string; title: string; meaningVi: string }>(pool: T[], count: number, random: () => number = Math.random): TestQuestion<T>[] {
  const mix = <V,>(values: V[]) => values.map((value) => ({ value, key: random() })).sort((a, b) => a.key - b.key).map((item) => item.value);
  const words = mix(pool.filter((entry) => entry.meaningVi.trim())).slice(0, count);
  const kinds: TestKind[] = ["meaning", "word", "type", "truefalse"];
  return words.map((entry, index) => {
    const others = mix(pool.filter((other) => other.id !== entry.id && other.meaningVi !== entry.meaningVi));
    const kind = others.length >= 3 ? kinds[index % kinds.length] : "type";
    if (kind === "meaning") return { entry, kind, answer: entry.meaningVi, options: mix([entry.meaningVi, ...others.slice(0, 3).map((other) => other.meaningVi)]) };
    if (kind === "word") return { entry, kind, answer: entry.title, options: mix([entry.title, ...others.slice(0, 3).map((other) => other.title)]) };
    if (kind === "truefalse") {
      const truth = random() < 0.5;
      return { entry, kind, answer: truth ? "Đúng" : "Sai", options: ["Đúng", "Sai"], statement: truth ? entry.meaningVi : others[0].meaningVi };
    }
    return { entry, kind, answer: entry.title, options: [] };
  });
}

/** Whether a test answer is right; typed answers use the same forgiving check as study. */
export function testCorrect<T>(question: TestQuestion<T>, given: string) {
  return question.kind === "type" ? checkTyped(given, question.answer) !== "wrong" : given === question.answer;
}
