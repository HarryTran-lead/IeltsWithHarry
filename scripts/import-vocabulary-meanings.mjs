import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const ref = "vpkhriywprepuhrbarye";
const raw = execFileSync("cmd.exe", ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"], { encoding: "utf8" });
const keys = JSON.parse(raw);
const serviceKey = keys.find((item) => item.name === "service_role" || item.type === "service_role")?.api_key;
if (!serviceKey) throw new Error("Supabase service key unavailable from the logged-in CLI");
const db = createClient(`https://${ref}.supabase.co`, serviceKey, { auth: { persistSession: false } });
const rows = readFileSync(new URL("../data/vocabulary-meanings.jsonl", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line));
let completed = 0;
for (let start = 0; start < rows.length; start += 100) {
  const batch = rows.slice(start, start + 100).map((row) => ({
    source_id: row.source_id,
    auto_meaning_vi: row.meaning_vi_suggested,
    auto_meaning_options: row.meaning_vi_options,
    auto_meaning_status: row.meaning_status,
    auto_meaning_source: row.meaning_source,
    auto_meaning_source_url: row.meaning_source_url,
    auto_meaning_gloss_en: row.meaning_gloss_en,
    source_ipa: row.ipa,
  }));
  const { data: changed, error } = await db.rpc("import_vocabulary_dictionary_suggestions", { p_entries: batch });
  if (error) throw new Error(`Batch ${start}: ${error.message}`);
  if (changed !== batch.length) throw new Error(`Batch ${start}: updated ${changed}/${batch.length} rows`);
  completed += batch.length;
  if (completed % 1000 === 0 || completed === rows.length) process.stdout.write(`Imported ${completed}/${rows.length}\n`);
}
for (const [label, field] of [["with Vietnamese", "auto_meaning_vi"], ["missing", "auto_meaning_status"]]) {
  const query = db.from("vocabulary_bank_entries").select("source_id", { count: "exact", head: true });
  const result = label === "missing" ? await query.eq(field, "missing") : await query.neq(field, "");
  if (result.error) throw result.error;
  process.stdout.write(`${label}: ${result.count}\n`);
}
