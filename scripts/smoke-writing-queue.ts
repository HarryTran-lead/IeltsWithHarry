/** Development-only synthetic queue smoke. Creates and removes its own user and attempt. */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { enqueueWritingAttempt } from "../src/lib/writing-grading/server";
import { processOneCloudflareJob } from "../src/lib/writing-grading/cloudflare-worker";

async function main() {
  const task1 = process.argv.includes("--task1");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes("bhactqaxcvusmpeooxwi") || !key || process.env.WRITING_AUTOGRADING_ENABLED !== "true") {
    throw new Error("DEVELOPMENT_ONLY_CONFIGURATION_REQUIRED");
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count: queued, error: countError } = await db.from("writing_grading_jobs")
    .select("id", { count: "exact", head: true }).eq("status", "queued");
  if (countError || queued !== 0) throw new Error("DEVELOPMENT_QUEUE_NOT_EMPTY");
  const { data: chosen, error: chosenError } = task1
    ? await db.from("ielts_exams").select("id,published_version_id").eq("skill", "Writing").eq("format", "Academic")
      .eq("published_version_id", "9d002be3-fb3b-49c3-9783-2cfe461edd96").single()
    : await db.from("ielts_exams").select("id,published_version_id").eq("skill", "Writing").eq("format", "Academic")
      .eq("practice_type", "task2").eq("status", "published").not("published_version_id", "is", null).limit(1).single();
  if (chosenError || !chosen?.published_version_id) throw new Error(task1 ? "DEVELOPMENT_TASK1_EXAM_UNAVAILABLE" : "DEVELOPMENT_TASK2_EXAM_UNAVAILABLE");
  const email = `writing-smoke-${randomUUID()}@example.com`;
  const { data: created, error: userError } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (userError || !created.user) throw new Error("TEST_USER_CREATE_FAILED");
  const userId = created.user.id;
  let attemptId: string | undefined;
  try {
    const essay = task1
      ? "The line graph compares the share of electricity generated from renewable sources in four regions between 2000 and 2020. Overall, Europe recorded the strongest growth and became the leading region by the end of the period. Asia stayed at the lowest level throughout, although its share also increased. Europe began at 15 percent in 2000. Its figure rose to 25 percent by 2010 and then climbed more rapidly, reaching 45 percent in 2020. In contrast, South America started much higher, at 35 percent, before falling to 30 percent in 2010. It recovered during the following decade and finished at 40 percent. The two regions were level at 35 percent in 2015. North America and Asia both remained below the other two regions. North America's share stayed at 10 percent from 2000 to 2010, then doubled to 20 percent in 2020. Asia increased from 5 percent at the start to 15 percent at the end."
      : "Public transport deserves more investment than new roads. Reliable buses reduce congestion, and connected rail lines help people reach work and school. Existing roads still need repairs, but a city should give most new funding to services that carry many passengers.";
    const { data: attempt, error: attemptError } = await db.from("ielts_attempts")
      .insert({ user_id: userId, exam_id: chosen.id, version_id: chosen.published_version_id,
        state: "submitted", answers: { __response: essay }, submitted_at: new Date().toISOString() })
      .select("id").single();
    if (attemptError || !attempt) throw new Error("TEST_ATTEMPT_CREATE_FAILED");
    attemptId = attempt.id;
    const queuedJob = await enqueueWritingAttempt(attempt.id, userId);
    if (queuedJob.status !== "queued" || !("id" in queuedJob)) throw new Error("TEST_JOB_NOT_QUEUED");
    const processed = await processOneCloudflareJob();
    if (!processed) throw new Error("TEST_JOB_NOT_CLAIMED");
    const { data: job, error: jobError } = await db.from("writing_grading_jobs")
      .select("status,error_code,id").eq("id", queuedJob.id).single();
    if (jobError || !job || job.status !== "completed") throw new Error(`TEST_JOB_${job?.status ?? "MISSING"}_${job?.error_code ?? "UNKNOWN"}`);
    const { data: result, error: resultError } = await db.from("writing_grading_results")
      .select("result").eq("job_id", job.id).single();
    if (resultError || !result) throw new Error("TEST_RESULT_MISSING");
    const graded = result.result as { task_band_display?: number; criteria?: unknown[] };
    console.log(JSON.stringify({ task_type: task1 ? "academic_task1" : "academic_task2", status: job.status, criteria: graded.criteria?.length, estimated_band: graded.task_band_display }));
  } finally {
    const { error: cleanupError } = await db.auth.admin.deleteUser(userId);
    if (cleanupError) throw new Error(`TEST_USER_CLEANUP_FAILED_${attemptId ?? "NO_ATTEMPT"}`);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
