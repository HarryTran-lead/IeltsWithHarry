// Read-only audit of every Reading and Listening paper in the question bank against the strict format rules
// (docs/IELTS_FORMAT_RULES.md). Published papers are checked at their published version, drafts at their
// current version. Writes a JSON report and prints a summary.
//   node --env-file=.env.production.local --experimental-strip-types scripts/audit-format.mts [--out <file.json>]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkFormat, type FormatFinding } from "../src/lib/ielts-bank/format-rules.ts";
import { contentSchema } from "../src/lib/ielts-bank/schema.ts";

const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const ref = new URL(url).hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Unexpected project ref");
  const [command, cliArgs] = process.platform === "win32"
    ? ["cmd.exe", ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]]
    : ["npx", ["supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]];
  key = (JSON.parse(execFileSync(command, cliArgs, { encoding: "utf8" })) as { id: string; api_key: string }[]).find((item) => item.id === "service_role")?.api_key;
}
if (!key) throw new Error("No service role key available");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = { id: string; external_id: string; source_id: string; skill: "Reading" | "Listening"; title: string; status: string; practice_type: string; current_version_id: string; published_version_id: string | null };
const rows: Row[] = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await db.from("ielts_exams").select("id,external_id,source_id,skill,title,status,practice_type,current_version_id,published_version_id").in("skill", ["Reading", "Listening"]).order("external_id").range(from, from + 499);
  if (error) throw new Error(error.message);
  rows.push(...(data as Row[]));
  if (data.length < 500) break;
}

const report = [];
for (const row of rows) {
  const versionId = row.published_version_id ?? row.current_version_id;
  const { data, error } = await db.from("ielts_exam_versions").select("content").eq("id", versionId).single();
  if (error) throw new Error(`${row.external_id}: ${error.message}`);
  const parsed = contentSchema.safeParse(data.content);
  const findings: FormatFinding[] = parsed.success
    ? checkFormat(row.skill, parsed.data, row.practice_type === "full_test" ? "full" : "part")
    : [{ code: "SCHEMA", severity: "error", message: parsed.error.message.slice(0, 200) }];
  report.push({ external_id: row.external_id, source: row.source_id, skill: row.skill, title: row.title, status: row.status, type: row.practice_type, published: Boolean(row.published_version_id), errors: findings.filter((f) => f.severity === "error"), warnings: findings.filter((f) => f.severity === "warning") });
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));

// Summary: per source/skill/status, how many papers pass, and which rules fail most.
const groups = new Map<string, { papers: number; clean: number; codes: Record<string, number> }>();
for (const item of report) {
  const name = `${item.skill} · ${item.source} · ${item.type} · ${item.published ? "published" : item.status}`;
  const group = groups.get(name) ?? { papers: 0, clean: 0, codes: {} };
  group.papers += 1;
  if (!item.errors.length) group.clean += 1;
  for (const finding of [...item.errors, ...item.warnings]) {
    const tag = `${finding.code}${finding.severity === "error" ? "!" : "?"}`;
    group.codes[tag] = (group.codes[tag] ?? 0) + 1;
  }
  groups.set(name, group);
}
for (const [name, group] of [...groups].sort()) {
  console.log(`${name}: ${group.clean}/${group.papers} without errors · ${Object.entries(group.codes).sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code}×${count}`).join(" ")}`);
}
