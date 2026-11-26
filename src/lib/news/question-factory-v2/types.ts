import type { IeltsQuestionType } from "../ielts-passage";
import type { AdaptiveQuestion } from "../adaptive-quiz";

export const FACTORY_VERSION = "daily-news-question-factory-v2.1.0";
export type Difficulty = "P1" | "P2" | "P3";
export type Scope = "sentence" | "paragraph" | "multiple_paragraphs" | "whole_passage";
export type Candidate = {
  id: string;
  type: IeltsQuestionType;
  group_id: string;
  difficulty: Difficulty;
  paraphrase_depth: 1 | 2 | 3;
  skill: "detail" | "paraphrase" | "main_idea" | "inference" | "writer_view" | "process";
  evidence_scope: Scope;
  prompt: string;
  options: string[];
  correct_index: number;
  answer: string;
  supporting_sentence: string;
  evidence_spans: { start: number; end: number; quote: string }[];
  explanation_en: string;
  explanation: string;
  option_notes: string[];
};
/** Which IELTS passage an article reads like: a factual account (1), distinct sections (2) or an argument (3). */
export type PassageStyle = "factual" | "sections" | "argument";
export type PassageMap = {
  paragraphs: { id: string; main_idea: string; key_facts: string[] }[];
  passage_style?: PassageStyle;
  /** 1–5 ratings behind the passage difficulty score (passage-difficulty.ts). */
  difficulty?: { abstraction: number; argument: number; inference: number; vocabulary: number };
  writer_view: string;
  comparisons: string[];
  qualifications: string[];
  causal_links: string[];
  process_steps: string[];
  diagram_structure: string[];
  opportunities: { type: IeltsQuestionType; evidence: string; skill: string }[];
};
export type Generation = { passage_map: PassageMap; questions: Candidate[]; image_query: string };
export type BlindVerdict = {
  id: string;
  status: "answerable" | "ambiguous" | "unsupported";
  independent_answer: string;
  competing_answers: string[];
  paraphrase_faithful: boolean;
  distractors_fair: boolean;
  form_valid: boolean;
  reason_vi: string;
};
export type BlindReview = { reviews: BlindVerdict[] };
export type FactoryResult = {
  state: "READY" | "PENDING_QUALITY" | "PENDING_QUOTA" | "PENDING_PROVIDER";
  model: string;
  /** The IELTS passage (1–3) the article was judged to read like, when the passage map said. */
  passageLevel?: 1 | 2 | 3;
  /** The 0–100 difficulty score behind passageLevel, when the passage map rated the text. */
  passageScore?: number;
  questions: AdaptiveQuestion[];
  imageQuery: string;
  audit: {
    version: string;
    fingerprint: string;
    requests: number;
    /** True when the provider was unavailable or rate limited, so the article itself is not at fault. */
    retryable: boolean;
    /** Why a run did not publish; null when READY. */
    failure: QuizFailureReason | null;
    /** Provider-suggested wait (Retry-After) for a quota failure. */
    retry_after_ms: number | null;
    generation_tokens: TokenUsage | null;
    qa_tokens: TokenUsage | null;
    candidate_count: number;
    deterministic_pass: number;
    qa_pass: number;
    issues: string[];
  };
};
export type QuizFailureReason =
  | "unavailable" // 5xx, timeout or network error at Google
  | "quota"       // HTTP 429
  | "config"      // missing Free Tier confirmation, invalid model, 401/403/404
  | "rejected"    // any other 4xx, for example a schema Gemini does not accept
  | "incomplete"  // truncated, empty or non-JSON reply
  | "quality"     // too few questions passed structural checks or blind QA
  | "too_short"   // passage too short for six questions
  | "internal";   // our own failure, such as the request budget guard
export type TokenUsage = { prompt: number | null; candidates: number | null; total: number | null };
