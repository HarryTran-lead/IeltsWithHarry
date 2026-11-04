/*
 * Server-side access to the Skill Lab dictation bank (M16.2, 300 staged lessons).
 * Lesson files hold the answer key, so they stay in content/ and are read on the server only.
 * The client receives `PublicLesson`, which has no transcript, answers or explanations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { acceptedAnswers, gradeAnswer, type GradeMode, type GradeResult } from "./grade";

const root = join(process.cwd(), "content/dictation-skill-lab");

export type LessonSpeaker = { speaker_id: string; role: string; tts_voice_id: string | null; accent_requested: string };
export type LessonTurn = { turn_id: string; speaker_id: string; text_en: string; translation_vi: string; skill_tags: string[] };
export type LessonQuestion = {
  question_id: string; type: string; prompt: string; correct_answers: string[]; options?: string[]; evidence_turn_ids: string[];
  explanation_vi: string; scoring_policy: string; question_tags: string[]; word_limit?: number; instructions_en?: string;
  practice_aliases?: string[]; map_asset?: string;
};
export type LessonVocabulary = { term: string; pos: string; meaning_vi: string; example_en: string; example_vi: string; source_turn_id: string };
export type StoredLesson = {
  lesson_id: string; status: string; level: string; section: number; topic: string; title: string; learning_objectives_vi: string[];
  content_format: string; speakers: LessonSpeaker[]; turns: LessonTurn[]; questions: LessonQuestion[]; vocabulary: LessonVocabulary[];
  qa: Record<string, unknown>;
};
type ManifestTurn = { file: string; duration_ms: number; voice: string; accent: string; auto_check: "pass" | "suspect"; asr_check?: "pass" | "review"; text_sha256: string };
type Manifest = { status: string; turns: Record<string, ManifestTurn> };

export const LESSON_ID = /^DICT-(F[1-3]|S[1-4])-\d{3}$/;

export type PublicQuestion = Pick<LessonQuestion, "question_id" | "type" | "prompt" | "evidence_turn_ids" | "word_limit" | "instructions_en"> & {
  options?: string[]; map_url?: string; choices?: string[];
};
export type PublicLesson = {
  lesson_id: string; title: string; topic: string; level: string; section: number; content_format: string; learning_objectives_vi: string[];
  speakers: { speaker_id: string; label: string; accent: string }[];
  /** `flagged`: the automatic speech-recognition check could not confirm every word of this clip. */
  turns: { turn_id: string; speaker_id: string; audio_url: string | null; duration_ms: number | null; flagged: boolean }[];
  questions: PublicQuestion[];
  audio_ready: boolean;
  review_status: "draft_unreviewed";
};
export type CatalogEntry = {
  lesson_id: string; title: string; topic: string; level: string; section: number; content_format: string;
  turns: number; questions: number; duration_ms: number; audio_ready: boolean; skill_tags: string[];
};
export type GradedQuestion = GradeResult & {
  question_id: string; accepted_answers: string[]; explanation_vi: string;
  evidence: { turn_id: string; text_en: string; translation_vi: string }[];
};

let lessonCache: Map<string, StoredLesson> | null = null;
let manifestCache: { mtime: number; value: Manifest } | null = null;

/** Re-read when the file changes, so newly voiced turns appear without a restart. */
function manifest(): Manifest {
  const path = join(root, "audio-manifest.json");
  let mtime = 0;
  try { mtime = statSync(path).mtimeMs; } catch { return { status: "missing", turns: {} }; }
  if (manifestCache?.mtime === mtime) return manifestCache.value;
  try { manifestCache = { mtime, value: JSON.parse(readFileSync(path, "utf8")) as Manifest }; }
  catch { return manifestCache?.value ?? { status: "missing", turns: {} }; }
  return manifestCache.value;
}

function lessons(): Map<string, StoredLesson> {
  if (lessonCache) return lessonCache;
  const ids = readdirSync(join(root, "lessons")).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).filter((id) => LESSON_ID.test(id)).sort();
  lessonCache = new Map(ids.map((id) => [id, JSON.parse(readFileSync(join(root, "lessons", `${id}.json`), "utf8")) as StoredLesson]));
  return lessonCache;
}

export function getStoredLesson(id: string) {
  return LESSON_ID.test(id) ? lessons().get(id) ?? null : null;
}

function turnAudio(lesson: StoredLesson, turnId: string) {
  return manifest().turns[`${lesson.lesson_id}/${turnId}`] ?? null;
}

/** A lesson opens only when every turn has a generated clip; generation is still not teacher verification. */
export function audioReady(lesson: StoredLesson) {
  return lesson.turns.every((turn) => turnAudio(lesson, turn.turn_id));
}

/** "Anna — university student" → "Anna"; generic roles keep their first descriptive part. */
export function speakerLabel(speaker: LessonSpeaker) {
  const [first] = speaker.role.split(/\s+[—–-]\s+|\s*\/\s*|\s*\(/);
  return (first || `Speaker ${speaker.speaker_id}`).trim();
}

function letterRange(prompt: string) {
  const match = prompt.match(/\(([A-Z])\s*[–-]\s*([A-Z])\)/);
  if (!match) return undefined;
  const letters: string[] = [];
  for (let code = match[1].charCodeAt(0); code <= match[2].charCodeAt(0); code += 1) letters.push(String.fromCharCode(code));
  return letters;
}

export function toPublicLesson(lesson: StoredLesson): PublicLesson {
  const labels = Object.fromEntries(lesson.speakers.map((speaker) => [speaker.speaker_id, speakerLabel(speaker)]));
  return {
    lesson_id: lesson.lesson_id, title: lesson.title, topic: lesson.topic, level: lesson.level, section: lesson.section,
    content_format: lesson.content_format, learning_objectives_vi: lesson.learning_objectives_vi,
    speakers: lesson.speakers.map((speaker) => ({ speaker_id: speaker.speaker_id, label: labels[speaker.speaker_id], accent: speaker.accent_requested })),
    turns: lesson.turns.map((turn) => {
      const audio = turnAudio(lesson, turn.turn_id);
      return { turn_id: turn.turn_id, speaker_id: turn.speaker_id, audio_url: audio?.file ?? null, duration_ms: audio?.duration_ms ?? null,
        flagged: Boolean(audio && audio.asr_check !== "pass") };
    }),
    questions: lesson.questions.map((question) => {
      const item: PublicQuestion = { question_id: question.question_id, type: question.type, prompt: question.prompt, evidence_turn_ids: question.evidence_turn_ids };
      if (question.word_limit) item.word_limit = question.word_limit;
      if (question.instructions_en) item.instructions_en = question.instructions_en;
      if (question.options) item.options = question.type === "matching"
        ? question.options.map((option) => { const id = option.match(/^Speaker ([A-Z])$/)?.[1]; return id && labels[id] ? `${option} · ${labels[id]}` : option; })
        : question.options;
      if (question.map_asset) { item.map_url = `/dictation-skill-lab/${question.map_asset}`; item.choices = letterRange(question.prompt); }
      return item;
    }),
    audio_ready: audioReady(lesson),
    review_status: "draft_unreviewed",
  };
}

export function catalog(): CatalogEntry[] {
  return [...lessons().values()].map((lesson) => ({
    lesson_id: lesson.lesson_id, title: lesson.title, topic: lesson.topic, level: lesson.level, section: lesson.section, content_format: lesson.content_format,
    turns: lesson.turns.length, questions: lesson.questions.length,
    duration_ms: lesson.turns.reduce((sum, turn) => sum + (turnAudio(lesson, turn.turn_id)?.duration_ms ?? 0), 0),
    audio_ready: audioReady(lesson),
    skill_tags: [...new Set(lesson.questions.flatMap((question) => question.question_tags))].slice(0, 8),
  }));
}

/** Matching options are shown with a name ("Speaker C · Chloe"); grade against the stored option. */
function storedAnswer(question: LessonQuestion, answer: string) {
  if (question.type !== "matching") return answer;
  return answer.replace(/^(Speaker [A-Z]) · .+$/, "$1");
}

export function gradeLesson(lesson: StoredLesson, answers: Record<string, string>, mode: GradeMode, questionIds?: string[]): GradedQuestion[] {
  const wanted = questionIds ? new Set(questionIds) : null;
  const turns = new Map(lesson.turns.map((turn) => [turn.turn_id, turn]));
  return lesson.questions.filter((question) => !wanted || wanted.has(question.question_id)).map((question) => ({
    question_id: question.question_id,
    ...gradeAnswer(question, storedAnswer(question, String(answers[question.question_id] ?? "").slice(0, 600)), mode),
    accepted_answers: acceptedAnswers(question, mode),
    explanation_vi: question.explanation_vi,
    evidence: question.evidence_turn_ids.map((id) => turns.get(id)).filter((turn): turn is LessonTurn => Boolean(turn))
      .map((turn) => ({ turn_id: turn.turn_id, text_en: turn.text_en, translation_vi: turn.translation_vi })),
  }));
}

/** Full transcript and word list, only returned with a whole-lesson submission. */
export function lessonReview(lesson: StoredLesson) {
  return {
    transcript: lesson.turns.map((turn) => ({ turn_id: turn.turn_id, speaker_id: turn.speaker_id, text_en: turn.text_en, translation_vi: turn.translation_vi })),
    vocabulary: lesson.vocabulary,
  };
}
