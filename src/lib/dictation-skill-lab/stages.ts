export const skillLabStages = [
  { id: "F1", label: "Foundation 1", detail: "Âm và từ dễ nhầm" },
  { id: "F2", label: "Foundation 2", detail: "Câu ngắn, số và giờ" },
  { id: "F3", label: "Foundation 3", detail: "Hội thoại ngắn" },
  { id: "S1", label: "Section 1", detail: "Hội thoại đời sống" },
  { id: "S2", label: "Section 2", detail: "Độc thoại đời sống" },
  { id: "S3", label: "Section 3", detail: "Thảo luận học thuật" },
  { id: "S4", label: "Section 4", detail: "Bài giảng học thuật" },
] as const;

export type SkillLabStageId = (typeof skillLabStages)[number]["id"];
export const skillLabStageOf = (lessonId: string) => lessonId.slice(5, 7);
export const skillLabStageUrl = (stageId: string) => `/app/dictation/banks/skill-lab/stage/${stageId}`;
