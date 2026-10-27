// Safely imports the owner-supplied ten-paper pilot ZIP into the private IELTS bank.
// Dry run: node --import tsx scripts/import-original-tests.mts --zip <path>
// Dev: node --env-file=.env.development.local --import tsx scripts/import-original-tests.mts --zip <path> --target-ref <dev-ref> --apply
// Production drafts additionally require --allow-production-drafts. This script never publishes exams.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";
import { contentHash, publicContent, scoreAnswers } from "../src/lib/ielts-bank/schema";
import { normalizeOriginalPilot } from "../src/lib/ielts-bank/original-pilot";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const zipPath = value("--zip");
const targetRef = value("--target-ref");
const apply = args.includes("--apply");
if (!zipPath) throw new Error("Pass --zip <owner-supplied ZIP path>");
if (apply && !targetRef) throw new Error("--apply requires --target-ref");
if (targetRef && !/^[a-z]{20}$/.test(targetRef)) throw new Error("Unexpected Supabase project ref");
if (apply && targetRef === "vpkhriywprepuhrbarye" && !args.includes("--allow-production-drafts")) {
  throw new Error("Production drafts require --allow-production-drafts");
}
if (apply && !["bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"].includes(targetRef!)) {
  throw new Error("Target is not the known IeltsWithHarry dev or production project");
}

const zipBytes = readFileSync(zipPath);
if (zipBytes.length > 5_000_000) throw new Error("Unexpectedly large ZIP");
const zipHash = createHash("sha256").update(zipBytes).digest("hex");
const files = unzipSync(zipBytes, { filter: (entry) => /^english-skill-lab-pilot\/content\/ESL-[LR]-0[1-5]\.json$/.test(entry.name) });
const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
if (entries.length !== 10) throw new Error(`Expected 10 test JSON files, got ${entries.length}`);
const normalized = entries.map(([path, bytes]) => {
  if (bytes.length > 200_000) throw new Error(`${path}: test JSON exceeds 200 KB`);
  const result = normalizeOriginalPilot(JSON.parse(strFromU8(bytes)));
  const questions = result.exam.content.sections.flatMap((section) => section.questions);
  const correct = Object.fromEntries(questions.map((question) => [question.id, question.answers[0]]));
  const score = scoreAnswers(result.exam.content, correct);
  if (score.score !== 40 || score.total !== 40) throw new Error(`${path}: answer keys do not grade 40/40`);
  const learner = publicContent(result.exam.content);
  if (learner.sections.some((section) => section.transcript || section.questions.some((question) => question.answers.length || question.explanation))) {
    throw new Error(`${path}: learner payload leaks private answers or transcript`);
  }
  return result;
});
if (new Set(normalized.map(({ exam }) => exam.externalId)).size !== 10) throw new Error("Duplicate paper IDs");
const counts = normalized.reduce((totals, { exam }) => {
  totals[exam.skill]++;
  totals.questions += exam.content.sections.reduce((sum, section) => sum + section.questions.length, 0);
  return totals;
}, { Reading: 0, Listening: 0, questions: 0 });
if (counts.Reading !== 5 || counts.Listening !== 5 || counts.questions !== 400) throw new Error("Unexpected paper totals");
console.log(JSON.stringify({ zipSha256: zipHash, ...counts, audioFiles: 0, status: apply ? "importing_drafts" : "dry_run", warnings: [...new Set(normalized.flatMap((item) => item.warnings))] }));
if (!apply) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key.startsWith("[")) throw new Error("Missing Supabase URL or service role key in local environment");
if (new URL(url).hostname !== `${targetRef}.supabase.co`) throw new Error("Environment URL does not match --target-ref");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: source, error: sourceError } = await client.from("ielts_sources").select("id").eq("id", "manual").single();
if (sourceError || !source) throw new Error("Manual IELTS source not installed on target database");
for (const { exam, warnings } of normalized) {
  const { data, error } = await client.rpc("ielts_upsert_import", {
    p_source: "manual", p_external: exam.externalId,
    p_meta: {
      skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title,
      topic: exam.topic, difficulty: exam.difficulty, duration_minutes: exam.durationMinutes,
      source_url: exam.sourceUrl, attribution: exam.attribution,
      license: exam.license, license_url: exam.licenseUrl, ai_generated: false,
    },
    p_content: exam.content, p_hash: contentHash(exam.content),
    p_upstream: `v0.1:${zipHash.slice(0, 16)}`, p_warnings: warnings,
  });
  if (error) throw new Error(`${exam.externalId}: ${error.message}`);
  console.log(`${exam.externalId}: ${data}`);
}
const { data: rows, error: verifyError } = await client.from("ielts_exams")
  .select("external_id,status,published_version_id,ielts_exam_versions!ielts_current_version_fk(warnings)")
  .eq("source_id", "manual").like("external_id", "ESL-PILOT-2026-%");
if (verifyError || rows?.length !== 10 || rows.some((row) => row.status !== "needs_review" || row.published_version_id)) {
  throw new Error(`Post-import verification failed: ${verifyError?.message ?? rows?.length}`);
}
console.log(`Verified ${rows.length} private drafts on ${targetRef}; no test was published.`);
