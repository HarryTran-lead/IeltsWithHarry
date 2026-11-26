import { z } from "zod";

export const noteSkillSchema = z.enum(["general", "writing", "speaking", "reading", "listening", "vocabulary", "grammar"]);
export type NoteSkill = z.infer<typeof noteSkillSchema>;

export const notebookInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("note"),
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(100000),
    meaningVi: z.literal(""),
    example: z.literal(""),
    skill: noteSkillSchema.optional(),
    reviewAt: z.union([z.iso.date(), z.null()]).optional(),
    reviewPrompt: z.string().trim().max(500).optional(),
    reviewCount: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal("word"),
    title: z.string().trim().min(1).max(100),
    body: z.literal(""),
    meaningVi: z.string().trim().min(1).max(200),
    example: z.string().trim().max(500),
    phonetic: z.string().trim().max(100).optional(),
    partOfSpeech: z.string().trim().max(50).optional(),
    topic: z.string().trim().max(100).optional(),
    definition: z.string().trim().max(500).optional(),
    sourceUrl: z.union([z.literal(""), z.string().url().max(500)]).optional(),
  }),
]);

export type NotebookInput = z.infer<typeof notebookInputSchema>;
