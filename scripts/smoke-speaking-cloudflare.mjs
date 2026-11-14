/** Synthetic production smoke; requires private environment variables and cleans its test data. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const trigger = process.env.WORKER_TRIGGER_SECRET;
const workerUrl = process.env.SPEAKING_WORKER_URL;
const audioPath = process.env.SPEAKING_SMOKE_AUDIO_PATH;
if (!url || !key || !trigger || !workerUrl || !audioPath) throw new Error("Missing smoke environment");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sessionId = randomUUID();
let userId;
let recordingPath;
let jobId;

try {
  const created = await db.auth.admin.createUser({ email: `speaking-smoke-${randomUUID()}@example.invalid`, password: randomUUID(), email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Create test user: ${created.error?.message}`);
  userId = created.data.user.id;
  const answer = { part: 2, question: "Describe a place you visited that you really enjoyed.", seconds: 16, transcript: "" };
  const session = await db.from("speaking_mock_sessions").insert({ id: sessionId, user_id: userId, duration_seconds: 16, speaking_seconds: 16, answers: [answer] });
  if (session.error) throw new Error(`Create test session: ${session.error.message}`);
  recordingPath = `${userId}/${sessionId}/0.webm`;
  const audio = await readFile(audioPath);
  const uploaded = await db.storage.from("speaking-recordings").upload(recordingPath, audio, { contentType: "audio/webm", upsert: false });
  if (uploaded.error) throw new Error(`Upload synthetic audio: ${uploaded.error.message}`);
  const recording = await db.from("speaking_mock_recordings").insert({ session_id: sessionId, user_id: userId, answer_index: 0, storage_path: recordingPath });
  if (recording.error) throw new Error(`Create recording reference: ${recording.error.message}`);
  const queued = await db.from("speaking_coaching_jobs").insert({ session_id: sessionId, user_id: userId, answer_index: 0,
    question_snapshot: answer.question, recording_path: recordingPath, recording_seconds: 16 }).select("id").single();
  if (queued.error || !queued.data) throw new Error(`Queue smoke job: ${queued.error?.message}`);
  jobId = queued.data.id;
  const invoked = await fetch(`${workerUrl}/run`, { method: "POST", headers: { Authorization: `Bearer ${trigger}` } });
  if (!invoked.ok) throw new Error(`Invoke worker: HTTP ${invoked.status}`);
  console.log(JSON.stringify({ invocation: (await invoked.json()).status }));
  let final;
  for (let attempt = 0; attempt < 24; attempt++) {
    const query = await db.from("speaking_coaching_jobs").select("status,error_code,result").eq("id", jobId).single();
    if (query.error) throw new Error(`Read smoke job: ${query.error.message}`);
    if (["completed", "failed"].includes(query.data.status)) { final = query.data; break; }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!final) throw new Error("Smoke job did not finish within two minutes");
  const result = final.result;
  const notice = await db.from("user_notifications").select("id").eq("id", jobId).maybeSingle();
  const summary = { status: final.status, error_code: final.error_code,
    transcript_words: result?.metrics?.recognized_words ?? 0,
    coaching_areas: result?.coaching?.areas?.length ?? 0,
    notice_created: Boolean(notice.data) };
  console.log(JSON.stringify(summary));
  if (final.status !== "completed" || summary.transcript_words < 5 || summary.coaching_areas !== 3 || !summary.notice_created) {
    throw new Error("Synthetic Speaking smoke failed");
  }
} finally {
  if (recordingPath) await db.storage.from("speaking-recordings").remove([recordingPath]);
  if (userId) await db.auth.admin.deleteUser(userId);
}
