import { z } from 'zod';

const asset = z.object({ url: z.url().or(z.literal('')), alt: z.string().max(200) });
const checklist = z.array(z.string().min(2)).min(1).max(20);

export const skillMaterialSchema = z.discriminatedUnion('skill', [
  z.object({ skill: z.literal('Vocabulary'), introduction: z.string().max(5000), figure: asset }),
  z.object({ skill: z.literal('Grammar'), rule: z.string().min(3), example: z.string().min(3), figure: asset }),
  z.object({ skill: z.literal('Reading'), passage: z.string().min(30), figure: asset }),
  z.object({ skill: z.literal('Listening'), transcript: z.string().min(10), audioUrl: z.url().or(z.literal('')), figure: asset }),
  z.object({ skill: z.literal('Writing'), prompt: z.string().min(3), minWords: z.number().int().min(1).max(5000), modelAnswer: z.string().min(10), checklist, figure: asset }),
  z.object({ skill: z.literal('Speaking'), prompt: z.string().min(3), preparationSeconds: z.number().int().min(0).max(120), modelAnswer: z.string().min(10), checklist, figure: asset }),
]);

export type SkillMaterial = z.infer<typeof skillMaterialSchema>;
export type SkillName = SkillMaterial['skill'];

export function emptySkillMaterial(skill: SkillName): SkillMaterial {
  const figure = { url: '', alt: '' };
  switch (skill) {
    case 'Vocabulary': return { skill, introduction: '', figure };
    case 'Grammar': return { skill, rule: '', example: '', figure };
    case 'Reading': return { skill, passage: '', figure };
    case 'Listening': return { skill, transcript: '', audioUrl: '', figure };
    case 'Writing': return { skill, prompt: '', minWords: 40, modelAnswer: '', checklist: ['Kiểm tra nội dung và cách diễn đạt'], figure };
    case 'Speaking': return { skill, prompt: '', preparationSeconds: 15, modelAnswer: '', checklist: ['Nghe lại bản ghi và tự nhận xét'], figure };
  }
}
