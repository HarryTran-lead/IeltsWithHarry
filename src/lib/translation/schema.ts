import { z } from "zod";

export const practiceExerciseSchema = z.object({
  id: z.string().min(1),
  practiceLevel: z.string().regex(/^[1-9]\.\d$/),
  type: z.enum(["word", "phrase", "sentence", "paragraph"]),
  topic: z.string().min(1),
  targetTerm: z.string().min(1),
  meaningVi: z.string().min(1),
  promptVi: z.string().min(1),
  referenceAnswers: z.array(z.string().min(1)).min(1),
  grammarTags: z.array(z.string().min(1)),
  explanationVi: z.string().min(1),
  rationaleVi: z.string().min(1),
  commonErrors: z.array(z.string().min(1)),
  calibrationStatus: z.literal("internal_review"),
  editorialStatus: z.enum(["pilot", "approved"]),
  source: z.string().min(1),
  version: z.number().int().positive(),
});

export type PracticeExercise = z.infer<typeof practiceExerciseSchema>;
