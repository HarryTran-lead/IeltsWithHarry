import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const job = {
  id: "11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  lease_token: "44444444-4444-4444-8444-444444444444",
  answer_index: 1,
  recording_path: "33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222/1.webm",
  recording_seconds: 10,
  question_snapshot: "Describe a place you enjoyed visiting.",
  attempt_no: 1,
};
const transcript = "I visited Hanoi last year and enjoyed its old streets very much.";
const coaching = {
  areas: [
    { criterion: "fluency_coherence", evidence_quote: "I visited Hanoi", feedback_vi: "Bạn nêu địa điểm rõ; hãy thêm trình tự hoạt động.", practice_vi: "Kể lại theo thứ tự trước, trong và sau chuyến đi." },
    { criterion: "lexical_resource", evidence_quote: "old streets", feedback_vi: "Cụm từ cụ thể; có thể thêm chi tiết về khung cảnh.", practice_vi: "Dùng hai tính từ cụ thể để tả phố." },
    { criterion: "grammar", evidence_quote: "last year", feedback_vi: "Mốc thời gian rõ; luyện duy trì thì quá khứ.", practice_vi: "Kể thêm hai việc đã làm với động từ quá khứ." },
  ],
  strengths_vi: ["Nêu rõ địa điểm."], next_steps_vi: ["Thêm ví dụ cụ thể."],
};

test("claims a private recording, stores verified coaching, and notifies the owner", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path === "/rest/v1/speaking_coaching_jobs") return Response.json([]);
    if (path.endsWith("/speaking_claim_coaching_job")) return Response.json(job);
    if (path.startsWith("/storage/v1/object/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } });
    if (path.endsWith("/speaking_finish_coaching_job")) return Response.json(true);
    if (path === "/rest/v1/user_notifications") return Response.json({});
    throw new Error(`Unexpected path ${path}`);
  };
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private-key", SPEAKING_WORKER_ENABLED: "true", WORKER_TRIGGER_SECRET: "trigger",
    AI: { run: async (model, input) => model.includes("whisper") ? (assert.deepEqual(input.audio, [1, 2, 3]), {
      text: transcript, words: [
        { word: "I", start: 0, end: 0.3 }, { word: "visited", start: 0.4, end: 0.9 },
        { word: "Hanoi", start: 1, end: 1.5 }, { word: "last", start: 4, end: 4.4 },
        { word: "year", start: 4.5, end: 4.9 }, { word: "and", start: 5, end: 5.2 },
      ],
    }) : { response: JSON.stringify(coaching) } },
  };
  try {
    const response = await worker.fetch(new Request("https://worker.example/run", { method: "POST", headers: { Authorization: "Bearer trigger" } }), env);
    assert.deepEqual(await response.json(), { status: "completed" });
    const finish = calls.find(({ path }) => path.endsWith("/speaking_finish_coaching_job"));
    const result = JSON.parse(finish.options.body).p_result;
    assert.equal(result.metrics.long_pause_count, 1);
    assert.equal(result.duration_seconds, 10);
    assert.equal(result.pronunciation_status, "not_assessed");
    assert.equal(result.overall_band, null);
    assert.ok(calls.some(({ path }) => path === "/rest/v1/user_notifications"));
    assert.ok(calls.every(({ options }) => options.headers.Authorization === "Bearer private-key"));
  } finally { globalThis.fetch = original; }
});

test("manual invocation requires its trigger secret", async () => {
  const response = await worker.fetch(new Request("https://worker.example/run", { method: "POST" }), { WORKER_TRIGGER_SECRET: "trigger" });
  assert.equal(response.status, 401);
});

test("empty Supabase composite row means the queue is idle", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new URL(url).pathname.endsWith("/speaking_claim_coaching_job")
    ? Response.json({ id: null, lease_token: null }) : Response.json([]);
  try {
    const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private-key", SPEAKING_WORKER_ENABLED: "true", WORKER_TRIGGER_SECRET: "trigger" };
    const response = await worker.fetch(new Request("https://worker.example/run", { method: "POST", headers: { Authorization: "Bearer trigger" } }), env);
    assert.deepEqual(await response.json(), { status: "idle" });
  } finally { globalThis.fetch = original; }
});
