import { createHash } from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--apply")) throw new Error("Use --apply to queue one pilot in the configured Supabase project");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Supabase URL and service role key are required");
const source = fs.readFileSync(new URL("../src/lib/ai-factory/pilot.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const pilot = {};
new Function("exports", compiled)(pilot);

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const settings = checked(await db.from("ai_factory_settings").select("daily_job_limit").single());
const since = new Date(); since.setUTCHours(0, 0, 0, 0);
const today = await db.from("ai_factory_jobs").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString());
checked(today);
if ((today.count ?? 0) >= settings.daily_job_limit) throw new Error("Daily job limit reached");
const active = checked(await db.from("ai_factory_jobs").select("id").eq("kind", "listening_audio")
  .in("status", ["queued", "running", "awaiting_review", "approved"])
  .contains("payload", { pilot: true }).limit(1));
if (active.length) throw new Error(`Pilot already exists: ${active[0].id}`);

const content = pilot.pilotContent;
if (content.sections.length !== 1 || content.sections[0].questions.length !== 10 || pilot.pilotTurns.length !== 20) {
  throw new Error("Pilot script or question count changed");
}
const sourceUrl = "https://ieltswithharry.vercel.app/app/question-bank";
const title = "Urban ecology project discussion — Part 3";
const meta = {
  skill: "Listening", title, format: "Academic", mode: "practice", topic: "Urban ecology", difficulty: "B2-C1",
  duration_minutes: 12, license: "Original AI-assisted practice", license_url: sourceUrl, source_url: sourceUrl,
  attribution: "IeltsWithHarry Content Factory (AI-assisted)", ai_generated: true,
};
const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
checked(await db.rpc("ielts_upsert_import", {
  p_source: "ai-factory", p_external: "pilot-listening-part-3-v1", p_meta: meta,
  p_content: content, p_hash: hash, p_upstream: "pilot-v1", p_warnings: ["audio_missing"],
}));
const exam = checked(await db.from("ielts_exams").select("id,current_version_id")
  .eq("source_id", "ai-factory").eq("external_id", "pilot-listening-part-3-v1").single());
const job = checked(await db.from("ai_factory_jobs").insert({
  kind: "listening_audio", exam_id: exam.id, exam_version_id: exam.current_version_id,
  payload: { ...pilot.pilotPayload, pilot: true },
}).select("id,status").single());
console.log(JSON.stringify({ examId: exam.id, jobId: job.id, status: job.status }));
