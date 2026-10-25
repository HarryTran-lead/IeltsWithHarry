// Import the attributed English source pack into Supabase as draft candidates.
// Usage: node --env-file=.env.production.local scripts/import-vocabulary-bank.mjs --apply
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";

const packPath = resolve(process.argv.find((arg) => arg.endsWith(".zip")) ??
  "deliverables/IeltsWithHarry_Vocabulary_Topics_Band_0-7plus.zip");
const apply = process.argv.includes("--apply");
const files = unzipSync(readFileSync(packPath), {
  filter: (file) => file.name === "catalog/vocabulary_all.jsonl",
});
const jsonl = files["catalog/vocabulary_all.jsonl"];
if (!jsonl) throw new Error("ZIP has no catalog/vocabulary_all.jsonl");
const source = strFromU8(jsonl).trim().split("\n").map((line) => JSON.parse(line));
const ids = new Set(source.map((row) => row.source_id));
if (source.length !== 9937 || ids.size !== source.length) {
  throw new Error("Unexpected row count or duplicate source_id in ZIP");
}

console.log(JSON.stringify({
  pack: packPath,
  records: source.length,
  topics: new Set(source.flatMap((row) => row.topics.split("; "))).size,
  mode: apply ? "write drafts and update source fields" : "dry run",
}));
if (!apply) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing Supabase URL");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const projectRef = new URL(url).hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Unexpected Supabase project ref");
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"]
    : ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"];
  const keys = JSON.parse(execFileSync(command, args, { encoding: "utf8" }));
  key = keys.find((item) => item.id === "service_role")?.api_key;
}
if (!key) throw new Error("Missing Supabase service role key");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

for (let start = 0; start < source.length; start += 200) {
  const rows = source.slice(start, start + 200).map((row) => ({
    source_id: row.source_id,
    headword: row.headword,
    pos: row.pos,
    cefr: row.cefr,
    study_lane: row.study_lane,
    topics: row.topics.split(";").map((topic) => topic.trim()).filter(Boolean),
    topic_basis: row.topic_basis,
    source_definition_en: row.definition_en,
    source_example_en: row.example_en,
    source_name: row.source,
    source_url: row.source_url,
    definition_source_url: row.definition_source_url,
    definition_status: row.definition_status,
  }));
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ error } = await db.from("vocabulary_bank_entries").upsert(rows, { onConflict: "source_id" }));
    if (!error) break;
    if (attempt < 2) await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
  }
  if (error) throw new Error("Batch at " + start + ": " + error.message);
  console.log("Imported " + Math.min(start + rows.length, source.length) + "/" + source.length);
}

const { count, error } = await db.from("vocabulary_bank_entries")
  .select("source_id", { count: "exact", head: true });
if (error) throw error;
console.log("Verified total database rows: " + count);
