import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(100),
  skill: z.enum(["Reading", "Listening", "Writing", "Speaking", "Vocabulary", "Grammar", "Review", "Personal"]),
  date: z.iso.date(),
  time: z.union([z.iso.time({ precision: -1 }), z.literal("")]),
  priority: z.enum(["Low", "Medium", "High"]),
  completed: z.boolean(),
  /** A plain slug ("vocabulary-review") or kind:reference ("news:my-article", "ielts:<uuid>"). */
  lesson: z.string().max(160).regex(/^[a-z0-9-]+(:[A-Za-z0-9._/-]+)?$/).optional(),
  duration: z.number().int().min(5).max(240).optional(),
  source: z.enum(["manual", "exam", "dictation", "vocabulary", "grammar", "news", "lab", "practice", "suggestion", "plan", "teacher"]).optional(),
  seriesId: z.uuid().optional(),
});
export const dailyGoalSchema = z.number().int().min(1).max(20);
export const draftSchema = z.string().max(20000);
export const exerciseAnswersSchema = z.record(z.string().regex(/^q[1-9]\d*$/), z.number().int().min(0).max(5));
