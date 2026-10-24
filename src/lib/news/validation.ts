import { z } from "zod";
import { NEWS_CATEGORIES } from "./constants";

const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) source URLs are allowed");
const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "Audio must use HTTPS");
export const newsSourceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  provider: z.enum(["gdelt", "rss"]),
  feed_url: z.string().url().nullable(),
  category: z.enum(NEWS_CATEGORIES),
  policy_status: z.enum(["METADATA_ONLY", "FULL_REUSE_ALLOWED", "MANUAL_PERMISSION_REQUIRED", "DISABLED"]),
  reviewed_basis: z.string(),
  enabled: z.boolean(),
  auto_publish: z.boolean(),
  min_interval_minutes: z.number().int().min(30).max(1440),
}).superRefine((value, ctx) => {
  if (value.provider === "rss" && (!value.feed_url || !value.feed_url.startsWith("https://"))) ctx.addIssue({ code: "custom", message: "RSS feed must use HTTPS", path: ["feed_url"] });
  if (value.enabled && (!(["METADATA_ONLY", "FULL_REUSE_ALLOWED"].includes(value.policy_status)) || value.reviewed_basis.trim().length < 12)) ctx.addIssue({ code: "custom", message: "Review and record the metadata-use basis before enabling", path: ["reviewed_basis"] });
  if (value.auto_publish && !value.enabled) ctx.addIssue({ code: "custom", message: "Enable the source before automatic publication", path: ["auto_publish"] });
});

export const newsLearningSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/), title: z.string().trim().min(5).max(200), summary: z.string().max(500),
  category: z.enum(NEWS_CATEGORIES), stage_id: z.enum(["foundation", "elementary", "pre-ielts", "ielts-starter", "ielts-builder", "ielts-advanced", "mastery"]),
  passage: z.string().trim().min(100).max(20000), rights_status: z.enum(["ORIGINAL", "LICENSED", "AUTHORIZED_ADAPTATION"]),
  rights_basis: z.string().trim().min(12), source_url: httpUrl.nullable(), audio_url: httpsUrl.nullable(), audio_rights_basis: z.string().nullable(), related_news_id: z.string().uuid().nullable(), published: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.rights_status !== "ORIGINAL" && !value.source_url) ctx.addIssue({ code: "custom", message: "Licensed material needs a source URL", path: ["source_url"] });
  if (value.audio_url && (value.audio_rights_basis?.trim().length ?? 0) < 12) ctx.addIssue({ code: "custom", message: "Record the audio reuse basis", path: ["audio_rights_basis"] });
});

export const newsQuestionSchema = z.object({
  kind: z.enum(["multiple_choice", "true_false_not_given", "matching", "vocabulary", "main_idea", "short_answer"]),
  prompt: z.string().trim().min(5), options: z.array(z.string().trim().min(1)).max(8), answer: z.string().trim().min(1),
  explanation: z.string(), supporting_sentence: z.string(),
}).superRefine((value, ctx) => {
  if (value.options.length && !value.options.some((option) => option.toLowerCase() === value.answer.toLowerCase())) ctx.addIssue({ code: "custom", message: "The correct answer must match one option", path: ["answer"] });
});
