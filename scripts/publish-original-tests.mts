// Publishes the owner-supplied ten-paper pilot (ESL-PILOT-2026-*) after the owner confirmed the rights (2026-10-27):
// attaches the Gemini TTS audio made by voice-original-tests.mts to each Listening part, saves a new revision,
// then marks every paper ready and published. Dry run by default; --apply writes to the database.
//   node --env-file=.env.production.local --experimental-strip-types scripts/publish-original-tests.mts [--apply]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { contentHash, contentSchema, validateExam, type NormalizedExam } from "../src/lib/ielts-bank/schema.ts";

const apply = process.argv.includes("--apply");
const audioDir = join("content", "original-tests", "dist", "audio");
const license = "Original IeltsWithHarry practice test (owner-confirmed rights)";
const attribution = "IeltsWithHarry original practice test";
const note = "Owner confirmed publication rights on 2026-10-27; Listening audio voiced with Gemini TTS.";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const ref = new URL(url).hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Unexpected project ref");
  const [command, args] = process.platform === "win32"
    ? ["cmd.exe", ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]]
    : ["npx", ["supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]];
  key = (JSON.parse(execFileSync(command, args, { encoding: "utf8" })) as { id: string; api_key: string }[]).find((item) => item.id === "service_role")?.api_key;
}
if (!key) throw new Error("No service role key available");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = <T,>(result: { data: T; error: { message: string } | null }, context: string) => {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
};

const admins = ok(await db.from("admin_users").select("user_id").order("granted_at").limit(1), "admin user") as { user_id: string }[];
const actor = admins[0]?.user_id;
if (!actor) throw new Error("No admin user to record as reviewer");

type Exam = { id: string; external_id: string; title: string; skill: NormalizedExam["skill"]; format: string; mode: string; duration_minutes: number; source_url: string; license_url: string; ai_generated: boolean; status: string; current_version_id: string };
const exams = ok(await db.from("ielts_exams").select("id,external_id,title,skill,format,mode,duration_minutes,source_url,license_url,ai_generated,status,current_version_id").like("external_id", "ESL-PILOT-2026-%").order("external_id"), "pilot exams") as Exam[];
if (exams.length !== 10) throw new Error(`Expected 10 pilot exams, found ${exams.length}`);

// Check everything before writing anything: every Listening part needs its MP3.
const plans = [];
for (const exam of exams) {
  const version = ok(await db.from("ielts_exam_versions").select("id,revision,upstream_version,content").eq("id", exam.current_version_id).single(), `${exam.external_id} version`) as { id: string; revision: number; upstream_version: string; content: unknown };
  const content = contentSchema.parse(version.content);
  const audio = exam.skill === "Listening" ? content.sections.map((section) => ({ section, file: join(audioDir, `${section.id}.mp3`) })) : [];
  const missing = audio.filter((item) => !existsSync(item.file)).map((item) => item.file);
  if (missing.length) throw new Error(`${exam.external_id}: missing audio ${missing.join(", ")}`);
  plans.push({ exam, version, content, audio });
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry run", exams: plans.map(({ exam, audio }) => `${exam.external_id} (${exam.skill}, ${exam.status}, audio parts: ${audio.length})`) }, null, 1));
if (!apply) process.exit(0);

for (const { exam, version, content, audio } of plans) {
  for (const { section, file } of audio) {
    const path = `original-tests/${section.id}.mp3`;
    ok(await db.storage.from("ielts-audio").upload(path, readFileSync(file), { contentType: "audio/mpeg", upsert: true }), `upload ${path}`);
    section.audioUrl = db.storage.from("ielts-audio").getPublicUrl(path).data.publicUrl;
  }
  const parsed = contentSchema.parse(content);
  const warnings = validateExam({
    externalId: exam.external_id, skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title,
    durationMinutes: exam.duration_minutes, sourceUrl: exam.source_url, attribution, license, licenseUrl: exam.license_url,
    aiGenerated: exam.ai_generated, upstreamVersion: version.upstream_version, content: parsed,
  });
  if (warnings.length) throw new Error(`${exam.external_id}: validation warnings ${warnings.join(", ")}`);
  const row = ok(await db.from("ielts_exam_versions").insert({ exam_id: exam.id, revision: version.revision + 1, upstream_version: version.upstream_version, content_hash: contentHash(parsed), content: parsed, warnings }).select("id").single(), `${exam.external_id} revision`) as { id: string };
  ok(await db.from("ielts_exams").update({ current_version_id: row.id, license, attribution, status: "ready", updated_at: new Date().toISOString() }).eq("id", exam.id).eq("current_version_id", version.id).select("id").single(), `${exam.external_id} ready`);
  ok(await db.from("ielts_review_log").insert([
    { exam_id: exam.id, version_id: row.id, actor_id: actor, action: "edit", note },
    { exam_id: exam.id, version_id: row.id, actor_id: actor, action: "ready", note },
  ]), `${exam.external_id} review log`);
  ok(await db.from("ielts_exams").update({ status: "published", published_version_id: row.id, updated_at: new Date().toISOString() }).eq("id", exam.id).select("id").single(), `${exam.external_id} publish`);
  ok(await db.from("ielts_review_log").insert({ exam_id: exam.id, version_id: row.id, actor_id: actor, action: "publish", note }), `${exam.external_id} publish log`);
  console.log(`${exam.external_id}: published revision ${version.revision + 1}${audio.length ? ` with ${audio.length} audio parts` : ""}`);
}
