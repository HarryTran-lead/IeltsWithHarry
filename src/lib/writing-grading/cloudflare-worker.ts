import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cloudflareWritingModel, gradeWithCloudflare } from "./cloudflare-provider";
import { rubricVersion, schemaVersion, verifyModelDraft, type TaskType } from "./contract";

type Job = {
  id: string; attempt_id: string; task_type: TaskType; prompt_snapshot: string;
  essay_snapshot: string; visual_snapshot: unknown; exam_version_id: string;
  lease_token: string; attempt_no: number;
};

export function cloudflareGradingSelected() {
  return process.env.WRITING_GRADING_PROVIDER === "cloudflare";
}

/** Run after an authenticated enqueue response; the service role never reaches the client. */
export async function processOneCloudflareJob() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  const proxyUrl = process.env.WRITING_CLOUDFLARE_PROXY_URL;
  const proxySecret = process.env.WRITING_CLOUDFLARE_PROXY_SECRET;
  const revision = process.env.WRITING_CLOUDFLARE_MODEL_REVISION;
  if (!url || !key || !accountId || !(apiToken || (proxyUrl && proxySecret)) || !revision) throw new Error("CLOUDFLARE_GRADING_NOT_CONFIGURED");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: job, error } = await db.rpc("writing_claim_grading_job", { p_lease_seconds: 75 });
  if (error) throw new Error(`Queue claim failed: ${error.message}`);
  if (!job) return false;
  const item = job as Job;
  try {
    const allowedStatus = process.env.WRITING_GRADING_ALLOW_PILOT === "true" ? ["pilot", "approved"] : ["approved"];
    const { data: approved, error: registryError } = await db.from("writing_model_registry").select("id")
      .eq("model_id", cloudflareWritingModel).eq("revision", revision).eq("task_type", item.task_type)
      .eq("provider", "cloudflare")
      .in("status", allowedStatus).maybeSingle();
    if (registryError || !approved) throw new Error("MODEL_NOT_APPROVED");
    let facts: { id: string; claim: string }[] = [];
    if (item.task_type === "academic_task1") {
      const { data: source, error: sourceError } = await db.from("writing_grading_source_facts").select("facts")
        .eq("exam_version_id", item.exam_version_id).maybeSingle();
      if (sourceError) throw new Error("SOURCE_FACTS_LOOKUP_FAILED");
      if (!source || !Array.isArray(source.facts)) {
        await db.from("writing_grading_jobs").update({ status: "needs_review", error_code: "SOURCE_FACTS_UNVERIFIED", lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
          .eq("id", item.id).eq("lease_token", item.lease_token);
        return true;
      }
      facts = source.facts as { id: string; claim: string }[];
      if (!facts.length || facts.some((fact) => typeof fact.id !== "string" || typeof fact.claim !== "string")) throw new Error("SOURCE_FACTS_INVALID");
    }
    const draft = await gradeWithCloudflare(
      { taskType: item.task_type, prompt: item.prompt_snapshot, essay: item.essay_snapshot, visual: item.visual_snapshot, verifiedFacts: facts },
      { accountId, apiToken: proxyUrl ? proxySecret! : apiToken!, proxyUrl },
    );
    const verified = verifyModelDraft(draft, item.task_type, item.essay_snapshot, facts.map((fact) => fact.id));
    const resultId = randomUUID();
    const modelVersion = `${cloudflareWritingModel}@${revision}`;
    const result = {
      ...verified, result_id: resultId, job_id: item.id, submission_id: item.attempt_id,
      status: "completed", rubric_version: rubricVersion,
      model_versions: { cloudflare: modelVersion }, flags: ["hosted_inference"],
      created_at: new Date().toISOString(),
    };
    const { data: committed, error: finishError } = await db.rpc("writing_finish_grading_job", {
      p_job_id: item.id, p_lease_token: item.lease_token, p_result_id: resultId, p_result: result,
      p_schema_version: schemaVersion, p_rubric_version: rubricVersion, p_model_version: modelVersion,
    });
    if (finishError) throw new Error("RESULT_WRITE_FAILED");
    return Boolean(committed);
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : "";
    const known = new Set(["MODEL_NOT_APPROVED", "SOURCE_FACTS_INVALID", "SOURCE_FACTS_LOOKUP_FAILED", "CLOUDFLARE_EMPTY", "CLOUDFLARE_INVALID_JSON", "CLOUDFLARE_QUOTA_EXCEEDED", "CLOUDFLARE_QUOTE_NOT_IN_ESSAY", "EVIDENCE_OFFSET_MISMATCH", "ERROR_OFFSET_MISMATCH", "VOCABULARY_OFFSET_MISMATCH", "UNVERIFIED_FACT_REFERENCE", "UNVERIFIED_DATA_CLAIM", "CRITERIA_MISMATCH", "RESULT_WRITE_FAILED"]);
    const code = known.has(raw) ? raw : /^CLOUDFLARE_HTTP_\d{3}$/.test(raw) ? raw : "GRADING_FAILED";
    const quotaExceeded = code === "CLOUDFLARE_QUOTA_EXCEEDED";
    const exhausted = item.attempt_no >= 3 || code === "SOURCE_FACTS_INVALID" || code === "MODEL_NOT_APPROVED" || quotaExceeded;
    const nextUtcDay = new Date();
    nextUtcDay.setUTCHours(24, 0, 0, 0);
    const delay = quotaExceeded ? nextUtcDay.toISOString() : new Date(Date.now() + Math.min(120000, 15000 * item.attempt_no)).toISOString();
    await db.from("writing_grading_jobs").update({ status: exhausted ? "failed" : "queued", error_code: code, available_at: delay, lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
      .eq("id", item.id).eq("lease_token", item.lease_token);
    console.error(JSON.stringify({ job_id: item.id, error_code: code, retry: !exhausted }));
    return true;
  }
}
