// Requests Gemini TTS audio for the Skill Lab dictation turns and stores each reply as a raw WAV
// batch in .cache/dictation-skill-lab/batches/ (with the turns it contains). The companion
// scripts/dictation-skill-lab-split.py cuts batches into one MP3 per turn using Whisper word
// timestamps, checks each clip against its transcript and writes content/dictation-skill-lab/audio-manifest.json.
//
// Tier 1 allows 100 TTS requests per model per day, so turns that share a voice and style go into
// one request: each turn is a separate input item and the model pauses between items. Models are
// tried in order; when one hits its daily cap the next takes over. Re-running skips turns that are
// already in the manifest or in an unsplit batch, so the script resumes after a quota stop.
//
//   node --env-file=.env.local --experimental-strip-types scripts/dictation-skill-lab-tts.mjs \
//     [--lessons A,B] [--batch-chars 2400] [--batch-items 24] [--max-requests 90] [--models m1,m2] [--redo-flagged] [--dry-run]
//   python scripts/dictation-skill-lab-split.py
//
// Audio produced here is `generated_needs_human_QA`; a teacher still has to listen before release.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { styleFor, voicesFor } from "../src/lib/dictation-skill-lab/tts-plan.ts";

const argv = process.argv.slice(2);
const option = (name, fallback) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : fallback; };
const dryRun = argv.includes("--dry-run");
const redoFlagged = argv.includes("--redo-flagged");
const only = new Set((option("lessons", "") || "").split(",").map((item) => item.trim()).filter(Boolean));
const batchChars = Math.max(1, Number(option("batch-chars", "2400")) || 2400);
const batchItems = Math.max(1, Number(option("batch-items", "24")) || 24);
const maxRequests = Number(option("max-requests", "0")) || Infinity;
const concurrency = Math.max(1, Math.min(4, Number(option("concurrency", "2")) || 2));
const models = option("models", process.env.DICTATION_TTS_MODELS || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts").split(",").map((m) => m.trim()).filter(Boolean);

const root = resolve(".");
const lessonsDir = join(root, "content/dictation-skill-lab/lessons");
const manifestPath = join(root, "content/dictation-skill-lab/audio-manifest.json");
const batchDir = join(root, ".cache/dictation-skill-lab/batches");
mkdirSync(batchDir, { recursive: true });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { turns: {} };
/** Turns waiting in a batch that has not been split yet. */
const inBatches = new Set(readdirSync(batchDir).filter((file) => file.endsWith(".json")).flatMap((file) => {
  const batch = JSON.parse(readFileSync(join(batchDir, file), "utf8"));
  return batch.split_at ? [] : batch.jobs.map((job) => job.key);
}));
const lessons = readdirSync(lessonsDir).filter((file) => file.endsWith(".json")).sort()
  .map((file) => JSON.parse(readFileSync(join(lessonsDir, file), "utf8")))
  .filter((lesson) => !only.size || only.has(lesson.lesson_id));

// Listening mock parts named in content/listening-mocks/audio-priority.json are voiced first, before any
// Dictation lesson; each part is treated like a lesson (its own speakers), one clip per turn.
const mocksDir = join(root, "content/listening-mocks/tests");
const priorityPath = join(root, "content/listening-mocks/audio-priority.json");
const priorityTests = existsSync(priorityPath) ? JSON.parse(readFileSync(priorityPath, "utf8")).tests ?? [] : [];
const mockParts = priorityTests.filter((id) => !only.size || only.has(id)).flatMap((id, testIndex) => {
  const path = join(mocksDir, `${id}.json`);
  if (!existsSync(path)) return [];
  const test = JSON.parse(readFileSync(path, "utf8"));
  return test.parts.map((part) => ({
    lesson_id: part.part_id, level: "L6", section: part.part_number, content_format: "listening_mock", rank: testIndex,
    speakers: part.speakers.map((speaker) => ({ ...speaker, role: speaker.role ?? "", accent_requested: speaker.accent_requested ?? "british" })),
    turns: part.turns,
  }));
});
/** Mocks first, then Dictation lessons from basic to advanced (L1 → L7), then by ID. */
const rankOf = (lesson) => lesson.content_format === "listening_mock" ? lesson.rank : 100 + Number(String(lesson.level).replace(/\D/g, "") || 9);
const units = [...mockParts, ...lessons].map((lesson) => ({ lesson, rank: rankOf(lesson) }))
  .sort((a, b) => a.rank - b.rank || a.lesson.lesson_id.localeCompare(b.lesson.lesson_id));

const pending = [];
for (const { lesson, rank } of units) {
  const voices = voicesFor(lesson);
  const speakers = Object.fromEntries(lesson.speakers.map((speaker) => [speaker.speaker_id, speaker]));
  for (const turn of lesson.turns) {
    const speaker = speakers[turn.speaker_id];
    if (!speaker) throw new Error(`${lesson.lesson_id}/${turn.turn_id}: unknown speaker ${turn.speaker_id}`);
    const key = `${lesson.lesson_id}/${turn.turn_id}`;
    const job = { key, lesson: lesson.lesson_id, turn: turn.turn_id, text: turn.text_en, voice: voices[turn.speaker_id], accent: speaker.accent_requested,
      style: styleFor(lesson, speaker), file: `/dictation-skill-lab/audio/${lesson.lesson_id}/${turn.turn_id}.mp3`, rank };
    const done = manifest.turns[key];
    const flagged = done && done.asr_check !== "pass";
    const current = done && done.text_sha256 === sha256(job.text) && done.voice === job.voice && existsSync(join(root, "public", job.file));
    if ((!current || (redoFlagged && flagged)) && !inBatches.has(key)) pending.push(job);
  }
}

/** Same voice and style, in curriculum order, up to batchChars characters and batchItems items. */
function makeBatches(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const id = `${job.voice}|${job.style}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(job);
  }
  const batches = [];
  for (const group of groups.values()) {
    let current = []; let chars = 0;
    for (const job of group) {
      if (current.length && (chars + job.text.length > batchChars || current.length >= batchItems)) { batches.push(current); current = []; chars = 0; }
      current.push(job); chars += job.text.length;
    }
    if (current.length) batches.push(current);
  }
  return batches;
}

// A batch goes in the queue at the rank of its most basic turn, so mocks and easy lessons are voiced first.
const queue = makeBatches(pending).sort((a, b) => Math.min(...a.map((job) => job.rank)) - Math.min(...b.map((job) => job.rank)));
console.log(`${lessons.length} lesson(s), ${pending.length} turn(s) to voice in ${queue.length} request(s) (${pending.reduce((sum, job) => sum + job.text.length, 0)} characters); models ${models.join(" → ")}`);
if (dryRun) { for (const batch of queue.slice(0, 5)) console.log(batch.length, batch[0].voice, batch.map((job) => job.key).join(" ")); process.exit(0); }
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

class QuotaReached extends Error { constructor(model, message) { super(`${model}: ${message}`); this.model = model; } }
class Fatal extends Error {}
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
let requests = 0; let modelIndex = 0;

async function request(batch) {
  const model = models[modelIndex];
  const body = JSON.stringify({
    model,
    input: [{ type: "user_input", content: batch.map((job) => ({ type: "text", text: job.text, annotations: [{ type: "speech_metadata", style: job.style }] })) }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: batch[0].voice }] },
  });
  for (let attempt = 1; ; attempt += 1) {
    if (requests >= maxRequests) throw new Fatal(`request budget of ${maxRequests} used`);
    requests += 1;
    let response; let payload = null;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(240_000) });
      payload = await response.json().catch(() => null);
    } catch (error) {
      if (attempt >= 4) throw new Error(`network: ${error.message}`);
      await wait(8000 * attempt); continue;
    }
    if (response.ok) {
      const data = (payload?.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "audio" && item.data).pop()?.data;
      if (data) return { bytes: Buffer.from(data, "base64"), model };
      throw new Error("no audio in response");
    }
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 429 && /per day|daily/i.test(message)) throw new QuotaReached(model, message);
    if ([400, 401, 403, 404].includes(response.status)) throw new Fatal(`HTTP ${response.status}: ${message}`);
    if (attempt >= 6) throw new Error(`HTTP ${response.status}: ${message}`);
    const retryAfter = Number(response.headers.get("retry-after")) || 0;
    await wait(Math.max(retryAfter * 1000, Math.min(90_000, 10_000 * 2 ** (attempt - 1))));
  }
}

let voiced = 0;
async function voiceBatch(batch) {
  let result;
  for (;;) {
    try { result = await request(batch); break; }
    catch (error) {
      if (error instanceof QuotaReached && error.model !== models[modelIndex]) continue;
      if (error instanceof QuotaReached && modelIndex + 1 < models.length) { console.log(`quota: ${error.message.slice(0, 110)} → switching to ${models[modelIndex + 1]}`); modelIndex += 1; continue; }
      throw error;
    }
  }
  if (result.bytes.subarray(0, 4).toString("latin1") !== "RIFF") throw new Error("reply is not WAV audio");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${sha256(batch.map((job) => job.key).join(",")).slice(0, 10)}`;
  writeFileSync(join(batchDir, `${id}.wav`), result.bytes);
  const record = { id, model: result.model, voice: batch[0].voice, style: batch[0].style, created_at: new Date().toISOString(), split_at: null,
    jobs: batch.map(({ key, lesson, turn, text, voice, accent, style, file }) => ({ key, lesson, turn, text, voice, accent, style, file, text_sha256: sha256(text) })) };
  writeFileSync(join(batchDir, `${id}.json`), `${JSON.stringify(record, null, 1)}\n`);
  voiced += batch.length;
}

const started = Date.now();
let stopped = ""; let failedBatches = 0; let done = 0; let next = 0;
async function worker() {
  while (!stopped && next < queue.length) {
    const batch = queue[next++];
    try { await voiceBatch(batch); }
    catch (error) {
      if (error instanceof QuotaReached || error instanceof Fatal) { stopped = error.message; break; }
      failedBatches += 1; console.error(`${batch[0].key} (+${batch.length - 1}): ${error.message}`);
    }
    done += 1;
    if (done % 5 === 0) console.log(`${done}/${queue.length} batches · ${voiced} turns · ${requests} requests · ${models[modelIndex]} · ${((Date.now() - started) / 60000).toFixed(1)} min`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`done: ${voiced} turns requested, ${pending.length - voiced} left, ${failedBatches} failed batches, ${requests} requests, ${((Date.now() - started) / 60000).toFixed(1)} min${stopped ? ` · STOPPED: ${stopped}` : ""}`);
if (stopped || failedBatches) process.exitCode = 1;
