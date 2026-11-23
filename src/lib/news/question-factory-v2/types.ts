import type { IeltsQuestionType } from "../ielts-passage";
import type { AdaptiveQuestion } from "../adaptive-quiz";

export const FACTORY_VERSION = "daily-news-question-factory-v2.0.0";
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
export type PassageMap = {
  paragraphs: { id: string; main_idea: string; key_facts: string[] }[];
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
  questions: AdaptiveQuestion[];
  imageQuery: string;
  audit: {
    version: string;
    fingerprint: string;
    requests: number;
    generation_tokens: TokenUsage | null;
    qa_tokens: TokenUsage | null;
    candidate_count: number;
    deterministic_pass: number;
    qa_pass: number;
    issues: string[];
  };
};
export type TokenUsage = { prompt: number | null; candidates: number | null; total: number | null };
