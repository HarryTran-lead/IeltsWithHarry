import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const JOB_ID = "cdfd458a-5aed-4761-9232-6e2ead909a91";
const MP3_SHA256 = "7e9faa90dccb67e753298fc276d0712e084d081f1291a328181835f55468d2eb";
const REVIEW_NOTE = "Project owner approved the exact production MP3 in Codex chat on 2026-10-27. Ten answer keys and spoken evidence were reviewed; QA and ASR passed. Service-role deployment operation; no Admin identity was impersonated.";
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Supabase URL and service role key are required");

function loadTs(relativePath) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(createRequire(import.meta.url), exports);
  return exports;
}
const { pilotContent, pilotTurns } = loadTs("../src/lib/ai-factory/pilot.ts");
const { contentSchema, contentHash, validateExam } = loadTs("../src/lib/ielts-bank/schema.ts");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const job = checked(await db.from("ai_factory_jobs").select("*").eq("id", JOB_ID).single(), "job");
const exam = checked(await db.from("ielts_exams").select("*").eq("id", job.exam_id).single(), "exam");
if (exam.source_id !== "ai-factory" || exam.skill !== "Listening" || exam.external_id !== "pilot-listening-part-3-v1") {
  throw new Error("Unexpected exam identity");
}
if (job.status === "approved" && exam.status === "published" && exam.published_version_id === job.exam_version_id) {
  console.log(JSON.stringify({ status: "already_published", examId: exam.id, versionId: job.exam_version_id }));
  process.exit(0);
}
if (job.status !== "awaiting_review" || exam.status !== "needs_review" || exam.current_version_id !== job.exam_version_id) {
  throw new Error("Pilot is not at the expected review gate");
}
const version = checked(await db.from("ielts_exam_versions").select("*").eq("id", job.exam_version_id).single(), "version");
const qa = checked(await db.from("ai_factory_qa").select("*").eq("job_id", JOB_ID).single(), "QA");
const segments = checked(await db.from("ai_factory_segments").select("ordinal,speaker_id,voice_id,start_ms,end_ms").eq("job_id", JOB_ID).order("ordinal"), "segments");
assert.deepStrictEqual(version.content, pilotContent);
assert.equal(qa.passed, true);
assert.equal(qa.technical.passed, true);
assert.equal(qa.technical.clipped_samples, 0);
assert.equal(qa.technical.expected_turns, pilotTurns.length);
assert.equal(qa.technical.actual_turns, pilotTurns.length);
assert.equal(qa.answer_alignment.passed, true);
assert.equal(qa.asr.status, "completed");
assert.ok(qa.asr.word_error_rate <= 0.1);
assert.deepStrictEqual(qa.asr.missing_answer_phrases, []);
assert.equal(segments.length, pilotTurns.length);
assert.equal(new Set(segments.map((row) => row.speaker_id)).size, 3);
assert.deepStrictEqual(segments.map((row) => row.ordinal), pilotTurns.map((_, index) => index));
assert.deepStrictEqual(Object.keys(qa.answer_alignment.evidence).sort(), pilotContent.sections[0].questions.map((q) => q.id).sort());
const audio = checked(await db.storage.from("ai-factory-drafts").download(job.artifact_path), "private audio");
const bytes = Buffer.from(await audio.arrayBuffer());
const hash = createHash("sha256").update(bytes).digest("hex");
assert.equal(hash, MP3_SHA256);

const publicPath = `ai-factory/${JOB_ID}.mp3`;
const audioUrl = db.storage.from("ielts-audio").getPublicUrl(publicPath).data.publicUrl;
const content = contentSchema.parse(version.content);
const section = content.sections.find((row) => row.id === job.payload.sectionId);
if (!section) throw new Error("Pilot section missing");
section.audioUrl = audioUrl;
const warnings = validateExam({
  ...exam, externalId: exam.external_id, durationMinutes: exam.duration_minutes,
  sourceUrl: exam.source_url, licenseUrl: exam.license_url, aiGenerated: exam.ai_generated,
  upstreamVersion: version.upstream_version, content,
});
assert.deepStrictEqual(warnings, []);
console.log(JSON.stringify({ mode: apply ? "publish" : "check", examId: exam.id, jobId: job.id, questions: section.questions.length, turns: segments.length, sha256: hash, warnings }));
if (!apply) process.exit(0);

const existingAudio = await db.storage.from("ielts-audio").download(publicPath);
if (existingAudio.data) {
  const existingHash = createHash("sha256").update(Buffer.from(await existingAudio.data.arrayBuffer())).digest("hex");
  assert.equal(existingHash, MP3_SHA256, "Public audio path has different bytes");
} else {
  checked(await db.storage.from("ielts-audio").upload(publicPath, bytes, { contentType: "audio/mpeg", upsert: false }), "public audio upload");
}
const newVersion = checked(await db.from("ielts_exam_versions").insert({
  exam_id: exam.id, revision: version.revision + 1, upstream_version: version.upstream_version,
  content_hash: contentHash(content), content, warnings,
}).select("id").single(), "revision");
const updated = checked(await db.from("ielts_exams").update({ current_version_id: newVersion.id, status: "needs_review", updated_at: new Date().toISOString() })
  .eq("id", exam.id).eq("current_version_id", version.id).select("id").maybeSingle(), "revision pointer");
if (!updated) throw new Error("Exam changed during review");
checked(await db.from("ai_factory_qa").update({ naturalness_review: {
  listened: true, answersChecked: true, ownerApproved: true, approvedAt: new Date().toISOString(),
  note: REVIEW_NOTE,
} }).eq("job_id", JOB_ID), "human review");
const approved = checked(await db.from("ai_factory_jobs").update({
  status: "approved", exam_version_id: newVersion.id, review_note: REVIEW_NOTE,
  reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}).eq("id", JOB_ID).eq("status", "awaiting_review").select("id").maybeSingle(), "audio approval");
if (!approved) throw new Error("Audio job changed during approval");
checked(await db.from("ielts_review_log").insert({ exam_id: exam.id, version_id: newVersion.id, action: "audio_approved", note: REVIEW_NOTE }), "audio review log");
const ready = checked(await db.from("ielts_exams").update({ status: "ready", updated_at: new Date().toISOString() })
  .eq("id", exam.id).eq("current_version_id", newVersion.id).eq("status", "needs_review").select("id").maybeSingle(), "ready");
if (!ready) throw new Error("Exam could not be marked ready");
checked(await db.from("ielts_review_log").insert({ exam_id: exam.id, version_id: newVersion.id, action: "ready", note: REVIEW_NOTE }), "ready review log");
const published = checked(await db.from("ielts_exams").update({
  status: "published", published_version_id: newVersion.id, updated_at: new Date().toISOString(),
}).eq("id", exam.id).eq("current_version_id", newVersion.id).eq("status", "ready").select("id").maybeSingle(), "publish");
if (!published) throw new Error("Exam could not be published");
checked(await db.from("ielts_review_log").insert({ exam_id: exam.id, version_id: newVersion.id, action: "publish", note: REVIEW_NOTE }), "publish review log");
console.log(JSON.stringify({ status: "published", examId: exam.id, versionId: newVersion.id, audioUrl }));
