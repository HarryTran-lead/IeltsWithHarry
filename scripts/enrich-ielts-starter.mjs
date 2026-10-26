// Completes the authored 4–5 course using its existing 10 JSON units.
// Dry run: node scripts/enrich-ielts-starter.mjs
// Apply:   node --env-file=.env.production.local scripts/enrich-ielts-starter.mjs --apply
// Audio is a clearly labelled machine-voice practice sample, not a human exam recording.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const sourceDir = resolve("src/content/curriculum/ielts-starter");
const { readdirSync } = await import("node:fs");
const units = readdirSync(sourceDir).filter((name) => name.endsWith(".json")).sort()
  .map((name) => JSON.parse(readFileSync(join(sourceDir, name), "utf8")));
if (units.length !== 10 || units.some((unit) => unit.lessons.length !== 6)) throw new Error("Expected 10 authored units with six lessons each");
for (const unit of units) vocabularyQuestions(unit.lessons.find((lesson) => lesson.skill === "Vocabulary").vocabulary);
const apply = process.argv.includes("--apply");
const audio = process.argv.includes("--audio");
console.log(JSON.stringify({ course: units[0].course.slug, units: units.length, lessons: 60,
  vocabulary: units.reduce((sum, unit) => sum + unit.lessons.find((l) => l.skill === "Vocabulary").vocabulary.length, 0),
  assessments: 11, audioSamples: audio ? 20 : 0, mode: apply ? "apply" : "dry run" }));
if (!apply) process.exit(0);
if (audio && process.platform !== "win32") throw new Error("--audio currently requires Windows System.Speech");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing Supabase URL");
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.startsWith("[")) {
  const ref = new URL(url).hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Unexpected project ref");
  const args = process.platform === "win32" ? ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]
    : ["supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"];
  const keys = JSON.parse(execFileSync(process.platform === "win32" ? "cmd.exe" : "npx", args, { encoding: "utf8" }));
  key = keys.find((item) => item.id === "service_role")?.api_key;
}
if (!key) throw new Error("Service role key unavailable");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function ok(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
function optionsFor(words, index) {
  const other = [1, 3, 5].map((offset) => words[(index + offset) % words.length].meaningVi);
  const options = [...new Set([words[index].meaningVi, ...other])];
  for (const word of words) if (options.length < 4 && !options.includes(word.meaningVi)) options.push(word.meaningVi);
  if (options.length < 4) throw new Error(`Not enough distinct Vietnamese meanings near ${words[index].word}`);
  return options.slice(0, 4).sort((a, b) => a.localeCompare(b, "vi"));
}
function vocabularyQuestions(words) {
  return words.map((word, index) => ({ id: `v${String(index + 1).padStart(2, "0")}`, type: "multiple_choice",
    prompt: `“${word.word}” trong chủ đề này có nghĩa là gì?`, options: optionsFor(words, index), answer: word.meaningVi,
    explanation: `${word.definition} Ví dụ: ${word.example}` }));
}
function authoredQuestions(lesson, limit) {
  return (lesson.questions ?? []).slice(0, limit).map((question) => ({ id: question.slug, type: "multiple_choice",
    prompt: question.prompt, options: question.options, answer: question.options[question.answer], explanation: question.explanation }));
}
const courseSlug = units[0].course.slug;
const course = ok(await db.from("courses").select("id,published").eq("slug", courseSlug).single(), "starter course");
if (!course.published) throw new Error("Starter course is not published");
const tempDir = audio ? mkdtempSync(join(tmpdir(), "ielts-starter-audio-")) : null;
async function uploadAudio(text, path) {
  if (!tempDir) return "";
  const input = join(tempDir, "speech.txt");
  const output = join(tempDir, "speech.wav");
  writeFileSync(input, text, "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    resolve("scripts/synthesize-starter-audio.ps1"), input, output], { stdio: "pipe" });
  const bytes = readFileSync(output);
  if (bytes.length < 10000 || bytes.length > 10_000_000) throw new Error(`Unexpected WAV size ${bytes.length} for ${path}`);
  ok(await db.storage.from("lesson-media").upload(path, bytes, { contentType: "audio/wav", upsert: true }), `upload ${path}`);
  return db.storage.from("lesson-media").getPublicUrl(path).data.publicUrl;
}
try {
  const unitChecks = [];
  for (const [index, unit] of units.entries()) {
    const unitRow = ok(await db.from("units").select("id,published").eq("course_id", course.id).eq("slug", unit.unit.slug).single(), `unit ${unit.unit.slug}`);
    if (!unitRow.published) throw new Error(`Unit ${unit.unit.slug} is not published`);
    const lessonRows = ok(await db.from("lessons").select("id,slug,skill,published").eq("unit_id", unitRow.id), `lessons ${unit.unit.slug}`);
    const sourceBySkill = Object.fromEntries(unit.lessons.map((lesson) => [lesson.skill, lesson]));
    const words = sourceBySkill.Vocabulary.vocabulary;
    const vocabQuestions = vocabularyQuestions(words);
    const audioUrls = {};
    const vocabularyRow = lessonRows.find((row) => row.skill === "Vocabulary");
    const listeningRow = lessonRows.find((row) => row.skill === "Listening");
    const existingVocabulary = ok(await db.from("package_lesson_content").select("content").eq("lesson_id", vocabularyRow.id).maybeSingle(), `previous vocabulary ${unit.unit.slug}`);
    const existingListening = ok(await db.from("lesson_materials").select("content").eq("lesson_id", listeningRow.id).single(), `previous listening ${unit.unit.slug}`);
    audioUrls.Vocabulary = existingVocabulary?.content?.audio_url ?? "";
    audioUrls.Listening = existingListening.content?.audioUrl ?? "";
    if (audio) {
      audioUrls.Vocabulary = await uploadAudio(words.map((word) => `${word.word}. ${word.example}`).join("\n"),
        `course-packages/ielts-starter/unit-${String(index + 1).padStart(2, "0")}-vocabulary.wav`);
      audioUrls.Listening = await uploadAudio(sourceBySkill.Listening.material.transcript,
        `course-packages/ielts-starter/unit-${String(index + 1).padStart(2, "0")}-listening.wav`);
    }
    for (const lesson of unit.lessons) {
      const row = lessonRows.find((candidate) => candidate.slug === lesson.slug);
      if (!row?.published) throw new Error(`Missing published lesson ${lesson.slug}`);
      if (lesson.skill === "Vocabulary") {
        for (const [questionIndex, question] of vocabQuestions.entries()) {
          const saved = ok(await db.from("exercise_questions").upsert({ lesson_id: row.id, slug: `starter-${question.id}`,
            prompt: question.prompt, options: question.options, sort_order: questionIndex },
          { onConflict: "lesson_id,slug" }).select("id").single(), `vocab question ${lesson.slug}/${question.id}`);
          ok(await db.from("exercise_answer_keys").upsert({ question_id: saved.id,
            correct_index: question.options.indexOf(question.answer), explanation: question.explanation, evidence: "" },
          { onConflict: "question_id" }), `vocab answer ${lesson.slug}/${question.id}`);
        }
      }
      if (lesson.skill === "Listening" && audioUrls.Listening) {
        const materialRow = ok(await db.from("lesson_materials").select("content").eq("lesson_id", row.id).single(), `material ${lesson.slug}`);
        ok(await db.from("lesson_materials").update({ content: { ...materialRow.content, audioUrl: audioUrls.Listening } }).eq("lesson_id", row.id), `audio material ${lesson.slug}`);
      }
      const content = { type: lesson.skill.toLowerCase(), assessment_slug: `${unit.unit.slug}-check`,
        stage_warning: "Chặng luyện 4.0–5.0; bài luyện nội bộ không quy đổi thành điểm IELTS chính thức.",
        audio_url: lesson.skill === "Vocabulary" ? audioUrls.Vocabulary ?? "" : "",
        audio_quality_note: lesson.skill === "Listening" && audioUrls.Listening ? "Audio giọng máy thử nghiệm; nghe transcript để kiểm tra sau khi làm bài." : "",
        scaffolding_steps: lesson.skill === "Writing" || lesson.skill === "Speaking" ? lesson.material.checklist : [] };
      ok(await db.from("package_lesson_content").upsert({ lesson_id: row.id, content }, { onConflict: "lesson_id" }), `package ${lesson.slug}`);
    }
    const check = { title: `Unit ${index + 1} · ${unit.unit.title.replace(/^Unit \d+\s*·\s*/, "")} — Progress Check`,
      stage_warning: "Bài ôn tập dùng câu hỏi đã biên soạn trong unit; đây không phải đề thi IELTS chính thức.",
      auto_scored: [...vocabQuestions.slice(0, 5), ...authoredQuestions(sourceBySkill.Grammar, 3)],
      reading: { passage: sourceBySkill.Reading.material.passage, questions: authoredQuestions(sourceBySkill.Reading, 3) },
      listening: { audio_url: audioUrls.Listening ?? sourceBySkill.Listening.material.audioUrl ?? "",
        questions: authoredQuestions(sourceBySkill.Listening, 3) },
      writing_task: sourceBySkill.Writing.material.prompt, speaking_task: sourceBySkill.Speaking.material.prompt,
      review: { vocabulary_recall: words.map((word) => ({ en: word.word, vi: word.meaningVi })) } };
    ok(await db.from("package_assessments").upsert({ course_id: course.id, unit_id: unitRow.id, slug: `${unit.unit.slug}-check`,
      title: check.title, content: check, published: true }, { onConflict: "slug" }), `check ${unit.unit.slug}`);
    unitChecks.push({ check, unit });
    console.log(`Unit ${index + 1}: ${words.length} vocabulary quizzes, 1 review, ${audio ? "2 audio samples" : "audio unchanged"}`);
  }
  const last = unitChecks.at(-1);
  const final = { title: "IELTS Starter · Tổng ôn 4.0–5.0", stage_warning: "Bài tổng ôn nội bộ, không phải đề thi hoặc điểm IELTS chính thức.",
    instruction_vi: "Ôn từ vựng, ngữ pháp và các dạng bài của 10 unit trước khi chuyển chặng.",
    auto_scored: unitChecks.flatMap(({ check }) => [check.auto_scored[0], check.auto_scored.at(-1)]),
    reading: last.check.reading, listening: last.check.listening,
    writing: { prompt: last.unit.lessons.find((lesson) => lesson.skill === "Writing").material.prompt },
    speaking: { prompt: last.unit.lessons.find((lesson) => lesson.skill === "Speaking").material.prompt },
    review: { vocabulary_recall: unitChecks.flatMap(({ check }) => check.review.vocabulary_recall.slice(0, 2)) } };
  ok(await db.from("package_assessments").upsert({ course_id: course.id, unit_id: null, slug: "ielts-starter-final-check",
    title: final.title, content: final, published: true }, { onConflict: "slug" }), "final review");
  console.log(JSON.stringify({ published: courseSlug, vocabularyQuizzes: unitChecks.reduce((sum, { check }) => sum + check.review.vocabulary_recall.length, 0),
    unitChecks: 10, finalChecks: 1, audioSamples: audio ? 20 : 0 }));
} finally {
  if (tempDir) {
    const checked = resolve(tempDir);
    if (!checked.startsWith(resolve(tmpdir()) + sep) || !checked.includes(`ielts-starter-audio-`)) throw new Error("Refusing to remove unexpected temp path");
    rmSync(checked, { recursive: true, force: true });
  }
}
