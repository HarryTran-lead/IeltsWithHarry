/** Writing Task 2 Lab: shapes and labels shared by the server routes and the learner pages. */

export const TASK2_BASE = "/app/self-study/writing-task-2";
export const TASK2_API = "/api/self-study/writing-task-2";

export type Task2Stage = "foundation" | "basic" | "developing" | "advanced";
/** recognize = pick the right option, complete = fill a sentence frame, produce = write freely. */
export type Task2DrillLevel = "recognize" | "complete" | "produce";
export type Task2Annotation = { quote_en: string; label_vi: string; note_vi: string };
export type Task2Step = { title_vi: string; instruction_vi: string; sample_en: string; sample_vi?: string };
export type Task2Vocabulary = { phrase_en: string; meaning_vi: string; example_en?: string; example_vi?: string; collocations_en?: string[] };
export type Task2Drill = {
  id: string; mode: string; question_vi: string; hint_vi: string;
  /* Filled in by an enrichment file (content/writing-task2/enrich); every field is optional so the imported lessons keep working. */
  level?: Task2DrillLevel; how_to_vi?: string; hints?: string[];
  options?: { id: string; text_en: string }[]; frame_en?: string; word_bank_en?: string[];
};
export type Task2Lesson = {
  id: string; pack: string; content_sha256: string; stage: Task2Stage; target_range: string; question_type: string;
  topic: string; prompt: string; minutes: number; goal_vi: string; target_vi: string;
  steps: Task2Step[]; vocabulary: Task2Vocabulary[]; drills: Task2Drill[]; has_model_essay: boolean;
  /* Enrichment, all optional. */
  enriched?: boolean;
  topic_id?: string; skill_ids?: string[];
  prompt_vi?: string;
  prompt_analysis?: { keywords: { en: string; vi: string }[]; task_vi: string; trap_vi?: string };
  mini_lesson?: {
    explain_vi: string; frame_en?: string; worked_example_en?: string; worked_example_vi?: string;
    annotations?: Task2Annotation[]; good_vs_bad?: { bad_en: string; good_en: string; why_vi: string }[];
  };
  grammar_focus?: { name_vi: string; explain_vi: string; examples: { en: string; vi: string }[]; drills?: { task_vi: string; answer_en: string }[] };
  self_check_vi?: string[];
  review?: { remember_vi: string[]; mistakes_vi: string[] };
};
export type Task2LessonSummary = Omit<Task2Lesson, "steps" | "vocabulary" | "drills" | "content_sha256" | "prompt_analysis" | "mini_lesson" | "grammar_focus" | "self_check_vi" | "review"> & { drill_count: number };
export type Task2DrillAnswer = {
  answer_guide: string; explanation_vi: string;
  answer_vi?: string; alternatives_en?: string[];
  common_mistake?: { wrong_en: string; fix_en: string; why_vi: string };
  /** recognize drills: the right option and what each option teaches. */
  correct?: string; option_feedback?: Record<string, string>;
};
export type Task2ModelEssay = {
  title: string; essay: string; word_count: number; explanation_vi: string; outline_vi: string;
  kind?: "paragraph" | "intro_body" | "essay"; text_vi?: string; annotations?: Task2Annotation[];
};
export type Task2Reveal = { drills: Record<string, Task2DrillAnswer>; model_essay?: Task2ModelEssay | null };

/** What a learner has written in one lesson. It lives in the account's writing_drafts row (slug below). */
export type Task2State = {
  t2: 1;
  answers: Record<string, string>;
  /** When each drill answer was saved. A saved answer is what makes a drill done. */
  saved: Record<string, string>;
  /** Drills (and "essay") whose reference the learner opened before saving their own work. */
  peeked: Record<string, string>;
  /** recognize drills: the option picked; complete drills: the words put in each blank. */
  choices: Record<string, string>;
  fills: Record<string, string[]>;
  essay: string;
  essaySavedAt?: string;
  checklist: Record<string, boolean>;
  updatedAt: number;
};

export const DRILL_MIN_CHARS = 3;
/**
 * What the last step asks for at each stage, following the lessons' own completion targets:
 * foundation writes a short paragraph, basic an introduction and one body paragraph, later stages a full essay.
 * `min` is the saved length that completes the lesson and opens the model essay.
 */
export const writingTargets: Record<Task2Stage, { label: string; hint: string; goal: number; min: number }> = {
  foundation: { label: "Viết đoạn ngắn", hint: "2–3 câu có lý do và ví dụ", goal: 40, min: 25 },
  basic: { label: "Viết mở bài và thân bài", hint: "Mở bài + một đoạn 65–85 từ", goal: 120, min: 80 },
  developing: { label: "Viết bài hoàn chỉnh", hint: "250+ từ, tự kiểm tra 4 tiêu chí", goal: 250, min: 150 },
  advanced: { label: "Viết bài hoàn chỉnh", hint: "250+ từ, tự kiểm tra 4 tiêu chí", goal: 250, min: 150 },
};
export const task2DraftSlug = (lessonId: string) => `t2-lab:${lessonId}`;
export const countWords = (text: string) => (text.trim().match(/[A-Za-zÀ-ỹ0-9'’-]+/g) ?? []).length;

export function parseTask2State(value: string | null | undefined): Task2State | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Task2State>;
    if (parsed.t2 !== 1 || typeof parsed.answers !== "object" || !parsed.answers) return null;
    return {
      t2: 1, answers: parsed.answers, saved: parsed.saved ?? {}, peeked: parsed.peeked ?? {}, choices: parsed.choices ?? {}, fills: parsed.fills ?? {},
      essay: typeof parsed.essay === "string" ? parsed.essay : "", essaySavedAt: parsed.essaySavedAt, checklist: parsed.checklist ?? {}, updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch { return null; }
}

/** A drill counts as done once a non-trivial answer was saved; the writing once it was saved at the stage's length. */
export const drillSaved = (state: Task2State, id: string) => Boolean(state.saved[id]) && (state.answers[id] ?? "").trim().length >= DRILL_MIN_CHARS;
export const essaySaved = (state: Task2State, stage: Task2Stage) => Boolean(state.essaySavedAt) && countWords(state.essay) >= writingTargets[stage].min;

export const stageInfo: Record<Task2Stage, { name: string; tone: string; soft: string }> = {
  foundation: { name: "Nền tảng", tone: "#0a7f89", soft: "#e2f5f4" },
  basic: { name: "Cơ bản", tone: "#2577c8", soft: "#e6f0fb" },
  developing: { name: "Phát triển", tone: "#7c66dc", soft: "#f1eefe" },
  advanced: { name: "Nâng cao", tone: "#d2524a", soft: "#fdeeec" },
};
export const stageOrder: Task2Stage[] = ["foundation", "basic", "developing", "advanced"];

export const questionTypeLabels: Record<string, string> = {
  agree_disagree: "Đồng ý / Không đồng ý",
  discuss_both_views: "Thảo luận hai quan điểm",
  advantages_disadvantages: "Ưu điểm – Nhược điểm",
  advantages_outweigh_disadvantages: "Lợi có lớn hơn hại?",
  causes_solutions: "Nguyên nhân – Giải pháp",
  problem_solution: "Vấn đề – Giải pháp",
  double_question: "Hai câu hỏi",
};

export const drillModeLabels: Record<string, string> = {
  short_write: "Viết ngắn",
  identify: "Đọc đề",
  idea: "Tìm ý",
  thesis: "Thesis",
  causal_chain: "Chuỗi lập luận",
  second_side: "Ý thứ hai",
  nuance: "Giới hạn lập luận",
  diagnose: "Tìm lỗi",
  self_revision: "Tự sửa bài",
};
