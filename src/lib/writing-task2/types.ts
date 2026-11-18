/** Writing Task 2 Lab: shapes and labels shared by the server routes and the learner pages. */

export const TASK2_BASE = "/app/self-study/writing-task-2";
export const TASK2_API = "/api/self-study/writing-task-2";

export type Task2Stage = "foundation" | "basic" | "developing" | "advanced";
export type Task2Step = { title_vi: string; instruction_vi: string; sample_en: string };
export type Task2Drill = { id: string; mode: string; question_vi: string; hint_vi: string };
export type Task2Lesson = {
  id: string; pack: string; content_sha256: string; stage: Task2Stage; target_range: string; question_type: string;
  topic: string; prompt: string; minutes: number; goal_vi: string; target_vi: string;
  steps: Task2Step[]; vocabulary: { phrase_en: string; meaning_vi: string }[]; drills: Task2Drill[]; has_model_essay: boolean;
};
export type Task2LessonSummary = Omit<Task2Lesson, "steps" | "vocabulary" | "drills" | "content_sha256"> & { drill_count: number };
export type Task2DrillAnswer = { answer_guide: string; explanation_vi: string };
export type Task2ModelEssay = { title: string; essay: string; word_count: number; explanation_vi: string; outline_vi: string };
export type Task2Reveal = { drills: Record<string, Task2DrillAnswer>; model_essay?: Task2ModelEssay | null };

/** What a learner has written in one lesson. It lives in the account's writing_drafts row (slug below). */
export type Task2State = {
  t2: 1;
  answers: Record<string, string>;
  /** When each drill answer was saved; the reference answer opens only after a save. */
  saved: Record<string, string>;
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
    return { t2: 1, answers: parsed.answers, saved: parsed.saved ?? {}, essay: typeof parsed.essay === "string" ? parsed.essay : "", essaySavedAt: parsed.essaySavedAt, checklist: parsed.checklist ?? {}, updatedAt: Number(parsed.updatedAt) || 0 };
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

/** A self-check by the four IELTS criteria; it is a checklist, not a score. */
export const essayChecklist: { id: string; criterion: string; text: string }[] = [
  { id: "tr-parts", criterion: "TR", text: "Trả lời đủ mọi phần của đề, đúng dạng câu hỏi." },
  { id: "tr-position", criterion: "TR", text: "Lập trường (thesis) rõ ở mở bài và nhất quán đến kết luận." },
  { id: "tr-support", criterion: "TR", text: "Mỗi ý chính có giải thích và ví dụ cụ thể." },
  { id: "cc-paragraph", criterion: "CC", text: "Mỗi đoạn thân bài tập trung vào một ý, có câu chủ đề." },
  { id: "cc-links", criterion: "CC", text: "Liên kết câu và đoạn tự nhiên, không lạm dụng từ nối." },
  { id: "lr-range", criterion: "LR", text: "Dùng từ đúng chủ đề, có paraphrase, ít lặp từ." },
  { id: "gra-range", criterion: "GRA", text: "Có câu phức đúng ngữ pháp, không chỉ câu đơn." },
  { id: "gra-check", criterion: "GRA", text: "Đã đọc lại để sửa thì, mạo từ, số ít/số nhiều và chính tả." },
];
