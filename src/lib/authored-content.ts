import { z } from "zod";

const choiceSchema = z.object({
  prompt: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(3),
}).refine((item) => item.correctIndex < item.options.length, {
  message: "correctIndex must point to an option",
  path: ["correctIndex"],
});

export const authoredPackSchema = z.object({
  version: z.literal(1),
  title: z.string().min(3),
  level: z.string().min(1),
  vocabulary: z.array(z.object({
    word: z.string().min(1),
    meaningVi: z.string().min(1),
    definition: z.string().min(1),
    example: z.string().min(1),
    sentencePromptVi: z.string().min(3),
    acceptedSentences: z.array(z.string().min(3)).min(1),
  })).min(1),
  grammar: z.object({ rule: z.string().min(3), example: z.string().min(3), questions: z.array(choiceSchema).min(1) }),
  reading: z.object({ passage: z.string().min(30), questions: z.array(choiceSchema.extend({ evidence: z.string().min(3) })).min(1) }),
  listening: z.object({ script: z.string().min(10), questions: z.array(choiceSchema).min(1) }),
  writing: z.object({
    prompt: z.string().min(3), minWords: z.number().int().min(1),
    modelAnswer: z.string().min(10), checklist: z.array(z.string().min(3)).min(1),
  }),
  speaking: z.object({
    prompt: z.string().min(3), preparationSeconds: z.number().int().min(0).max(120),
    modelAnswer: z.string().min(10), checklist: z.array(z.string().min(3)).min(1),
  }),
});

export type AuthoredPack = z.infer<typeof authoredPackSchema>;

export function normalizeEnglish(value: string) {
  return value.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function compareSentence(answer: string, accepted: string[]) {
  const normalized = normalizeEnglish(answer);
  const exact = accepted.some((sentence) => normalizeEnglish(sentence) === normalized);
  const words = new Set(normalized.split(" ").filter(Boolean));
  const overlaps = accepted.map((sentence) => {
    const sampleWords = new Set(normalizeEnglish(sentence).split(" ").filter(Boolean));
    const shared = [...words].filter((word) => sampleWords.has(word)).length;
    return Math.round((2 * shared / Math.max(1, words.size + sampleWords.size)) * 100);
  });
  return { exact, similarity: Math.max(0, ...overlaps) };
}

export function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}
