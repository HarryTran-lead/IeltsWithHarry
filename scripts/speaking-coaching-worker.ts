/** Run privately on Oracle: npx tsx scripts/speaking-coaching-worker.ts [--once]. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { transcriptSchema, speakingMetrics } from "../src/lib/speaking-coaching/contract";
import { coachSpeaking } from "../src/lib/speaking-coaching/local-provider";

const run = promisify(execFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const model = process.env.SPEAKING_LOCAL_MODEL_ID;
const revision = process.env.SPEAKING_LOCAL_MODEL_REVISION;
const modelUrl = process.env.SPEAKING_LOCAL_MODEL_URL || "http://127.0.0.1:11434";
if (!url || !key || !model || !revision) throw new Error("Speaking worker requires Supabase credentials and a pinned local model");
const modelId: string = model;
const modelRevision: string = revision;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
type Job = { id: string; session_id: string; user_id: string; answer_index: number; question_snapshot: string; recording_path: string; lease_token: string; attempt_no: number };

async function transcribeAudio(path: string) {
  const downloaded = await db.storage.from("speaking-recordings").download(path);
  if (downloaded.error || !downloaded.data) throw new Error("SPEAKING_AUDIO_UNAVAILABLE");
  if (downloaded.data.size > 10_485_760) throw new Error("SPEAKING_AUDIO_TOO_LARGE");
  const directory = await mkdtemp(join(tmpdir(), "speaking-coach-"));
  try {
    const filename = join(directory, "answer.audio");
    await writeFile(filename, Buffer.from(await downloaded.data.arrayBuffer()), { mode: 0o600 });
    const script = fileURLToPath(new URL("./transcribe-speaking.py", import.meta.url));
    const output = await run(process.env.SPEAKING_PYTHON || "python3", [script, filename], { timeout: 300000, maxBuffer: 1_000_000 });
    return transcriptSchema.parse(JSON.parse(output.stdout));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function processOne() {
  // Only block for Writing when its local worker shares this Oracle host.
  if (process.env.SPEAKING_SHARE_ORACLE_WITH_WRITING === "true") {
    const writing = await db.from("writing_grading_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "analyzing"]);
    if (writing.error) throw new Error("Writing queue check failed");
    if ((writing.count ?? 0) > 0) return false;
  }
  const { data: job, error } = await db.rpc("speaking_claim_coaching_job", { p_lease_seconds: 900 });
  if (error) throw new Error(`Speaking queue claim failed: ${error.message}`);
  if (!job || !(job as Job).id) return false;
  const item = job as Job;
  try {
    const transcript = await transcribeAudio(item.recording_path);
    const coaching = await coachSpeaking(item.question_snapshot, transcript.text, { url: modelUrl, model: modelId });
    const result = {
      version: "speaking-part2-pilot-v1", question: item.question_snapshot,
      transcript: transcript.text, duration_seconds: transcript.duration_seconds,
      metrics: speakingMetrics(transcript), coaching,
      asr_model: transcript.asr_model, coaching_model: `${modelId}@${modelRevision}`,
      pronunciation_status: "not_assessed", overall_band: null,
    };
    const finished = await db.rpc("speaking_finish_coaching_job", { p_job_id: item.id, p_lease_token: item.lease_token, p_result: result });
    if (finished.error) throw new Error("SPEAKING_RESULT_WRITE_FAILED");
    if (finished.data) {
      const notice = await db.from("user_notifications").upsert({ id: item.id, user_id: item.user_id, kind: "account",
        title: "Phân tích Speaking Part 2 đã xong", body: "Mở phiên thi thử để xem transcript và góp ý.",
        link: `/app/speaking/mock?coaching=${item.session_id}` }, { onConflict: "id", ignoreDuplicates: true });
      if (notice.error) console.error(JSON.stringify({ job_id: item.id, error_code: "SPEAKING_NOTICE_FAILED" }));
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    const permanent = ["SPEAKING_AUDIO_DURATION_INVALID", "SPEAKING_TRANSCRIPT_TOO_SHORT", "SPEAKING_AUDIO_TOO_LARGE", "SPEAKING_AUDIO_UNAVAILABLE"].some((code) => message.includes(code));
    const exhausted = permanent || item.attempt_no >= 3;
    const delay = new Date(Date.now() + Math.min(120000, 15000 * item.attempt_no)).toISOString();
    await db.from("speaking_coaching_jobs").update({ status: exhausted ? "failed" : "queued",
      error_code: permanent ? "SPEAKING_AUDIO_INVALID" : "SPEAKING_ANALYSIS_FAILED", available_at: delay,
      lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
      .eq("id", item.id).eq("lease_token", item.lease_token);
    console.error(JSON.stringify({ job_id: item.id, error_code: permanent ? "SPEAKING_AUDIO_INVALID" : "SPEAKING_ANALYSIS_FAILED", retry: !exhausted }));
  }
  return true;
}

async function main() {
  const asrPath = process.env.SPEAKING_ASR_MODEL_PATH;
  if (!asrPath || !(await stat(asrPath)).isDirectory()) throw new Error("Speaking ASR model directory unavailable");
  const endpoint = new URL(modelUrl);
  if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) throw new Error("Speaking local model URL required");
  const once = process.argv.includes("--once");
  do {
    const claimed = await processOne();
    if (once) break;
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}
void main().catch(() => { console.error("Speaking worker stopped"); process.exitCode = 1; });
