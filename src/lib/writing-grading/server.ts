import { createHash } from "node:crypto";
import { bankClient } from "@/lib/ielts-bank/server";
import { contentSchema } from "@/lib/ielts-bank/schema";
import { countEnglishWords, type TaskType } from "./contract";

export const gradingEnabled = () => process.env.WRITING_AUTOGRADING_ENABLED === "true";
export const pipelineVersion = () => process.env.WRITING_GRADING_PIPELINE_VERSION || "local-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function enqueueWritingAttempt(attemptId: string, userId: string) {
  if (!gradingEnabled()) return { status: "unavailable" as const };
  const client = bankClient();
  const { data: attempt, error } = await client.from("ielts_attempts")
    .select("id,user_id,state,answers,version_id,ielts_exams(skill,format,practice_type,title),ielts_exam_versions(content)")
    .eq("id", attemptId).eq("user_id", userId).single();
  if (error || !attempt) throw new Error("Attempt unavailable");
  const exam = Array.isArray(attempt.ielts_exams) ? attempt.ielts_exams[0] : attempt.ielts_exams;
  const version = Array.isArray(attempt.ielts_exam_versions) ? attempt.ielts_exam_versions[0] : attempt.ielts_exam_versions;
  if (exam?.skill !== "Writing" || exam.format !== "Academic" || !["task1_academic", "task2"].includes(exam.practice_type)) throw new Error("Academic Writing Task 1 or 2 required");
  if (attempt.state === "in_progress") throw new Error("Submit your essay before grading");
  const essay = String((attempt.answers as Record<string, string> | null)?.__response ?? "");
  if (!essay.trim() || essay.length > 20000 || countEnglishWords(essay) < 1) throw new Error("Essay is empty or too long");
  const content = contentSchema.parse(version?.content);
  const prompt = content.prompt || exam.title;
  if (!prompt.trim()) throw new Error("Writing prompt unavailable");
  const taskType: TaskType = exam.practice_type === "task2" ? "academic_task2" : "academic_task1";
  const visual = taskType === "academic_task1" ? { visual: content.visual ?? null, imageUrl: content.imageUrl ?? null, figureDescription: content.figureDescription ?? null } : null;
  const versionId = pipelineVersion();
  const { data: existing, error: lookupError } = await client.from("writing_grading_jobs").select("id,status,attempt_no")
    .eq("attempt_id", attemptId).eq("pipeline_version", versionId).eq("request_kind", "initial").maybeSingle();
  if (lookupError) throw new Error("Grading queue unavailable");
  if (existing) return existing;
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count, error: quotaError } = await client.from("writing_grading_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (quotaError) throw new Error("Grading quota unavailable");
  if ((count ?? 0) >= 10) throw new Error("Daily grading limit reached");
  if (process.env.WRITING_GRADING_ALLOW_PILOT === "true") {
    const { count: total, error: globalQuotaError } = await client.from("writing_grading_jobs")
      .select("id", { count: "exact", head: true }).gte("created_at", since);
    if (globalQuotaError) throw new Error("Grading quota unavailable");
    if ((total ?? 0) >= 30) throw new Error("Đã hết 30 lượt chấm thử hôm nay. Hãy quay lại sau.");
  }
  const { data: job, error: insertError } = await client.from("writing_grading_jobs").insert({
    attempt_id: attemptId, user_id: userId, task_type: taskType, pipeline_version: versionId,
    prompt_snapshot: prompt, visual_snapshot: visual, essay_snapshot: essay,
    prompt_sha256: hash(JSON.stringify({ prompt, visual, versionId: attempt.version_id })),
    essay_sha256: hash(essay), exam_version_id: attempt.version_id,
  }).select("id,status,attempt_no").single();
  if (!insertError && job) return job;
  if (insertError?.code === "23505") {
    const retry = await client.from("writing_grading_jobs").select("id,status,attempt_no")
      .eq("attempt_id", attemptId).eq("pipeline_version", versionId).eq("request_kind", "initial").single();
    if (retry.data) return retry.data;
  }
  throw new Error("Grading queue unavailable");
}
