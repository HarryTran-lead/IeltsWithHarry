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

export type GrammarGuide = {
  code: string;
  title: string;
  objectives: string[];
  sections: { heading: string; formula: string; explanation: string; examples: { en: string; vi?: string }[]; mistake?: { wrong: string; correct: string; why_vi: string } | null; note: string }[];
  mistakes: { wrong: string; correct: string; why_vi: string }[];
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
export type GrammarResponse = { answer: string; status?: ReviewStatus; correct?: boolean | null; referenceAnswer?: string; explanation?: string; feedback?: string; errorTag?: string | null; updatedAt: string };
export type GrammarLessonProgress = {
  theorySeen: boolean;
  responses: Record<string, GrammarResponse>;
  updatedAt: string;
};
export type GrammarProgress = Record<string, GrammarLessonProgress>;

export const grammarLevels: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const grammarWorlds: Record<GrammarLevel, { name: string; icon: string; description: string }> = {
  A1: { name: "Khu vườn khởi đầu", icon: "🌱", description: "Xây dựng những câu tiếng Anh đầu tiên" },
  A2: { name: "Thị trấn bầu trời", icon: "☁️", description: "Mở rộng câu và diễn đạt hằng ngày" },
  B1: { name: "Thung lũng khám phá", icon: "⛰️", description: "Kết nối ý tưởng tự tin hơn" },
  B2: { name: "Đỉnh núi thử thách", icon: "🏔️", description: "Diễn đạt lập luận linh hoạt" },
  C1: { name: "Đài quan sát tri thức", icon: "🔭", description: "Tinh chỉnh sắc thái và độ chính xác" },
  C2: { name: "Đỉnh cao ngôn ngữ", icon: "🏆", description: "Làm chủ cấu trúc nâng cao" },
};

export function reviewedCount(progress?: GrammarLessonProgress) {
  return Object.entries(progress?.responses ?? {}).filter(([id, response]) => /-Q\d+$/.test(id) && (response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW")).length;
}

export function practiced(progress?: GrammarLessonProgress, total = 30) {
  return total > 0 && reviewedCount(progress) >= total;
}
