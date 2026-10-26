// Import independently authored course ZIPs into the published learning path.
// Dry run: node scripts/import-course-packages.mjs <zip> [<zip>]
// Apply:   node --env-file=.env.production.local scripts/import-course-packages.mjs --apply <zip> [<zip>]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";

const specs = {
  "ESL-FOUNDATION-1-2": { stage: "foundation", slug: "foundation-english-1-2", prefix: "foundation", units: 10 },
  "ESL-ELEMENTARY-2-3": { stage: "elementary", slug: "elementary-english-2-3", prefix: "elementary", units: 10 },
  "ESL-PRE-IELTS-3-4": { stage: "pre-ielts", slug: "preielts-topic-practice-3-4", prefix: "preielts", units: 10, label: "Pre-IELTS 3.0–4.0" },
  "ESL-IELTS-STARTER-4-5": { stage: "ielts-starter", slug: "mindsetstarter-topic-practice-4-5", prefix: "mindsetstarter", units: 8, label: "IELTS Starter 4.0–5.0" },
  "ESL-IELTS-BUILDER-5-6": { stage: "ielts-builder", slug: "mindsetbuilder-topic-practice-5-6", prefix: "mindsetbuilder", units: 8, label: "IELTS Builder 5.0–6.0" },
  "ESL-IELTS-ADVANCED-6-7PLUS": { stage: "ielts-advanced", slug: "mindsetadvanced-topic-practice-6-7", prefix: "mindsetadvanced", units: 8, label: "IELTS Advanced 6.0–7.0+" },
};
const skills = { vocabulary: "Vocabulary", grammar: "Grammar", reading: "Reading", listening: "Listening", writing: "Writing", speaking: "Speaking" };
const paths = process.argv.slice(2).filter((arg) => arg.toLowerCase().endsWith(".zip"));
const apply = process.argv.includes("--apply");
if (!paths.length) throw new Error("Pass at least one course ZIP");

const packs = paths.map((path) => {
  const files = unzipSync(readFileSync(path), { filter: (entry) => entry.name === "course.json" || entry.name.startsWith("audio/") });
  if (!files["course.json"]) throw new Error(`${path}: missing course.json`);
  const course = JSON.parse(strFromU8(files["course.json"]));
  const spec = specs[course.course_id];
  if (!spec || course.units?.length !== spec.units) throw new Error(`${path}: unexpected course or unit count`);
  const lessonIds = new Set();
  for (const unit of course.units) {
    if (unit.lessons?.length !== 6 || new Set(unit.lessons.map((lesson) => lesson.type)).size !== 6 ||
      unit.lessons.some((lesson) => !skills[lesson.type])) throw new Error(`${path}: invalid lessons in ${unit.unit_id}`);
    for (const lesson of unit.lessons) {
      if (lessonIds.has(lesson.id)) throw new Error(`${path}: duplicate lesson ${lesson.id}`);
      lessonIds.add(lesson.id);
      if (lesson.audio_file && !files[lesson.audio_file]) throw new Error(`${path}: missing ${lesson.audio_file}`);
      for (const item of lesson.activities ?? []) {
        if (item.type === "multiple_choice" && (!Array.isArray(item.options) || !item.options.includes(item.answer))) throw new Error(`${path}: invalid MCQ ${item.id}`);
      }
      if (Buffer.byteLength(JSON.stringify(lesson), "utf8") > 95_000) throw new Error(`${path}: lesson ${lesson.id} exceeds content limit`);
    }
    if (!unit.unit_assessment || Buffer.byteLength(JSON.stringify(unit.unit_assessment), "utf8") > 145_000) throw new Error(`${path}: invalid assessment ${unit.unit_id}`);
  }
  const finalAudio = course.final_assessment?.listening?.audio_file;
  if (!course.final_assessment || (finalAudio && !files[finalAudio])) throw new Error(`${path}: missing final assessment or audio`);
  const audio = Object.entries(files).filter(([name]) => name.startsWith("audio/") && name.endsWith(".mp3"));
  console.log(JSON.stringify({ path, course: course.course_id, units: course.units.length, lessons: lessonIds.size, audio: audio.length, mode: apply ? "publish" : "dry run" }));
  return { files, course, spec, audio };
});
if (!apply) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const projectRef = new URL(url).hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Unexpected project ref");
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"]
    : ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"];
  const keys = JSON.parse(execFileSync(command, args, { encoding: "utf8" }));
  key = keys.find((item) => item.id === "service_role")?.api_key;
}
if (!key) throw new Error("No service role key available");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function success(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
function lessonSlug(spec, unit, lesson) { return `${spec.prefix}-${unit.unit_id.toLowerCase()}-${lesson.type}`; }
function checklist(items) { return Array.isArray(items) ? items.filter((item) => typeof item === "string" && item.length > 1) : []; }
function rubricRows(items) {
  return Array.isArray(items) ? items.map((item) => typeof item === "string"
    ? { criterion: item, detail: "Tự đánh giá theo tiêu chí này.", max: 9 }
    : item) : [];
}
function instruction(lesson) { return lesson.instruction_vi ?? lesson.grammar_explanation_vi ?? `Luyện ${skills[lesson.type]} với chủ đề của unit.`; }
function packageContent(lesson, audioUrl, warning, unitSlug, courseSlug) {
  return { ...lesson, audio_url: audioUrl, stage_warning: warning,
    audio_quality_note: lesson.audio_quality_note ?? (audioUrl ? "Audio giọng máy dùng để luyện tập; chưa phải bản thu chuyên nghiệp." : undefined),
    scaffolding_steps: lesson.scaffolding_steps ?? lesson.guidance,
    pronunciation_focus: lesson.pronunciation_focus ?? lesson.focus,
    rubric: rubricRows(lesson.rubric), assessment_slug: `${unitSlug}-check`, course_slug: courseSlug };
}
function materialFor(lesson, audioUrl) {
  const figure = { url: "", alt: "" };
  switch (lesson.type) {
    case "vocabulary": return { skill: "Vocabulary", introduction: instruction(lesson), figure };
    case "grammar": return { skill: "Grammar", rule: `${lesson.grammar_title}\n${instruction(lesson)}\n${lesson.grammar_form}`, example: lesson.examples?.[0] ?? "", figure };
    case "reading": return { skill: "Reading", passage: lesson.passage, figure };
    case "listening": return { skill: "Listening", transcript: lesson.transcript, audioUrl, figure };
    case "writing": {
      const range = lesson.task.match(/(\d+)\s*[-–]\s*(\d+)\s*words?/i);
      return { skill: "Writing", prompt: lesson.task, minWords: range ? Number(range[1]) : 40, modelAnswer: lesson.sample_answer,
        checklist: checklist(lesson.scaffolding_steps ?? lesson.guidance), figure };
    }
    case "speaking": return { skill: "Speaking", prompt: lesson.questions.map((item, i) => `${i + 1}. ${item.prompt}`).join("\n"),
      preparationSeconds: 30, modelAnswer: lesson.model_answer,
      checklist: [lesson.pronunciation_focus ?? lesson.focus, ...rubricRows(lesson.rubric).map((row) => row.detail)].filter(Boolean), figure };
  }
}

for (const { course, spec, audio } of packs) {
  const warning = course.stage?.warning ?? "Mức học chỉ là lộ trình nội bộ, không quy đổi thành điểm IELTS chính thức.";
  const label = course.stage?.display ?? `${spec.label} (mốc học nội bộ)`;
  const audioUrls = {};
  for (const [path, bytes] of audio) {
    const storagePath = `course-packages/${spec.prefix}/${path.slice("audio/".length)}`;
    success(await db.storage.from("lesson-media").upload(storagePath, bytes, { contentType: "audio/mpeg", upsert: true }), `audio ${storagePath}`);
    audioUrls[path] = db.storage.from("lesson-media").getPublicUrl(storagePath).data.publicUrl;
  }
  const courseRow = success(await db.from("courses").upsert({ stage_id: spec.stage, slug: spec.slug,
    title: spec.label ?? course.title.replace(/^English Skill Lab: /, ""),
    description: `${label}. ${warning} ${spec.units} unit · 6 kỹ năng · bài luyện nguyên bản. Audio giọng máy thử nghiệm.`,
    published: false }, { onConflict: "slug" }).select("id").single(), `course ${spec.slug}`);
  const unitIds = [];
  for (const unit of course.units) {
    const unitSlug = `${spec.prefix}-${unit.unit_id.toLowerCase()}`;
    const unitRow = success(await db.from("units").upsert({ course_id: courseRow.id, slug: unitSlug,
      title: `Unit ${unit.order} · ${unit.title} (${unit.title_vi})`, sort_order: unit.order, published: false },
      { onConflict: "course_id,slug" }).select("id").single(), `unit ${unitSlug}`);
    unitIds.push(unitRow.id);
    for (const lesson of unit.lessons) {
      const slug = lessonSlug(spec, unit, lesson);
      const lessonRow = success(await db.from("lessons").upsert({ unit_id: unitRow.id, slug,
        title: `${unit.title} · ${lesson.title}`, skill: skills[lesson.type], summary: instruction(lesson),
        sort_order: lesson.order ?? unit.lessons.indexOf(lesson) + 1, published: false }, { onConflict: "slug" }).select("id").single(), `lesson ${slug}`);
      success(await db.from("lesson_materials").upsert({ lesson_id: lessonRow.id, content: materialFor(lesson, audioUrls[lesson.audio_file] ?? "") },
        { onConflict: "lesson_id" }), `material ${slug}`);
      success(await db.from("package_lesson_content").upsert({ lesson_id: lessonRow.id,
        content: packageContent(lesson, audioUrls[lesson.audio_file] ?? "", warning, unitSlug, spec.slug) }, { onConflict: "lesson_id" }), `package ${slug}`);
      if (lesson.type === "vocabulary") {
        const entries = lesson.vocabulary.map((item, i) => ({ lesson_id: lessonRow.id, word: item.en, phonetic: item.ipa_reference ?? "",
          meaning_vi: item.vi, definition: "", example: item.example, sort_order: i }));
        success(await db.from("vocabulary_entries").upsert(entries, { onConflict: "lesson_id,word" }), `vocabulary ${slug}`);
      }
      const mcqs = (lesson.activities ?? []).filter((item) => item.type === "multiple_choice");
      for (const [index, item] of mcqs.entries()) {
        const question = success(await db.from("exercise_questions").upsert({ lesson_id: lessonRow.id, slug: item.id.toLowerCase(),
          prompt: item.prompt, options: item.options, sort_order: index }, { onConflict: "lesson_id,slug" }).select("id").single(), `question ${slug}/${item.id}`);
        success(await db.from("exercise_answer_keys").upsert({ question_id: question.id, correct_index: item.options.indexOf(item.answer),
          explanation: item.explanation ?? "", evidence: "" }, { onConflict: "question_id" }), `key ${slug}/${item.id}`);
      }
      success(await db.from("lessons").update({ published: true }).eq("id", lessonRow.id), `publish lesson ${slug}`);
    }
    success(await db.from("package_assessments").upsert({ course_id: courseRow.id, unit_id: unitRow.id,
      slug: `${unitSlug}-check`, title: unit.unit_assessment.title,
      content: { ...unit.unit_assessment, review: unit.unit_review, stage_warning: warning }, published: true },
      { onConflict: "slug" }), `assessment ${unitSlug}`);
    success(await db.from("units").update({ published: true }).eq("id", unitRow.id), `publish unit ${unitSlug}`);
    console.log(`${spec.slug}: ${unit.unit_id} imported (${unit.lessons.length} lessons)`);
  }
  success(await db.from("package_assessments").upsert({ course_id: courseRow.id, unit_id: null,
    slug: `${spec.prefix}-final-check`, title: course.final_assessment.title,
    content: { ...course.final_assessment, listening: { ...course.final_assessment.listening,
      audio_url: audioUrls[course.final_assessment.listening?.audio_file] ?? "" }, stage_warning: warning }, published: true },
    { onConflict: "slug" }), `final ${spec.slug}`);
  success(await db.from("courses").update({ published: true }).eq("id", courseRow.id), `publish course ${spec.slug}`);
  const { count, error } = await db.from("lessons").select("id", { count: "exact", head: true }).in("unit_id", unitIds).eq("published", true);
  if (error || count !== spec.units * 6) throw new Error(`${spec.slug}: expected ${spec.units * 6} published lessons, got ${count}: ${error?.message ?? ""}`);
  console.log(JSON.stringify({ published: spec.slug, lessons: count, audio: audio.length, assessments: spec.units + 1 }));
}
