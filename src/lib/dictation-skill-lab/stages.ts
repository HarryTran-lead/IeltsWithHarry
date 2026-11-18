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

/**
 * Stage of a lesson. M16 lessons carry it in the ID (DICT-F1-001); M49L Section lessons too
 * (S2-EXP-001, S3-SIM-004); M49L Foundation lessons (FND2-001) are placed by their level.
 */
export function stageForLesson(lessonId: string, level?: string): SkillLabStageId {
  const legacy = /^DICT-(F[1-3]|S[1-4])-/.exec(lessonId);
  if (legacy) return legacy[1] as SkillLabStageId;
  const section = /^(S[1-4])-(?:EXP|SIM)-/.exec(lessonId);
  if (section) return section[1] as SkillLabStageId;
  return level === "L1" ? "F1" : level === "L3" ? "F3" : "F2";
}

/** Prefer the `stage` field the API sends; the ID alone cannot place FND2 lessons. */
export const skillLabStageOf = (lesson: string | { lesson_id: string; stage?: string; level?: string }) =>
  typeof lesson === "string" ? stageForLesson(lesson) : (lesson.stage ?? stageForLesson(lesson.lesson_id, lesson.level));
export const skillLabStageUrl = (stageId: string) => `/app/dictation/banks/skill-lab/stage/${stageId}`;
