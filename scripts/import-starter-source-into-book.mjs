// Populate the existing IELTS Starter book rows from the independent U01–U08 source.
// Dry run: node scripts/import-starter-source-into-book.mjs
// Apply: node --env-file=.env.production.local scripts/import-starter-source-into-book.mjs --apply
// The --apply command must run from a checkout with the ignored production env file.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(resolve(root, "content/ielts-starter-4-5-supplement/catalog.json"), "utf8"));
const overview = JSON.parse(readFileSync(resolve(root, "src/data/ielts-starter-supplement.json"), "utf8"));
const courseSlug = "mindsetstarter-topic-practice-4-5";
const skillNames = { R: "Reading", W: "Writing", L: "Listening", S: "Speaking" };
const apply = process.argv.includes("--apply");

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function itemOf(group, item, index) {
  return {
    id: item.id ?? `${group.id}-${String(index + 1).padStart(2, "0")}`,
    type: item.open || item.answer_type === "open" ? "short_answer" : item.options?.includes(item.answer) ? "multiple_choice" : "short_answer",
    prompt: required(item.question_en ?? item.question, `${group.id} question`),
    prompt_vi: item.question_vi || undefined,
    answer: String(required(item.answer, `${group.id} answer`)),
    options: item.options?.includes(item.answer) ? item.options : undefined,
    explanation: item.explanation_en ?? "",
    explanation_vi: item.explanation_vi ?? "",
    instruction: `${group.title} · ${group.instruction_vi ?? ""}`.trim(),
    location: group.passage_id ?? group.passage ?? group.track ?? group.audio_clip ?? undefined,
  };
}

function allItems(groups) { return groups.flatMap((group) => group.items.map((item, index) => itemOf(group, item, index))); }

function ref(group, kind) {
  const value = kind === "passage" ? group.passage_id ?? group.passage : group.track ?? group.audio_clip;
  if (!value) return "";
  return String(value).split(/[,/+]/)[0].trim().replace(/^(R-|L-)/, "").replace(/\.(mp3|wav)$/i, "").split("_").at(-1).toUpperCase();
}

function passagesOf(source, groups) {
  const entries = Object.entries(source.passages ?? {});
  return entries.map(([id, passage], index) => {
    const key = id.replace(/^R-/, "").toUpperCase();
    const attached = groups.filter((group) => ref(group, "passage") === key || (!ref(group, "passage") && index === 0));
    return {
      id,
      title: passage.title ?? `Bài đọc ${index + 1}`,
      text: passage.text ?? passage.paragraphs?.map((paragraph) => `[${paragraph.id}] ${paragraph.text}`).join("\n\n") ?? "",
      questions: allItems(attached),
    };
  });
}

function tracksOf(source, groups, unitOverview) {
  const entries = Object.entries(source.tracks ?? source.listening ?? {});
  return entries.map(([id, track], index) => {
    const key = id.replace(/^L-/, "").toUpperCase();
    const attached = groups.filter((group) => ref(group, "track") === key || (!ref(group, "track") && index === 0));
    const file = unitOverview.tracks.find((entry) => entry.title === track.title);
    if (!file || !existsSync(resolve(root, "public", file.url.slice(1)))) throw new Error(`Missing audio for ${unitOverview.id} ${id}`);
    return {
      id,
      title: track.title ?? `Bài nghe ${index + 1}`,
      script: track.transcript ?? track.script ?? track.dialogue?.map(([speaker, line]) => `${speaker}: ${line}`).join("\n") ?? "",
      audio_url: file.url,
      questions: allItems(attached),
    };
  });
}

function vocabOf(source, groups) {
  const explicit = (source.vocabulary ?? []).map((row) => Array.isArray(row) ? { en: row[0], vi: row[1] } : row);
  if (explicit.length) return explicit;
  const vocabularyGroups = groups.filter((group) => /vocab|collocation|word|noun|adjective|verb|phrase/i.test(`${group.title} ${group.source_focus ?? ""}`));
  const words = allItems(vocabularyGroups).filter((item) => item.answer.split(/\s+/).length <= 3 && item.answer.length <= 40)
    .map((item) => ({ en: item.answer, vi: item.explanation_vi || item.prompt_vi || item.explanation }));
  return words.filter((word, index) => words.findIndex((other) => other.en.toLowerCase() === word.en.toLowerCase()) === index).slice(0, 24);
}

function contentOf(source, overviewUnit, skill) {
  const groups = source.activities.filter((group) => group.skill === skill);
  const items = allItems(groups);
  const base = {
    type: skillNames[skill].toLowerCase(),
    title: `${source.title} · ${skillNames[skill]}`,
    aim: `${groups.length} nhóm bài tập · ${items.length} câu từ English Skill Lab U${String(overviewUnit.order).padStart(2, "0")}.`,
    instruction_vi: groups[0]?.instruction_vi ?? overviewUnit.summaryVi,
    activities: items,
    source_groups: groups.map((group) => ({ id: group.id, title: group.title, instruction_en: group.instruction_en, instruction_vi: group.instruction_vi, item_ids: group.items.map((item, index) => item.id ?? `${group.id}-${String(index + 1).padStart(2, "0")}`) })),
    source_pdf_url: `/starter-supplement/${overviewUnit.id}/student.pdf`,
    source_course_id: catalog.course_id,
    assessment_slug: `mindsetstarter-m${String(overviewUnit.order).padStart(2, "0")}-check`,
  };
  if (skill === "R") {
    const passages = passagesOf(source, groups);
    return { ...base, passages, passage_title: passages[0]?.title, passage: passages[0]?.text, reading_strategy: groups[0]?.instruction_vi };
  }
  if (skill === "L") {
    const audios = tracksOf(source, groups, overviewUnit);
    return { ...base, audios, audio_url: audios[0]?.audio_url, transcript: audios[0]?.script, listening_strategy: groups[0]?.instruction_vi };
  }
  if (skill === "W") {
    const model = source.writing_models?.[0] ?? (source.model_writing_task1 ? { text: source.model_writing_task1 } : null);
    const task = model?.question ?? groups.find((group) => /write|describe|task/i.test(group.instruction_en ?? ""))?.instruction_en ?? groups[0]?.instruction_en ?? "";
    return { ...base, task, sample_answer: model?.text ?? source.writing_task1_model_en ?? "", micro_exercises: items,
      scaffolding_steps: groups.slice(0, 6).map((group) => group.instruction_vi ?? group.instruction_en).filter(Boolean) };
  }
  const model = source.speaking_models?.[0];
  const questions = groups.filter((group) => /part\s*[123]|cue|question|answer/i.test(group.title)).flatMap((group) => group.items.slice(0, 2).map((item) => item.question_en ?? item.question));
  return { ...base, questions: questions.length ? questions : items.slice(0, 6).map((item) => item.prompt),
    model_answer: model?.text ?? "", pronunciation_focus: groups.find((group) => /pronunciation/i.test(group.title))?.instruction_vi };
}

function supportingContent(source, overviewUnit, kind) {
  const groups = source.activities.filter((group) => kind === "vocabulary"
    ? /vocab|collocation|word|noun|adjective|verb|phrase/i.test(`${group.title} ${group.source_focus ?? ""}`)
    : /grammar|tense|article|passive|sentence|link|preposition|compar|conditional/i.test(`${group.title} ${group.source_focus ?? ""}`));
  const chosen = groups.length ? groups : source.activities.slice(0, 2);
  const items = allItems(chosen);
  const common = { type: kind, title: `${source.title} · ${kind === "vocabulary" ? "Vocabulary" : "Grammar"}`,
    aim: `${chosen.length} nhóm ôn tập · ${items.length} câu lấy từ học liệu U${String(overviewUnit.order).padStart(2, "0")}.`,
    instruction_vi: chosen[0]?.instruction_vi ?? overviewUnit.summaryVi, activities: items,
    source_course_id: catalog.course_id, source_pdf_url: `/starter-supplement/${overviewUnit.id}/student.pdf`,
    assessment_slug: `mindsetstarter-m${String(overviewUnit.order).padStart(2, "0")}-check` };
  if (kind === "vocabulary") return { ...common, vocabulary: vocabOf(source, chosen) };
  return { ...common, grammar_title: chosen[0]?.title ?? "Cấu trúc trong unit",
    grammar_form: chosen[0]?.instruction_en ?? "", grammar_explanation_vi: chosen[0]?.instruction_vi ?? "",
    examples: items.slice(0, 3).map((item) => item.prompt) };
}

const units = overview.units.map((unit) => {
  const source = JSON.parse(readFileSync(resolve(root, `content/ielts-starter-4-5-supplement/units/${unit.id}/unit.json`), "utf8"));
  const lessons = { vocabulary: supportingContent(source, unit, "vocabulary"), grammar: supportingContent(source, unit, "grammar"),
    reading: contentOf(source, unit, "R"), listening: contentOf(source, unit, "L"),
    writing: contentOf(source, unit, "W"), speaking: contentOf(source, unit, "S") };
  const sourceIds = source.activities.flatMap((group) => group.items.map((item, index) => item.id ?? `${group.id}-${String(index + 1).padStart(2, "0")}`));
  const importedIds = ["reading", "listening", "writing", "speaking"].flatMap((skill) => lessons[skill].activities.map((item) => item.id));
  if (sourceIds.length !== unit.itemCount || new Set(importedIds).size !== sourceIds.length || sourceIds.some((id) => !importedIds.includes(id)))
    throw new Error(`${unit.id}: source items do not match the four skill lessons`);
  for (const skill of ["reading", "listening"]) {
    const displayed = (skill === "reading" ? lessons.reading.passages : lessons.listening.audios).flatMap((entry) => entry.questions.map((item) => item.id));
    if (displayed.length !== lessons[skill].activities.length || displayed.some((id) => !lessons[skill].activities.some((item) => item.id === id)))
      throw new Error(`${unit.id}: ${skill} items are not all visible in the existing workbook`);
  }
  return { unit, lessons, groups: source.activities.length, items: sourceIds.length };
});

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", units: units.length,
  groups: units.reduce((sum, item) => sum + item.groups, 0), items: units.reduce((sum, item) => sum + item.items, 0),
  lessons: units.length * 6, audio: units.reduce((sum, item) => sum + item.lessons.listening.audios.length, 0) }));
if (!apply) process.exit(0);

const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
if (new URL(url).hostname.split(".")[0] !== "vpkhriywprepuhrbarye") throw new Error("Refusing to import outside the expected production project");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args = process.platform === "win32" ? ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", "vpkhriywprepuhrbarye", "--output", "json"]
    : ["supabase", "projects", "api-keys", "--project-ref", "vpkhriywprepuhrbarye", "--output", "json"];
  key = JSON.parse(execFileSync(command, args, { encoding: "utf8" })).find((item) => item.id === "service_role")?.api_key;
}
const db = createClient(url, required(key, "service role key"), { auth: { persistSession: false, autoRefreshToken: false } });
function data(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
const course = data(await db.from("courses").select("id,slug,published").eq("slug", courseSlug).single(), "course");
if (!course.published) throw new Error("Existing Starter course is not published");
const dbUnits = data(await db.from("units").select("id,slug,sort_order,published").eq("course_id", course.id), "units");
if (dbUnits.length !== 8 || dbUnits.some((unit) => !unit.published)) throw new Error("Existing book must have eight published units");
const dbLessons = data(await db.from("lessons").select("id,slug,skill,unit_id,published").in("unit_id", dbUnits.map((unit) => unit.id)), "lessons");
if (dbLessons.length !== 48 || dbLessons.some((lesson) => !lesson.published)) throw new Error("Existing book must have 48 published lessons");
const before = data(await db.from("package_lesson_content").select("lesson_id,content").in("lesson_id", dbLessons.map((lesson) => lesson.id)), "current content");
if (before.length !== 48) throw new Error("Existing book must have content for all 48 lessons");
const backupPath = join(tmpdir(), `ielts-starter-book-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupPath, JSON.stringify({ course, units: dbUnits, lessons: dbLessons, content: before }));
console.log(`Backup: ${backupPath}`);
for (const { unit, lessons } of units) {
  const dbUnit = required(dbUnits.find((row) => row.sort_order === unit.order), `${unit.id} database unit`);
  for (const [skill, content] of Object.entries(lessons)) {
    const lesson = required(dbLessons.find((row) => row.unit_id === dbUnit.id && row.skill.toLowerCase() === skill), `${unit.id} ${skill} lesson`);
    data(await db.from("package_lesson_content").upsert({ lesson_id: lesson.id, content }, { onConflict: "lesson_id" }), `content ${lesson.slug}`);
    data(await db.from("lessons").update({ summary: content.aim }).eq("id", lesson.id), `summary ${lesson.slug}`);
  }
  console.log(`${unit.id}: six existing lessons populated`);
}
const after = data(await db.from("package_lesson_content").select("lesson_id,content").in("lesson_id", dbLessons.map((lesson) => lesson.id)), "verify content");
if (after.length !== 48 || after.some((row) => row.content?.source_course_id !== catalog.course_id))
  throw new Error("Production verification failed: some lessons still contain the old package");
console.log("Published source data in the existing book; course, unit, and lesson IDs unchanged.");
