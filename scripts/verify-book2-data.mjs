import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "src/data/book2/catalog.json"), "utf8"));
const lessons = catalog.units.flatMap((unit) => unit.lessons);
const errors = [];
let questions = 0;

for (const entry of lessons) {
  const path = join(root, "content/book2/lessons", `${entry.slug}.json`);
  if (!existsSync(path)) { errors.push(`${entry.slug}: missing lesson`); continue; }
  const data = JSON.parse(readFileSync(path, "utf8"));
  const sourceIds = new Set([...data.passages, ...data.audios, ...data.visuals].map((item) => item.id));
  for (const audio of data.audios) {
    if (!audio.audio_url || !existsSync(join(root, "public", audio.audio_url.replace(/^\//, "")))) errors.push(`${entry.slug}: missing audio ${audio.id}`);
    if (!audio.transcript?.trim()) errors.push(`${entry.slug}: missing transcript ${audio.id}`);
  }
  for (const exercise of data.exercises) {
    if (!exercise.title?.trim() || exercise.title === exercise.id) errors.push(`${entry.slug}/${exercise.id}: exercise needs a learner-facing title`);
    if (!exercise.instruction?.vi?.trim()) errors.push(`${entry.slug}/${exercise.id}: exercise needs a Vietnamese instruction`);
  }
  for (const exercise of data.exercises) for (const item of exercise.questions) {
    questions++;
    if (!Array.isArray(item.options)) errors.push(`${entry.slug}/${item.question_id}: options must be an array`);
    if (item.answer?.kind === "objective" && !item.answer.accepted?.length) errors.push(`${entry.slug}/${item.question_id}: missing answer`);
    if (item.answer?.kind !== "objective" && !item.answer?.model_en) errors.push(`${entry.slug}/${item.question_id}: missing model`);
    for (const key of ["passage_id", "audio_id", "data_id"]) if (item[key] && !sourceIds.has(item[key])) errors.push(`${entry.slug}/${item.question_id}: unknown ${key} ${item[key]}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified ${lessons.length} Book 2 lessons, ${questions} questions and all audio/transcript references.`);
}
