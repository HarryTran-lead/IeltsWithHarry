import { z } from "zod";

export const commonErrorSchema = z.object({
  incorrect: z.string().min(1),
  correction: z.string().min(1),
  reasonVi: z.string().min(1),
});

export const practiceExerciseSchema = z.object({
  id: z.string().min(1),
  practiceLevel: z.string().regex(/^[1-9]\.\d$/),
  type: z.enum(["word", "phrase", "sentence", "paragraph"]),
  topic: z.string().min(1),
  // ESL v2 lessons have no single key word; they skip the copy step and the key-word hint.
  targetTerm: z.string().min(1).optional(),
  meaningVi: z.string().min(1).optional(),
  // Level-1 step hints (structure, logic, self-check), opened one at a time.
  hintsVi: z.array(z.string().min(1)).min(1).optional(),
  promptVi: z.string().min(1),
  // The first answer is the model shown first; the rest are accepted alternatives.
  referenceAnswers: z.array(z.string().min(1)).min(1),
  grammarTags: z.array(z.string().min(1)),
  explanationVi: z.string().min(1),
  rationaleVi: z.string().min(1),
  commonErrors: z.array(commonErrorSchema),
  calibrationStatus: z.literal("internal_review"),
  editorialStatus: z.enum(["pilot", "approved"]),
  source: z.string().min(1),
  version: z.number().int().positive(),
});

export type PracticeExercise = z.infer<typeof practiceExerciseSchema>;
export type CommonError = z.infer<typeof commonErrorSchema>;
