import { z } from "zod";

export const notebookInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("note"),
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(5000),
    meaningVi: z.literal(""),
    example: z.literal(""),
  }),
  z.object({
    kind: z.literal("word"),
    title: z.string().trim().min(1).max(100),
    body: z.literal(""),
    meaningVi: z.string().trim().min(1).max(200),
    example: z.string().trim().max(500),
  }),
]);

export type NotebookInput = z.infer<typeof notebookInputSchema>;
