export type GrammarLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type GrammarCatalogLesson = {
  code: string;
  level: GrammarLevel;
  group: string;
  title: string;
  formula: string;
  example: string;
};

export type GrammarGuide = GrammarCatalogLesson & {
  translation: string;
  common_mistake: string;
  mistake_explanation: string;
  exception_note: string;
  micro_rules: string[] | null;
  guide: { title: string; body: string }[];
};

export type GrammarPracticeItem = {
  item_id: string;
  question: string;
  reference_answer: string;
  answer_explanation: string;
  source_english: string;
  source_vietnamese: string;
  reuse_tier: string;
};

export type ReviewStatus = "UNDERSTOOD" | "NEED_REVIEW" | "SKIPPED";
export type GrammarResponse = { answer: string; status?: ReviewStatus; revealed?: boolean; updatedAt: string };
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
  return Object.values(progress?.responses ?? {}).filter((response) => response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW").length;
}

export function practiced(progress?: GrammarLessonProgress) {
  return reviewedCount(progress) === 30;
}
