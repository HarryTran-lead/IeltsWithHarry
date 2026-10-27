import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--apply")) throw new Error("Use --apply to create a temporary student and test the published pilot");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!url || !serviceKey || !publishableKey) throw new Error("Supabase URL and both API keys are required");
const site = "https://ieltswithharry.vercel.app";
const examId = "5359bea5-c7ab-4efc-b4cd-acf3d5339cdf";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `codex-factory-smoke-${randomUUID()}@example.invalid`;
const password = randomBytes(32).toString("base64url");
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user) throw new Error(`Test account creation failed: ${created.error?.message}`);
const userId = created.data.user.id;
const cookies = new Map();
try {
  const auth = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return [...cookies].map(([name, value]) => ({ name, value })); },
      setAll(items) { for (const { name, value } of items) cookies.set(name, value); },
    },
  });
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error || signed.data.user?.id !== userId) throw new Error(`Test sign-in failed: ${signed.error?.message}`);
  async function request(path, body) {
    const response = await fetch(`${site}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const data = await response.json().catch(() => null);
    if (response.status !== 200) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  }
  const catalog = await request("/api/ielts/bank/catalog?skill=Listening");
  assert.ok(catalog.exams.some((exam) => exam.id === examId), "Pilot absent from student catalog");
  const library = await request(`/api/ielts/bank/library?id=${examId}`);
  const section = library.exam.content.sections[0];
  assert.equal(section.questions.length, 10);
  assert.ok(section.audioUrl?.includes("/ielts-audio/ai-factory/"));
  assert.ok(section.questions.every((question) => question.answers.length === 0));
  const audio = await fetch(section.audioUrl, { headers: { Range: "bytes=0-1023" } });
  assert.ok([200, 206].includes(audio.status), `Audio HTTP ${audio.status}`);
  assert.ok((audio.headers.get("content-type") || "").includes("audio/mpeg"));
  const started = await request("/api/ielts/bank/attempt", { action: "start", examId });
  const attemptId = started.attempt.id;
  assert.equal(started.attempt.state, "in_progress");
  await request("/api/ielts/bank/attempt", { action: "save", attemptId, answers: { "pilot-p3-q21": "B" } });
  const answers = {
    "pilot-p3-q21": "B", "pilot-p3-q22": "C", "pilot-p3-q23": "10", "pilot-p3-q24": "6",
    "pilot-p3-q25": "B", "pilot-p3-q26": "A", "pilot-p3-q27": "June", "pilot-p3-q28": "C",
    "pilot-p3-q29": "A", "pilot-p3-q30": "Friday morning",
  };
  const submitted = await request("/api/ielts/bank/attempt", { action: "submit", attemptId, answers });
  assert.equal(submitted.score, 10);
  assert.equal(submitted.total, 10);
  const result = await request(`/api/ielts/bank/attempt?id=${attemptId}`);
  assert.equal(result.attempt.state, "submitted");
  assert.equal(result.attempt.score, 10);
  assert.equal(result.attempt.total, 10);
  const stored = await admin.from("ielts_attempts").select("state,score,total,version_id").eq("id", attemptId).single();
  if (stored.error) throw stored.error;
  assert.deepStrictEqual([stored.data.state, stored.data.score, stored.data.total], ["submitted", 10, 10]);
  assert.equal(stored.data.version_id, library.exam.versionId);
  console.log(JSON.stringify({ status: "passed", catalog: true, questions: 10, audioHttp: audio.status, score: "10/10", saved: true, testUserId: userId }));
} finally {
  const removed = await admin.auth.admin.deleteUser(userId);
  if (removed.error) console.error(`Temporary test account cleanup failed for ${userId}: ${removed.error.message}`);
}
