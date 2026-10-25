export type CurriculumQuestion = { slug: string; prompt: string; options: string[]; answer: number; explanation: string; evidence?: string };
export type CurriculumWord = { word: string; phonetic: string; meaningVi: string; definition: string; example: string; sentencePromptVi: string; acceptedSentences: string[] };
export type CurriculumLesson = {
  slug: string; title: string; skill: string; summary: string; sortOrder: number;
  material: Record<string, unknown> & { skill: string };
  questions?: CurriculumQuestion[];
  vocabulary?: CurriculumWord[];
};
export type CurriculumUnit = {
  stage: string;
  course: { slug: string; title: string; description: string };
  unit: { slug: string; title: string; sortOrder: number };
  lessons: CurriculumLesson[];
};
export function unitSql(unit: CurriculumUnit): string;
export function readStage(stage: string): CurriculumUnit[];
export function stageSql(stage: string): string;
