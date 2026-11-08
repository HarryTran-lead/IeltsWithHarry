/*
 * IELTS Listening mock tests (M49L, 20 original tests × 4 parts × 10 questions).
 * Test files hold transcripts and answer keys, so they stay in content/ and are read on the server.
 * Learners get `PublicMock` (audio, prompts, options) and answers only after submitting.
 * Audio is one Gemini TTS clip per turn, listed in the Skill Lab audio manifest as `<part_id>/<turn_id>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gradeAnswer, type GradeResult } from "../dictation-skill-lab/grade";

const root = join(process.cwd(), "content/listening-mocks");
const manifestPath = join(process.cwd(), "content/dictation-skill-lab/audio-manifest.json");
export const MOCK_ID = /^M\d{2}-LISTENING-MOCK-\d{2}$/;

type Option = { key: string; text: string };
type MockTurn = { turn_id: string; speaker_id: string; text_en: string; translation_vi: string | null };
type MockQuestion = {
  question_id: string; test_question_number: number; question_type: string; group_id: string; prompt_en: string;
  correct_answers: string[]; accepted_answers?: string[]; options?: Option[]; word_limit?: number; instructions_en?: string;
  explanation_vi: string; evidence_turn_ids: string[]; scoring_policy: string;
};
type MockGroup = {
  group_id: string; question_ids: string[]; question_type: string; instructions_en: string; pre_read_seconds?: number;
  options?: Option[]; prompt_en?: string; map_asset_id?: string; map_candidate_letters?: string[];
  layout_metadata?: { heading?: string; title?: string; summary_title_en?: string; chart_title_en?: string };
};
type MockPart = {
  part_id: string; part_number: number; title: string; context: string;
  speakers: { speaker_id: string; role: string; accent_requested?: string }[];
  turns: MockTurn[]; questions: MockQuestion[]; question_groups: MockGroup[];
};
export type StoredMock = { test_id: string; title: string; status: string; parts: MockPart[] };

export type PublicMock = {
  test_id: string; number: number; title: string; audio_ready: boolean; review_status: "draft_unreviewed";
  parts: {
    part_id: string; part_number: number; title: string; context: string; cover_url: string;
    turns: { turn_id: string; audio_url: string | null; duration_ms: number | null }[];
    groups: {
      group_id: string; type: string; instructions: string; heading?: string; pre_read_seconds: number; prompt?: string;
      options?: string[]; map_url?: string; letters?: string[];
      questions: { question_id: string; number: number; type: string; prompt: string; options?: string[]; word_limit?: number }[];
    }[];
  }[];
};
export type MockCatalogEntry = { test_id: string; number: number; title: string; audio_ready: boolean; cover_url: string; part_titles: string[]; duration_ms: number;
  parts: { number: number; title: string; cover_url: string; duration_ms: number; question_types: string[]; question_count: number }[] };
export type MockResult = GradeResult & {
  question_id: string; part_number: number; number: number; accepted_answers: string[]; explanation_vi: string;
  evidence: { turn_id: string; text_en: string }[];
};

let cache: Map<string, StoredMock> | null = null;
let manifestCache: { mtime: number; checked: number; turns: Record<string, { file: string; duration_ms: number }> } | null = null;

function tests() {
  if (cache) return cache;
  const ids = readdirSync(join(root, "tests")).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).filter((id) => MOCK_ID.test(id)).sort();
  cache = new Map(ids.map((id) => [id, JSON.parse(readFileSync(join(root, "tests", `${id}.json`), "utf8")) as StoredMock]));
  return cache;
}

function audioManifest() {
  if (manifestCache && Date.now() - manifestCache.checked < 1000) return manifestCache.turns;
  let mtime = 0;
  try { mtime = statSync(manifestPath).mtimeMs; } catch { return {}; }
  if (manifestCache?.mtime !== mtime) {
    try { manifestCache = { mtime, checked: Date.now(), turns: (JSON.parse(readFileSync(manifestPath, "utf8")) as { turns: Record<string, { file: string; duration_ms: number }> }).turns }; }
    catch { return manifestCache?.turns ?? {}; }
  } else manifestCache.checked = Date.now();
  return manifestCache.turns;
}

const clip = (part: MockPart, turnId: string) => audioManifest()[`${part.part_id}/${turnId}`] ?? null;
const testNumber = (id: string) => Number(id.slice(-2));
const coverUrl = (id: string, part: number) => `/listening-mocks/covers/mock-${String(testNumber(id)).padStart(2, "0")}/part-${part}.webp`;
/** "M29-MAP-01" → /listening-mocks/maps/M29_MAP_01.svg */
const mapUrl = (assetId?: string) => assetId ? `/listening-mocks/maps/${assetId.replace(/-/g, "_")}.svg` : undefined;
const optionLabel = (option: Option) => option.text && option.text !== option.key ? `${option.key} · ${option.text}` : option.key;

export function getStoredMock(id: string) {
  return MOCK_ID.test(id) ? tests().get(id) ?? null : null;
}

export function mockAudioReady(test: StoredMock) {
  return test.parts.every((part) => part.turns.every((turn) => clip(part, turn.turn_id)));
}

export function mockCatalog(): MockCatalogEntry[] {
  return [...tests().values()].map((test) => ({
    test_id: test.test_id, number: testNumber(test.test_id), title: `Listening Mock ${testNumber(test.test_id)}`,
    audio_ready: mockAudioReady(test), cover_url: coverUrl(test.test_id, 1), part_titles: test.parts.map((part) => part.title),
    duration_ms: test.parts.reduce((sum, part) => sum + part.turns.reduce((total, turn) => total + (clip(part, turn.turn_id)?.duration_ms ?? 0), 0), 0),
    parts: test.parts.map((part) => ({ number: part.part_number, title: part.title, cover_url: coverUrl(test.test_id, part.part_number),
      duration_ms: part.turns.reduce((sum, turn) => sum + (clip(part, turn.turn_id)?.duration_ms ?? 0), 0),
      question_types: [...new Set(part.questions.map((question) => question.question_type))], question_count: part.questions.length })),
  }));
}

export function toPublicMock(test: StoredMock): PublicMock {
  return {
    test_id: test.test_id, number: testNumber(test.test_id), title: `Listening Mock ${testNumber(test.test_id)}`,
    audio_ready: mockAudioReady(test), review_status: "draft_unreviewed",
    parts: test.parts.map((part) => {
      const questions = new Map(part.questions.map((question) => [question.question_id, question]));
      return {
        part_id: part.part_id, part_number: part.part_number, title: part.title, context: part.context, cover_url: coverUrl(test.test_id, part.part_number),
        turns: part.turns.map((turn) => ({ turn_id: turn.turn_id, audio_url: clip(part, turn.turn_id)?.file ?? null, duration_ms: clip(part, turn.turn_id)?.duration_ms ?? null })),
        groups: part.question_groups.map((group) => ({
          group_id: group.group_id, type: group.question_type, instructions: group.instructions_en,
          heading: group.layout_metadata?.heading ?? group.layout_metadata?.title ?? group.layout_metadata?.summary_title_en ?? group.layout_metadata?.chart_title_en,
          pre_read_seconds: group.pre_read_seconds ?? 20, prompt: group.question_type === "mcq_choose_two" ? group.prompt_en : undefined,
          options: group.options?.map(optionLabel), map_url: mapUrl(group.map_asset_id),
          // Plan questions answer with a letter from a short list rather than one radio per letter.
          letters: group.map_candidate_letters ?? (group.question_type === "map_labelling" ? part.questions.find((question) => question.group_id === group.group_id)?.options?.map((option) => option.key) : undefined),
          questions: group.question_ids.map((id) => questions.get(id)).filter((question): question is MockQuestion => Boolean(question)).map((question) => ({
            question_id: question.question_id, number: question.test_question_number, type: question.question_type, prompt: question.prompt_en,
            ...(question.options && group.question_type !== "mcq_choose_two" && group.question_type !== "map_labelling" ? { options: question.options.map(optionLabel) } : {}),
            ...(question.word_limit ? { word_limit: question.word_limit } : {}),
          })),
        })),
      };
    }),
  };
}

/** Answers are keyed by test question number (1–40). Option answers may arrive as "B · text". */
export function gradeMock(test: StoredMock, answers: Record<string, string>) {
  const results: MockResult[] = [];
  for (const part of test.parts) {
    const turns = new Map(part.turns.map((turn) => [turn.turn_id, turn]));
    for (const question of part.questions) {
      const raw = String(answers[String(question.test_question_number)] ?? "").slice(0, 300);
      const letter = /^([A-Z])(?:\s*·.*)?$/.exec(raw.trim())?.[1];
      const accepted = question.accepted_answers?.length ? question.accepted_answers : question.correct_answers;
      let graded: GradeResult;
      if (question.question_type === "mcq_choose_two") {
        // Independent credit: this question scores when its letter is among the two the learner chose.
        const group = part.question_groups.find((item) => item.group_id === question.group_id);
        const chosen = new Set((group?.question_ids ?? []).map((id) => part.questions.find((item) => item.question_id === id))
          .map((item) => /^([A-Z])/.exec(String(answers[String(item?.test_question_number)] ?? "").trim())?.[1]).filter(Boolean));
        graded = chosen.size === 0 ? { correct: false, reason: "empty_answer" } : chosen.has(accepted[0]) ? { correct: true, reason: "matched" } : { correct: false, reason: "not_in_accepted_answers" };
      } else {
        graded = gradeAnswer({ question_id: question.question_id, type: question.question_type, correct_answers: accepted, word_limit: question.word_limit }, letter && question.options ? letter : raw, "ielts");
      }
      results.push({
        question_id: question.question_id, part_number: part.part_number, number: question.test_question_number, ...graded,
        accepted_answers: accepted, explanation_vi: question.explanation_vi,
        evidence: question.evidence_turn_ids.map((id) => turns.get(id)).filter((turn): turn is MockTurn => Boolean(turn)).map((turn) => ({ turn_id: turn.turn_id, text_en: turn.text_en })),
      });
    }
  }
  return results.sort((a, b) => a.number - b.number);
}

/** Transcript per part, returned only with a submission. */
export function mockTranscript(test: StoredMock) {
  return test.parts.map((part) => {
    const labels = Object.fromEntries(part.speakers.map((speaker) => [speaker.speaker_id, speaker.role.split(":").pop()?.trim() || speaker.speaker_id]));
    return { part_number: part.part_number, turns: part.turns.map((turn) => ({ turn_id: turn.turn_id, speaker: labels[turn.speaker_id] ?? turn.speaker_id, text_en: turn.text_en })) };
  });
}
