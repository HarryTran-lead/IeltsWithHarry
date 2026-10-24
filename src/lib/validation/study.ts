import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(100),
  skill: z.enum(["Reading", "Listening", "Writing", "Speaking", "Vocabulary", "Grammar", "Review", "Personal"]),
  date: z.iso.date(),
  time: z.union([z.iso.time({ precision: -1 }), z.literal("")]),
  priority: z.enum(["Low", "Medium", "High"]),
  completed: z.boolean(),
  lesson: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
export const dailyGoalSchema = z.number().int().min(1).max(20);
export const draftSchema = z.string().max(20000);
export const exerciseAnswersSchema = z.record(z.string().regex(/^q[1-9]\d*$/), z.number().int().min(0).max(5));
