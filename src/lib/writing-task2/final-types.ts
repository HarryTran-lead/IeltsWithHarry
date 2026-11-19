/**
 * Writing Task 2 course, final milestone (R16): the timed final assessment and the learner's mistake log.
 * Final prompts are locked on the server until the learner starts a paper; idea guidance and the model essay
 * of the same question type open only after a submitted essay. Self-review is an internal 0–3 evidence check,
 * never an IELTS band.
 */
import { COURSE_API } from "./course-types";
import { countWords } from "./types";

export const FINAL_API = `${COURSE_API}/final`;
export const FINAL_REVIEW_MIN_WORDS = 100;
export const criteria = ["TR", "CC", "LR", "GRA"] as const;
export type Criterion = (typeof criteria)[number];
export const criterionNames: Record<Criterion, string> = {
  TR: "Task Response", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy",
};

export type FinalPaper = { id: string; question_type: string; time_limit: number; min_words: number };
export type FinalRubric = {
  dimensions: { id: Criterion; question_vi: string; evidence_vi: string[]; repair_vi: string }[];
  levels: { level: number; vi: string }[];
  pass_vi?: string; note_vi?: string;
};
export type MistakeCode = { id: string; criterion: Criterion; name_vi: string; symptom_vi: string; repair_vi: string; evidence_vi: string[]; review_days: number[] };
/** What any signed-in learner may see before starting: paper slots, the rubric and the mistake codes. */
export type FinalBundle = { papers: FinalPaper[]; rubric: FinalRubric; mistakes: MistakeCode[] };

export type FinalPrompt = { prompt_en: string; prompt_vi?: string };
export type FinalModel = { title: string; prompt_en?: string; essay_en: string; essay_vi?: string; word_count?: number; structure_vi?: string; warning_vi?: string };
export type FinalReview = { requirement_vi?: string; ideas_en: string[]; model?: FinalModel };

/** One paper's attempt, stored in the learner's writing_drafts row (slug below). */
export type FinalAttempt = {
  f: 1; startedAt: string; submittedAt?: string; essay: string; rewrite?: string;
  review: Partial<Record<Criterion, number>>; evidence: Record<string, boolean>; updatedAt: number;
};
export const finalDraftSlug = (paperId: string) => `t2-final:${paperId}`;

export function parseFinalAttempt(value: string | null | undefined): FinalAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FinalAttempt>;
    if (parsed.f !== 1 || typeof parsed.startedAt !== "string") return null;
    return {
      f: 1, startedAt: parsed.startedAt, submittedAt: typeof parsed.submittedAt === "string" ? parsed.submittedAt : undefined,
      essay: typeof parsed.essay === "string" ? parsed.essay : "", rewrite: typeof parsed.rewrite === "string" ? parsed.rewrite : undefined,
      review: parsed.review && typeof parsed.review === "object" ? parsed.review : {}, evidence: parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {},
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch { return null; }
}

/** Guidance and the model open once an essay of real length was submitted. */
export const finalSubmitted = (attempt: FinalAttempt | null | undefined) => Boolean(attempt?.submittedAt) && countWords(attempt?.essay ?? "") >= FINAL_REVIEW_MIN_WORDS;

/* ───────────── Mistake log ───────────── */

export type MistakeStatus = "pending" | "attempted" | "mastered";
export type MistakeEntry = {
  id: string; criterion: Criterion; error_code: string; original_excerpt: string; revised_excerpt: string; why_vi: string;
  created_at: string; next_review_at: string; review_status: MistakeStatus; review_attempts: number; source?: string;
};
export const mistakeSlug = (id: string) => `t2-mistake:${id}`;
export const DEFAULT_REVIEW_DAYS = [1, 3, 7, 14];

export function parseMistake(value: string | null | undefined): MistakeEntry | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MistakeEntry>;
    if (!parsed.id || !parsed.criterion || !criteria.includes(parsed.criterion) || typeof parsed.original_excerpt !== "string") return null;
    return {
      id: parsed.id, criterion: parsed.criterion, error_code: parsed.error_code ?? "", original_excerpt: parsed.original_excerpt,
      revised_excerpt: parsed.revised_excerpt ?? "", why_vi: parsed.why_vi ?? "", created_at: parsed.created_at ?? new Date(0).toISOString(),
      next_review_at: parsed.next_review_at ?? new Date(0).toISOString(), review_status: parsed.review_status ?? "pending",
      review_attempts: Number(parsed.review_attempts) || 0, source: parsed.source,
    };
  } catch { return null; }
}

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000).toISOString();

export function newMistake(input: Pick<MistakeEntry, "criterion" | "error_code" | "original_excerpt" | "revised_excerpt" | "why_vi" | "source">, days = DEFAULT_REVIEW_DAYS, now = new Date()): MistakeEntry {
  const id = `ML-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { ...input, id, created_at: now.toISOString(), next_review_at: addDays(now, days[0] ?? 1), review_status: "pending", review_attempts: 0 };
}

/**
 * After a review: a correct rewrite moves the entry to the next interval and is mastered after the last one;
 * a miss brings it back tomorrow.
 */
export function reviewMistake(entry: MistakeEntry, correct: boolean, days = DEFAULT_REVIEW_DAYS, now = new Date()): MistakeEntry {
  if (!correct) return { ...entry, review_status: "attempted", next_review_at: addDays(now, 1) };
  const attempts = entry.review_attempts + 1;
  if (attempts >= days.length) return { ...entry, review_attempts: attempts, review_status: "mastered", next_review_at: entry.next_review_at };
  return { ...entry, review_attempts: attempts, review_status: "attempted", next_review_at: addDays(now, days[attempts] ?? 14) };
}

export const mistakeDue = (entry: MistakeEntry, now = new Date()) => entry.review_status !== "mastered" && entry.next_review_at <= now.toISOString();

/** Maps the criterion names used in the R13–R14 practice ("Task Response", "Lexical Resource"…) to their codes. */
export function criterionOf(text: string | undefined): Criterion | undefined {
  const value = (text ?? "").toLowerCase();
  if (/task response|^tr\b/.test(value)) return "TR";
  if (/coherence|cohesion|^cc\b/.test(value)) return "CC";
  if (/lexical|^lr\b/.test(value)) return "LR";
  if (/grammat|^gra\b/.test(value)) return "GRA";
  return undefined;
}
