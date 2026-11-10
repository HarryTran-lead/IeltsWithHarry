/** Run on a private worker host: npx tsx scripts/writing-grading-worker.ts [--once]. */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { gradeWithLocalModel } from "../src/lib/writing-grading/local-provider";
import { rubricVersion, schemaVersion, verifyModelDraft, type TaskType } from "../src/lib/writing-grading/contract";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const model = process.env.WRITING_LOCAL_MODEL_ID;
const modelRevision = process.env.WRITING_LOCAL_MODEL_REVISION;
const modelUrl = process.env.WRITING_LOCAL_MODEL_URL || "http://127.0.0.1:11434";
if (!url || !key || !model || !modelRevision) throw new Error("Worker requires Supabase service role and pinned local model ID/revision");
const modelId: string = model;
const revisionId: string = modelRevision;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
type Job = {
  id: string; attempt_id: string; user_id: string; task_type: TaskType; prompt_snapshot: string;
  essay_snapshot: string; visual_snapshot: unknown; exam_version_id: string;
  lease_token: string; attempt_no: number;
};

async function processOne() {
  const { data: job, error } = await db.rpc("writing_claim_grading_job", { p_lease_seconds: 180 });
  if (error) throw new Error(`Queue claim failed: ${error.message}`);
  if (!job) return false;
  const item = job as Job;
  try {
    const { data: approved, error: registryError } = await db.from("writing_model_registry").select("id")
      .eq("model_id", modelId).eq("revision", revisionId).eq("task_type", item.task_type).eq("status", "approved").maybeSingle();
    if (registryError || !approved) throw new Error("MODEL_NOT_APPROVED");
    let facts: { id: string; claim: string }[] = [];
    if (item.task_type === "academic_task1") {
      const { data: source, error: sourceError } = await db.from("writing_grading_source_facts").select("facts,source_hash").eq("exam_version_id", item.exam_version_id).maybeSingle();
      if (sourceError) throw new Error("SOURCE_FACTS_LOOKUP_FAILED");
      if (!source || !Array.isArray(source.facts)) {
        await db.from("writing_grading_jobs").update({ status: "needs_review", error_code: "SOURCE_FACTS_UNVERIFIED", lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", item.id).eq("lease_token", item.lease_token);
        return true;
      }
      facts = source.facts as { id: string; claim: string }[];
      if (!facts.length || facts.some((fact) => typeof fact.id !== "string" || typeof fact.claim !== "string")) throw new Error("SOURCE_FACTS_INVALID");
    }
    const draft = await gradeWithLocalModel({ taskType: item.task_type, prompt: item.prompt_snapshot, essay: item.essay_snapshot, visual: item.visual_snapshot, verifiedFacts: facts }, { url: modelUrl, model: modelId });
    const verified = verifyModelDraft(draft, item.task_type, item.essay_snapshot, facts.map((fact) => fact.id));
    const resultId = randomUUID();
    const result = {
      ...verified, result_id: resultId, job_id: item.id, submission_id: item.attempt_id,
      status: "completed", rubric_version: rubricVersion,
      model_versions: { local: `${modelId}@${revisionId}` }, flags: [],
      created_at: new Date().toISOString(),
    };
    const { data: committed, error: finishError } = await db.rpc("writing_finish_grading_job", {
      p_job_id: item.id, p_lease_token: item.lease_token, p_result_id: resultId, p_result: result,
      p_schema_version: schemaVersion, p_rubric_version: rubricVersion, p_model_version: `${modelId}@${revisionId}`,
    });
    if (finishError) throw new Error("RESULT_WRITE_FAILED");
    if (!committed) return true; // Lease expired; a newer worker owns the job.
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : "";
    const known = new Set(["MODEL_NOT_APPROVED", "SOURCE_FACTS_INVALID", "SOURCE_FACTS_LOOKUP_FAILED", "LOCAL_MODEL_URL_REQUIRED", "LOCAL_MODEL_NOT_CONFIGURED", "LOCAL_MODEL_EMPTY", "LOCAL_MODEL_INVALID_JSON", "EVIDENCE_OFFSET_MISMATCH", "ERROR_OFFSET_MISMATCH", "UNVERIFIED_FACT_REFERENCE", "UNVERIFIED_DATA_CLAIM", "CRITERIA_MISMATCH", "RESULT_WRITE_FAILED"]);
    const code = known.has(raw) ? raw : /^LOCAL_MODEL_HTTP_\d{3}$/.test(raw) ? raw : "GRADING_FAILED";
    const exhausted = item.attempt_no >= 3 || code === "SOURCE_FACTS_INVALID" || code === "MODEL_NOT_APPROVED";
    const delay = new Date(Date.now() + Math.min(120000, 15000 * item.attempt_no)).toISOString();
    await db.from("writing_grading_jobs").update({ status: exhausted ? "failed" : "queued", error_code: code, available_at: delay, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", item.id).eq("lease_token", item.lease_token);
    // Log IDs and error class only; never log essay text.
    console.error(JSON.stringify({ job_id: item.id, error_code: code, retry: !exhausted }));
  }
  return true;
}

async function main() {
  const once = process.argv.includes("--once");
  do {
    const claimed = await processOne();
    if (once) break;
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Worker failed"); process.exitCode = 1; });
