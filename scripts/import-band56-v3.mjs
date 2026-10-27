// Replaces the visible Band 5–6 V2 path with the supplied V3 roadmap and Unit 1 pilot.
// Dry run: node scripts/import-band56-v3.mjs
// Apply: BAND56_V3_APPLY=confirmed + Supabase URL/service key, then --apply.
// Historical V2 rows remain unpublished so learner progress keeps its original slug.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve("src/content/course-packages/band-5-6-v3");
const curriculum = JSON.parse(readFileSync(resolve(root, "curriculum_v3.json"), "utf8"));
const pilot = JSON.parse(readFileSync(resolve(root, "unit01_pilot.json"), "utf8"));
const courseSlug = "mindsetbuilder-topic-practice-5-6";
const prefix = "mindsetbuilder-v3";
const skills = ["Vocabulary", "Reading", "Writing", "Listening", "Speaking", "Grammar"];
const figure = { url: "", alt: "" };

export function validate() {
  if (curriculum.schema_version !== "3.0.0" || curriculum.course_id !== "ESL-IELTS-BUILDER-5-6-V3" || curriculum.band_stage !== "5.0-6.0") throw new Error("Unexpected Band 5–6 V3 package");
  if (curriculum.units?.length !== 8 || pilot.unit_id !== "L2U01") throw new Error("Expected 8 units and the Unit 1 pilot");
  const ids = new Set();
  for (const [index, unit] of curriculum.units.entries()) {
    if (unit.id !== `L2U${String(index + 1).padStart(2, "0")}` || unit.lesson_plan?.length !== 6) throw new Error(`Invalid V3 unit ${unit.id}`);
    for (const [lessonIndex, lesson] of unit.lesson_plan.entries()) {
      if (lesson.id !== `${unit.id}-L${String(lessonIndex + 1).padStart(2, "0")}` || ids.has(lesson.id)) throw new Error(`Invalid V3 lesson ${lesson.id}`);
      ids.add(lesson.id);
    }
  }
  for (const [name, count] of [["vocabulary", 20], ["grammar", 8]]) if (pilot[name]?.length !== count) throw new Error(`Incomplete ${name} pilot`);
  if (pilot.read?.questions?.length !== 12 || pilot.listening?.questions?.length !== 10 || !pilot.writing?.task1 || !pilot.speaking?.part2) throw new Error("Incomplete Unit 1 pilot");
  const paragraphText = pilot.read.passage.map((paragraph) => paragraph[1]).join(" ");
  for (const question of pilot.read.questions) {
    if (!question.id || !question.prompt || !question.answer || ids.has(question.id)) throw new Error(`Invalid Reading question ${question.id}`);
    if (question.type === "short_answer" && !paragraphText.toLowerCase().includes(String(question.answer).toLowerCase())) throw new Error(`Reading answer missing from passage: ${question.id}`);
    ids.add(question.id);
  }
  for (const question of pilot.listening.questions) if (!question.id || !question.prompt || !question.answer) throw new Error("Invalid Listening key");
  return { units: 8, blueprints: 48, publishedPilotLessons: 6, reading: 12, listening: 10, vocabulary: 20, grammar: 8 };
}

export function unitSlug(unit) { return `${prefix}-${unit.id.toLowerCase()}`; }
export function lessonSlug(lesson) { return `${prefix}-${lesson.id.toLowerCase()}`; }
export function pilotContent(skill, unit, plan) {
  const base = { type: skill.toLowerCase(), title: plan.name, instruction_vi: plan.content, aim: unit.objective,
    output: plan.deliverable, stage_warning: "Bài luyện gốc Band 5.0–6.0 V3; không phải đề IELTS chính thức. Các Unit 2–8 đang được biên soạn.",
    curriculum_version: 3, source_lesson_id: plan.id, course_slug: courseSlug, v3_pilot: true };
  if (skill === "Vocabulary") return { ...base, vocabulary: pilot.vocabulary, grammar_focus: unit.grammar };
  if (skill === "Reading") return { ...base, reading: pilot.read, reading_strategy: unit.read };
  if (skill === "Writing") return { ...base, writing: pilot.writing, data_visual: { headers: ["Mode", ...pilot.writing.task1.data.years], rows: pilot.writing.task1.data.rows } };
  if (skill === "Listening") return { ...base, listening: pilot.listening, audio_quality_note: "Bản pilot chỉ có lời thoại, chưa có audio được kiểm duyệt. Đây là bài phân tích transcript, chưa phải bài kiểm tra nghe." };
  if (skill === "Speaking") return { ...base, speaking: pilot.speaking };
  return { ...base, grammar: pilot.grammar, review_focus: unit.objective };
}
export function pilotMaterial(skill, content) {
  if (skill === "Vocabulary") return { skill, introduction: content.instruction_vi, figure };
  if (skill === "Reading") return { skill, passage: content.reading.passage.map(([label, text]) => `${label}. ${text}`).join("\n\n"), figure };
  if (skill === "Writing") return { skill, prompt: content.writing.task1.task, minWords: 150, modelAnswer: content.writing.task1.sample_answer, checklist: content.writing.task1.warnings, figure };
  if (skill === "Listening") return { skill, transcript: content.listening.transcript, audioUrl: "", figure };
  if (skill === "Speaking") return { skill, prompt: content.speaking.part2, preparationSeconds: 60, modelAnswer: "Tự ghi âm câu trả lời và nghe lại để điều chỉnh ý, ngữ pháp và phát âm.", checklist: ["Trả lời đủ các ý của cue card", "Nói rõ ràng và liên kết ý"], figure };
  return { skill, rule: content.grammar_focus ?? "Present simple và present continuous trong ngữ cảnh đô thị.", example: content.grammar[0].prompt, figure };
}

function check(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
async function allRows(db, table, columns, filter) {
  const rows = check(await filter(db.from(table).select(columns)), table);
  return rows ?? [];
}

async function run() {
  const summary = validate();
  const apply = process.argv.includes("--apply");
  console.log(JSON.stringify({ ...summary, mode: apply ? "apply" : "dry-run", note: "Only Unit 1 has authored content; Listening is transcript-only" }));
  if (!apply) return;
  if (process.env.BAND56_V3_APPLY !== "confirmed") throw new Error("Set BAND56_V3_APPLY=confirmed to replace the visible course");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.AI_FACTORY_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AI_FACTORY_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase production URL or service role key");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const course = check(await db.from("courses").select("id,slug,title,description,published").eq("slug", courseSlug).single(), "Band 5–6 course");
  const oldUnits = await allRows(db, "units", "id,slug,published", (q) => q.eq("course_id", course.id).not("slug", "like", `${prefix}-%`));
  const oldUnitIds = oldUnits.map((row) => row.id);
  const oldLessons = oldUnitIds.length ? await allRows(db, "lessons", "id,slug,published", (q) => q.in("unit_id", oldUnitIds)) : [];
  const oldAssessments = await allRows(db, "package_assessments", "id,slug,published", (q) => q.eq("course_id", course.id).not("slug", "like", `${prefix}-%`));
  const backupPath = process.env.BAND56_V3_BACKUP_PATH;
  if (!backupPath) throw new Error("Set BAND56_V3_BACKUP_PATH to an absolute JSON backup path");
  writeFileSync(backupPath, JSON.stringify({ course, units: oldUnits, lessons: oldLessons, assessments: oldAssessments, captured_at: new Date().toISOString() }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ backupPath, historicalUnits: oldUnits.length, historicalLessons: oldLessons.length, historicalAssessments: oldAssessments.length }));

  // Stage all 48 V3 records unpublished. The visible switch happens only after every write succeeds.
  for (const unit of curriculum.units) {
    const publishedPilot = unit.id === "L2U01";
    const unitRow = check(await db.from("units").upsert({ course_id: course.id, slug: unitSlug(unit), title: `Unit ${unit.order} · ${unit.name} (${unit.vi})`, sort_order: unit.order,
      published: false }, { onConflict: "course_id,slug" }).select("id").single(), `unit ${unit.id}`);
    for (const [index, plan] of unit.lesson_plan.entries()) {
      const skill = skills[index];
      const row = check(await db.from("lessons").upsert({ unit_id: unitRow.id, slug: lessonSlug(plan), title: `${unit.name} · ${plan.name}`,
        skill, summary: `${plan.content} · ${plan.deliverable}`, sort_order: index + 1, published: false }, { onConflict: "slug" }).select("id").single(), `lesson ${plan.id}`);
      const content = publishedPilot ? pilotContent(skill, unit, plan) : { type: skill.toLowerCase(), title: plan.name, curriculum_version: 3,
        release_status: "blueprint", source_lesson_id: plan.id, blueprint: plan, source_status: unit.source_status,
        unit_focus: { reading: unit.read, writing: unit.write, listening: unit.listen, speaking: unit.speak, grammar: unit.grammar, vocabulary: unit.vocab } };
      check(await db.from("package_lesson_content").upsert({ lesson_id: row.id, content }, { onConflict: "lesson_id" }), `content ${plan.id}`);
      if (publishedPilot) {
        check(await db.from("lesson_materials").upsert({ lesson_id: row.id, content: pilotMaterial(skill, content) }, { onConflict: "lesson_id" }), `material ${plan.id}`);
        if (skill === "Vocabulary") {
          const words = pilot.vocabulary.map((word, sort_order) => ({ lesson_id: row.id, word: word.en, phonetic: "", meaning_vi: word.vi,
            definition: "", example: word.example, sort_order }));
          check(await db.from("vocabulary_entries").upsert(words, { onConflict: "lesson_id,word" }), "Unit 1 vocabulary");
        }
      }
    }
  }
  const staged = await allRows(db, "units", "id,slug", (q) => q.eq("course_id", course.id).like("slug", `${prefix}-%`));
  if (staged.length !== 8) throw new Error(`Expected 8 staged units, got ${staged.length}`);
  const stagedLessons = await allRows(db, "lessons", "id,slug", (q) => q.in("unit_id", staged.map((row) => row.id)));
  if (stagedLessons.length !== 48) throw new Error(`Expected 48 staged lessons, got ${stagedLessons.length}`);
  // The old assessments have a published flag, so learner progress rows need not be deleted.
  if (oldAssessments.length) check(await db.from("package_assessments").update({ published: false }).in("id", oldAssessments.map((row) => row.id)), "hide V2 assessments");
  if (oldLessons.length) check(await db.from("lessons").update({ published: false }).in("id", oldLessons.map((row) => row.id)), "hide V2 lessons");
  if (oldUnits.length) check(await db.from("units").update({ published: false }).in("id", oldUnitIds), "hide V2 units");
  const pilotUnit = staged.find((row) => row.slug === `${prefix}-l2u01`);
  check(await db.from("units").update({ published: true }).eq("id", pilotUnit.id), "publish V3 Unit 1");
  check(await db.from("lessons").update({ published: true }).in("id", stagedLessons.filter((row) => row.slug.startsWith(`${prefix}-l2u01-`)).map((row) => row.id)), "publish V3 pilot lessons");
  check(await db.from("courses").update({ title: "IELTS Builder 5.0–6.0 · V3", description: "Lộ trình V3: 8 unit và 48 bản thiết kế bài học. Unit 1 có 6 bài luyện gốc; Listening hiện chỉ có transcript, chưa có audio kiểm duyệt. Unit 2–8 đang biên soạn. Mức học nội bộ, không dự đoán band IELTS.", published: true }).eq("id", course.id), "activate Band 5–6 V3");
  console.log(JSON.stringify({ status: "activated", courseId: course.id, visibleUnits: 1, visibleLessons: 6, draftBlueprints: 42 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
