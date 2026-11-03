export type GrammarLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type GrammarCatalogLesson = {
  code: string;
  level: GrammarLevel;
  group: string;
  title: string;
  formula: string;
  example: string;
  counts: Record<string, number>;
};

export type GrammarMistake = { wrong: string; correct: string; why: string };
export type GrammarExample = { en: string; vi?: string };

export type GrammarGuide = {
  code: string;
  title: string;
  overview: string;
  objectives: string[];
  sections: {
    heading: string; formula: string; explanation: string; examples: GrammarExample[];
    points: ({ text: string } & Partial<GrammarExample>)[];
    table: { columns: string[]; rows: string[][] } | null;
    mistake: GrammarMistake | null; note: string;
  }[];
  mistakes: GrammarMistake[];
  caveats: string[];
};

export type GrammarPracticeItem = {
  id: string;
  stage: "guided" | "independent" | "mastery" | "spaced_review";
  type: "mcq" | "fill_blank" | "error_choice" | "error_correction" | "sentence_ordering";
  instruction: string;
  prompt: string;
  translation: string | null;
  options: string[] | null;
  chunks: string[];
  hint: string | null;
  publishable: boolean;
};

export type ReviewStatus = "UNDERSTOOD" | "NEED_REVIEW" | "SKIPPED";
/** The latest result is shown on screen; `first` keeps the first submission so a retry cannot hide a mistake. */
export type GrammarResponse = {
  answer: string; status?: ReviewStatus; correct?: boolean | null; referenceAnswer?: string; explanation?: string;
  feedback?: string; errorTag?: string | null; updatedAt: string;
  first?: { answer: string; correct: boolean | null; at: string };
  attempts?: number; wrongAt?: string; lastWrong?: string; prompt?: string; order?: number[]; retrying?: boolean;
};
export type GrammarGrade = { correct: boolean | null; referenceAnswer: string; explanation: string; feedback: string; errorTag: string | null };
/** Spaced review of a whole lesson: `step` indexes the interval ladder in schedule.ts. */
export type GrammarReview = { step: number; due: string; last?: string };
export type GrammarLessonProgress = {
  theorySeen: boolean;
  responses: Record<string, GrammarResponse>;
  updatedAt: string;
  review?: GrammarReview;
};
export type GrammarProgress = Record<string, GrammarLessonProgress>;

export const grammarLevels: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const grammarWorlds: Record<GrammarLevel, { name: string; icon: string; sticker: string; description: string }> = {
  A1: { name: "Khu vườn khởi đầu", icon: "🌱", sticker: "tree", description: "Xây dựng những câu tiếng Anh đầu tiên" },
  A2: { name: "Thị trấn bầu trời", icon: "☁️", sticker: "plane", description: "Mở rộng câu và diễn đạt hằng ngày" },
  B1: { name: "Thung lũng khám phá", icon: "⛰️", sticker: "mountain", description: "Kết nối ý tưởng tự tin hơn" },
  B2: { name: "Đỉnh núi thử thách", icon: "🏔️", sticker: "target", description: "Diễn đạt lập luận linh hoạt" },
  C1: { name: "Đài quan sát tri thức", icon: "🔭", sticker: "compass", description: "Tinh chỉnh sắc thái và độ chính xác" },
  C2: { name: "Đỉnh cao ngôn ngữ", icon: "🏆", sticker: "rocket", description: "Làm chủ cấu trúc nâng cao" },
};

/** Editorial question ids (A1-01-Q01, A1-01-SR-01); older V5 response ids stay in storage but are not counted. */
export const editorialId = (id: string) => /-(?:Q|SR-)\d+$/.test(id);

export function reviewedCount(progress?: GrammarLessonProgress) {
  return Object.entries(progress?.responses ?? {}).filter(([id, response]) => editorialId(id) &&(response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW")).length;
}

/** A lesson counts as learned once its teaching stages are done (it then has a review schedule). */
export function practiced(progress?: GrammarLessonProgress, total = 30) {
  return Boolean(progress?.review) || (total > 0 && reviewedCount(progress) >= total);
}

export const grammarTypeLabels: Record<GrammarPracticeItem["type"], string> = {
  mcq: "Trắc nghiệm", fill_blank: "Điền từ", error_choice: "Chọn câu đúng", error_correction: "Sửa lỗi", sentence_ordering: "Sắp xếp câu",
};

const day = (iso: string) => new Date(iso).toDateString();

/**
 * Records a graded submission. A wrong answer keeps the question in the review list;
 * only a correct answer on a later day takes it out, so retrying straight away does not erase the mistake.
 */
export function applyGrade(previous: GrammarResponse, answer: string, grade: GrammarGrade, prompt: string, now = new Date().toISOString()): GrammarResponse {
  const wrongAt = grade.correct === false ? now : previous.wrongAt ?? (previous.status === "NEED_REVIEW" ? previous.updatedAt : undefined);
  const status: ReviewStatus = grade.correct === false || (previous.status === "NEED_REVIEW" && wrongAt && day(wrongAt) === day(now)) ? "NEED_REVIEW" : "UNDERSTOOD";
  return {
    ...previous, ...grade, answer, prompt, status, updatedAt: now, retrying: false,
    first: previous.first ?? { answer, correct: grade.correct, at: now },
    attempts: (previous.attempts ?? 0) + 1,
    ...(wrongAt ? { wrongAt } : {}),
    ...(grade.correct === false ? { lastWrong: answer } : {}),
  };
}
