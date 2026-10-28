// Applies the safe, content-preserving fixes for the strict format rules (docs/IELTS_FORMAT_RULES.md) to every
// published Reading and Listening paper, then re-checks it. A paper is saved as a new published revision only when
// the fixes changed it; whatever still breaks a rule is reported for a person to rewrite or unpublish.
// Fixes: printed rubrics, word limits (from the prompt or the answer key), gaps in completion prompts, short-answer
// typing for direct questions, and paragraph letters for headings / which-paragraph questions.
//   node --env-file=.env.production.local --experimental-strip-types scripts/fix-format.mts [--apply] [--out report.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkFormat, kindOf, wordLimit } from "../src/lib/ielts-bank/format-rules.ts";
import { contentHash, contentSchema, validateExam, type ExamContent, type ExamQuestion } from "../src/lib/ielts-bank/schema.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
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
const ok = <T,>(result: { data: T; error: { message: string } | null }, context: string) => {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
};

const NUMBER_WORDS = ["", "ONE", "TWO", "THREE"];
const BLANK = "__________";
const letters = (options: string[]) => options.map((option) => /^\s*—?\s*([A-Z]|[ivxlc]{1,6})\b/.exec(option)?.[1] ?? "").filter(Boolean);
const letterRange = (options: string[]) => { const keys = letters(options); return keys.length ? `${keys[0]}–${keys.at(-1)}` : ""; };
const letterList = (options: string[]) => { const keys = letters(options); return keys.length <= 4 ? `${keys.slice(0, -1).join(", ")} or ${keys.at(-1)}` : letterRange(options); };

/** The limit a group of completion answers needs, phrased as on the paper; null if an answer is over three words. */
function limitFor(answers: string[]) {
  let most = 0, number = false;
  for (const answer of answers) {
    const tokens = answer.trim().split(/\s+/).filter(Boolean);
    const digits = tokens.filter((token) => /\d/.test(token)).length;
    if (digits) number = true;
    most = Math.max(most, tokens.length - Math.min(digits, 1));
  }
  if (most > 3) return null;
  if (most <= 1) return number ? "ONE WORD AND/OR A NUMBER" : "ONE WORD ONLY";
  return `NO MORE THAN ${NUMBER_WORDS[most]} WORDS${number ? " AND/OR A NUMBER" : ""}`;
}

function fixContent(skill: "Reading" | "Listening", source: ExamContent) {
  const content = structuredClone(source);
  const changes: string[] = [];
  const from = skill === "Reading" ? " from the passage" : "";
  for (const section of content.sections) {
    // 1. Direct questions stored as gap-fill become short-answer; prompt prefixes move into the rubric.
    for (const q of section.questions) {
      const kind = kindOf(q.type);
      const inPrompt = /^(Answer in|Write|Use) (NO MORE THAN [A-Z]+ WORDS?(?: AND\/OR A NUMBER)?|ONE WORD(?: AND\/OR A NUMBER| ONLY)?)[^:]*:\s*/i.exec(q.prompt);
      if (kind === "completion" && inPrompt) {
        q.wordLimit = inPrompt[2].toUpperCase();
        q.prompt = q.prompt.slice(inPrompt[0].length);
        changes.push(`Q${q.number} limit moved out of the prompt`);
      }
      if (/^Choose the correct (answer|letter)[^:]*:\s*/i.test(q.prompt)) { q.prompt = q.prompt.replace(/^Choose the correct (answer|letter)[^:]*:\s*/i, ""); changes.push(`Q${q.number} rubric moved out of the prompt`); }
      if (kind === "completion" && !/_{3,}|\{\{gap\}\}|…|\.{4,}/.test(q.prompt) && !/short[_-]answer/.test(q.type)) {
        if (/\?\s*$/.test(q.prompt)) { q.type = "short_answer"; changes.push(`Q${q.number} typed as short answer`); }
        else if (!/[.!]\s*$/.test(q.prompt)) { q.prompt = `${q.prompt.replace(/[:\s]+$/, "")} ${BLANK}`; changes.push(`Q${q.number} gap added`); }
      }
    }
    // 2. Completion groups without a word limit get the limit their answer key needs.
    const runs: ExamQuestion[][] = [];
    for (const q of section.questions) {
      const last = runs.at(-1);
      if (last && last[0].type === q.type && last[0].instructions === q.instructions) last.push(q); else runs.push([q]);
    }
    for (const run of runs) {
      const kind = kindOf(run[0].type);
      if (kind === "completion" && !run[0].options.length) {
        const known = run.find((q) => wordLimit(q))?.wordLimit ?? run.map((q) => wordLimit(q) && q.wordLimit).find(Boolean);
        const label = known ?? (run.every((q) => !wordLimit(q)) ? limitFor(run.map((q) => q.answers[0] ?? "")) : null);
        if (label && run.some((q) => !wordLimit(q) || q.wordLimit !== label)) {
          for (const q of run) q.wordLimit = q.wordLimit ?? label;
          changes.push(`Q${run[0].number}-${run.at(-1)!.number} limit ${label}`);
        }
      }
      // 3. Printed rubric for questions that have none, or a completion rubric that never states the limit.
      const first = run[0];
      const limit = first.wordLimit ? `Write ${first.wordLimit}${from} for each answer.` : "";
      let rubric = "";
      if (kind === "completion") {
        const lead = /short[_-]answer/.test(first.type) ? "Answer the questions below." : /table/.test(first.type) ? "Complete the table below." : /note/.test(first.type) ? "Complete the notes below." : /summary/.test(first.type) ? "Complete the summary below." : /form/.test(first.type) ? "Complete the form below." : /flow/.test(first.type) ? "Complete the flow-chart below." : "Complete the sentences below.";
        if (!first.instructions.trim()) rubric = `${lead} ${limit}`.trim();
        else if (limit && !/(ONE|TWO|THREE) WORDS?/i.test(first.instructions)) rubric = `${first.instructions.trim()} ${limit}`;
      } else if (!first.instructions.trim()) {
        rubric = kind === "mcq" ? `Choose the correct letter, ${letterList(first.options)}.`
          : kind === "tfng" ? "Do the following statements agree with the information given in the reading passage? Write TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this."
          : kind === "ynng" ? "Do the following statements agree with the claims of the writer? Write YES if the statement agrees with the claims of the writer, NO if the statement contradicts the claims of the writer, or NOT GIVEN if it is impossible to say what the writer thinks about this."
          : kind === "headings" ? "Choose the correct heading for each paragraph from the list of headings below."
          : kind === "labelling" ? `Label the plan below. Write the correct letter, ${letterRange(first.options)}, next to each question.`
          : kind === "many" ? `Choose ${run.length === 3 ? "THREE" : "TWO"} letters, ${letterRange(first.options)}.`
          : first.options.length ? `Choose the correct letter, ${letterRange(first.options)}.` : "";
      }
      if (rubric) { for (const q of run) q.instructions = rubric; changes.push(`Q${first.number}-${run.at(-1)!.number} rubric`); }
    }
    // 4. Paragraph letters for headings / which-paragraph questions when the passage has none.
    const needsLetters = section.questions.some((q) => ["headings", "match-info"].includes(kindOf(q.type)));
    const lettered = /(^|\n)\s*(\*\*)?(\[[A-H]\]|\([A-H]\)|[A-H][\s.)]|Paragraph [A-H])/.test(section.passage);
    if (needsLetters && !lettered) {
      const paragraphs = section.passage.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      const body = paragraphs.filter((p) => p.split(/\s+/).length > 20);
      const referenced = new Set([...section.questions.flatMap((q) => [q.prompt, ...q.answers, ...q.options])].join(" ").match(/\bParagraph ([A-H])\b/g)?.map((m) => m.slice(-1)) ?? []);
      const highest = Math.max(0, ...[...referenced].map((letter) => letter.charCodeAt(0) - 64), ...section.questions.filter((q) => kindOf(q.type) === "match-info").flatMap((q) => q.options.length ? [letters(q.options).length] : q.answers.map((a) => a.trim().charCodeAt(0) - 64)));
      if (body.length >= highest && body.length <= 10 && highest >= 2) {
        let index = 0;
        section.passage = paragraphs.map((p) => p.split(/\s+/).length > 20 ? `(${String.fromCharCode(65 + index++)}) ${p}` : p).join("\n\n");
        changes.push(`passage paragraphs lettered A–${String.fromCharCode(64 + body.length)}`);
      }
    }
  }
  return { content: contentSchema.parse(content), changes };
}

type Row = { id: string; external_id: string; source_id: string; skill: "Reading" | "Listening"; title: string; format: string; mode: string; topic: string | null; difficulty: string | null; duration_minutes: number; source_url: string; license: string; license_url: string; attribution: string; ai_generated: boolean; practice_type: string; current_version_id: string; published_version_id: string };
const rows = ok(await db.from("ielts_exams").select("id,external_id,source_id,skill,title,format,mode,topic,difficulty,duration_minutes,source_url,license,license_url,attribution,ai_generated,practice_type,current_version_id,published_version_id").in("skill", ["Reading", "Listening"]).not("published_version_id", "is", null).order("external_id"), "papers") as Row[];
const actor = (ok(await db.from("admin_users").select("user_id").order("granted_at").limit(1), "admin user") as { user_id: string }[])[0]?.user_id;
if (!actor) throw new Error("No admin user to record as reviewer");

const report = [];
for (const row of rows) {
  const version = ok(await db.from("ielts_exam_versions").select("id,revision,upstream_version,content").eq("id", row.published_version_id).single(), `${row.external_id} version`) as { id: string; revision: number; upstream_version: string; content: unknown };
  const before = contentSchema.parse(version.content);
  const scope = row.practice_type === "full_test" ? "full" : "part";
  const errorsBefore = checkFormat(row.skill, before, scope).filter((f) => f.severity === "error").length;
  const { content, changes } = fixContent(row.skill, before);
  const left = checkFormat(row.skill, content, scope).filter((f) => f.severity === "error");
  // --show <paper> prints a few fixed questions (and the passage opening) for a by-eye check.
  if (args.includes("--show") && args[args.indexOf("--show") + 1] === row.external_id) {
    console.log(`=== ${row.external_id}\n${changes.join("\n")}\n--- passage: ${content.sections[0].passage.slice(0, 160)}`);
    for (const q of content.sections.flatMap((s) => s.questions).filter((_, i) => i % 4 === 0)) console.log(JSON.stringify({ n: q.number, type: q.type, prompt: q.prompt.slice(0, 110), rubric: q.instructions.slice(0, 120), limit: q.wordLimit, answers: q.answers }));
  }
  const pending = row.current_version_id !== row.published_version_id;
  const save = changes.length > 0 && left.length < errorsBefore && !pending;
  report.push({ paper: row.external_id, source: row.source_id, skill: row.skill, title: row.title, errorsBefore, errorsAfter: left.length, changes: changes.length, save, pendingDraft: pending, remaining: left.map((f) => `${f.code}${f.question ? ` Q${f.question}` : ""}: ${f.message}`) });
  if (!apply || !save) continue;
  const warnings = validateExam({ externalId: row.external_id, skill: row.skill, format: row.format, mode: row.mode, title: row.title, topic: row.topic ?? undefined, difficulty: row.difficulty ?? undefined, durationMinutes: row.duration_minutes, sourceUrl: row.source_url, attribution: row.attribution, license: row.license, licenseUrl: row.license_url, aiGenerated: row.ai_generated, upstreamVersion: version.upstream_version, content });
  const note = `Format fixes (docs/IELTS_FORMAT_RULES.md): ${changes.slice(0, 12).join("; ")}${changes.length > 12 ? "; …" : ""}`.slice(0, 900);
  const created = ok(await db.from("ielts_exam_versions").insert({ exam_id: row.id, revision: version.revision + 1, upstream_version: version.upstream_version, content_hash: contentHash(content), content, warnings }).select("id").single(), `${row.external_id} revision`) as { id: string };
  ok(await db.from("ielts_exams").update({ current_version_id: created.id, status: "ready", updated_at: new Date().toISOString() }).eq("id", row.id).eq("current_version_id", version.id).select("id").single(), `${row.external_id} ready`);
  ok(await db.from("ielts_review_log").insert([{ exam_id: row.id, version_id: created.id, actor_id: actor, action: "edit", note }, { exam_id: row.id, version_id: created.id, actor_id: actor, action: "ready", note }]), `${row.external_id} review log`);
  ok(await db.from("ielts_exams").update({ status: "published", published_version_id: created.id, updated_at: new Date().toISOString() }).eq("id", row.id).select("id").single(), `${row.external_id} publish`);
  ok(await db.from("ielts_review_log").insert({ exam_id: row.id, version_id: created.id, actor_id: actor, action: "publish", note }), `${row.external_id} publish log`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
const saved = report.filter((item) => item.save);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry run", published: report.length, toSave: saved.length, errorsBefore: report.reduce((n, i) => n + i.errorsBefore, 0), errorsAfter: report.reduce((n, i) => n + i.errorsAfter, 0), stillFailing: report.filter((i) => i.errorsAfter).length, cleanAfter: report.filter((i) => !i.errorsAfter).length }));
for (const item of report.filter((i) => i.errorsAfter)) console.log(`${item.paper.slice(0, 36)} (${item.source}, ${item.skill}): ${item.errorsBefore} → ${item.errorsAfter} errors · ${[...new Set(item.remaining.map((r) => r.split(/[ :]/)[0]))].join(", ")}`);
