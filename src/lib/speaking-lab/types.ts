/*
 * Speaking Lab: 16 skill routes, 24 Part 1/2 topic lessons, 80 Part 3 lessons (L57–L60) and 24 pronunciation
 * lessons (L39–L40) from the M10-L80 curriculum handoff.
 * The public catalog (content/speaking-lab/catalog.json) has titles and task shapes only; question text,
 * coaching and models are private and reach the learner one stage at a time through the release route.
 */
export const SPEAKING_BASE = "/app/self-study/speaking";
export const SPEAKING_API = "/api/self-study/speaking";
export const speakingAudioUrl = (itemId: string) => `${SPEAKING_API}/audio/${encodeURIComponent(itemId)}`;
export const AUDIO_ID = /^SPK-M10L39-LS\d{2}$/;

export type Criterion = "FC" | "LR" | "GR" | "PR";
export const criterionOrder: Criterion[] = ["FC", "LR", "GR", "PR"];
export const criterionInfo: Record<Criterion, { name: string; en: string; about: string; tone: string; soft: string }> = {
  FC: { name: "Trôi chảy & mạch lạc", en: "Fluency & Coherence", about: "Trả lời đúng ý, nối ý, kể theo trình tự", tone: "#2f7d6d", soft: "#e3f3ee" },
  LR: { name: "Từ vựng", en: "Lexical Resource", about: "Từ cụ thể, diễn đạt lại, kết hợp từ, sắc thái", tone: "#3b6fb6", soft: "#e5eefb" },
  GR: { name: "Ngữ pháp", en: "Grammatical Range & Accuracy", about: "Thì, so sánh, điều kiện, mệnh đề phức", tone: "#8a5bb8", soft: "#f0e8f8" },
  PR: { name: "Phát âm", en: "Pronunciation", about: "Âm cuối, trọng âm, ngắt cụm, ngữ điệu", tone: "#c0623b", soft: "#fbece4" },
};

export type SpeakingSkill = { id: string; criterion: Criterion; title_vi: string; title_en: string; objective_vi: string; objective_en: string };

export type SpeakingTask = {
  id: string; phase: string; label: string; hint: string; part: 1 | 2 | 3;
  mode: "short_spoken_answer" | "full_cue" | "micro_spoken_drill" | "listen_choice";
  prep_seconds: number; expected_seconds: { min: number; max: number }; gap_days: number;
  /** Listening check only: the words to choose between; the right one comes with the tip. */
  items?: { id: string; options: { id: string; word: string }[] }[];
};

export type SpeakingUnit = {
  id: string; kind: "skill" | "topic" | "part3" | "pron"; part: 1 | 2 | 3; criterion?: Criterion; skills: string[];
  /** Part 3 series (L57–L60) or pronunciation module code. */
  series?: string; module?: string;
  title_vi: string; title_en: string; topic_en?: string; target_vi?: string; level?: string; order?: number;
  tasks: SpeakingTask[];
};

export type SpeakingCatalog = {
  source: { package: string; milestones: string[]; note_vi: string };
  levels: { id: string; label: string; guidance_vi: string }[];
  skills: SpeakingSkill[];
  series: { id: string; title_vi: string; about_vi: string }[];
  modules: { code: string; title_vi: string; title_en: string; contrast: string }[];
  units: SpeakingUnit[];
};

/* ── Private content, released stage by stage ── */

export type SpeakingGuide = { title_vi?: string; objective_vi?: string; steps_vi?: string[]; caution_vi?: string; self_check_vi?: string };
export type SpeakingRepair = {
  title_vi?: string; title_en?: string; goal_vi?: string; goal_en?: string;
  steps?: { label?: string; en?: string; vi?: string }[]; ideas_vi?: string; useful_language_en?: string; self_check_vi?: string[];
};
export type SpeakingMove = { phase: string; title_vi: string; instruction_vi?: string; phrases?: string[] };
export type SpeakingStrategy = { title_vi?: string; title_en?: string; guidance_vi?: string; example_en?: string };
export type SpeakingPron = { goal_vi?: string; why_vi?: string; contrast?: string; tip_vi?: string; mistake_vi?: string; steps?: { label?: string; vi?: string }[] };
export type SpeakingTeach = {
  guide?: SpeakingGuide; repair?: SpeakingRepair; skills?: (SpeakingGuide & { id: string })[];
  moves?: SpeakingMove[]; strategies?: SpeakingStrategy[]; pron?: SpeakingPron; self_check_vi?: string[];
};
export type SpeakingPrompt = { prompt_en: string; cue_bullets?: string[]; instructions_vi?: string; model_en?: string };
export type SpeakingTip = {
  tip_vi?: string; tip_en?: string; focus_collocation_en?: string; error_to_avoid_en?: string; phrases?: string[]; contrast_en?: string; note_vi?: string;
  /** Listening check: item id → the option that was played. */
  answers?: Record<string, string>;
};
export type SpeakingCoaching = {
  focus_vi?: string; focus_en?: string; weak_en?: string; improved_en?: string; analysis_vi?: string; reflection_vi?: string; reflection_en?: string;
  mistakes_vi?: string[]; self_review_vi?: string[]; steps_vi?: string[];
};
export type SpeakingCard = {
  teach_focus_vi?: string; teach_focus_en?: string; what_to_prepare_vi?: string; target_collocations_EN?: string[];
  common_weak_response_en?: string; improved_phrase_en?: string; why_improvement_vi?: string;
  learning_steps?: { phase: string; how_to_practise_vi?: string; how_to_practise_en?: string; topic_specific_vi?: string }[];
  self_review_vi?: string[]; pronunciation_note_vi?: string;
};
export type SpeakingModel = {
  model_en?: string; model_purpose_vi?: string; critical_improvement_en?: string; critical_improvement_vi?: string; self_review_questions_vi?: string[];
  weak_en?: string; improved_en?: string; analysis_vi?: string; extra?: { label: string; text: string; en?: boolean }[];
};

export type SpeakingPrivateUnit = {
  teach: SpeakingTeach;
  prompts: Record<string, SpeakingPrompt>;
  after_task: Record<string, SpeakingTip>;
  after_first: { coaching?: SpeakingCoaching; card?: SpeakingCard };
  after_all: { model?: SpeakingModel };
};
export type SpeakingPrivateFile = { version: 1; units: Record<string, SpeakingPrivateUnit> };

/** What the learner may see now, given their saved progress. */
export type SpeakingRelease = {
  teach: SpeakingTeach;
  prompts: Record<string, SpeakingPrompt>;
  tips: Record<string, SpeakingTip>;
  coaching?: SpeakingCoaching;
  card?: SpeakingCard;
  model?: SpeakingModel;
  current: string | null;
};

/* ── Learner progress (one writing_drafts row per unit) ── */

export type SpeakingState = {
  spk: 1;
  /** Task id → when the learner finished speaking it. */
  done: Record<string, string>;
  /** Seconds of the kept recording, per task. */
  seconds: Record<string, number>;
  /** The browser's transcript of the kept take, when it could make one. */
  transcript: Record<string, string>;
  notes: Record<string, string>;
  /** `${taskId}:${index}` → self-check ticked. */
  checks: Record<string, boolean>;
  /** Listening check: `${taskId}:${itemId}` → the option the learner chose. */
  choices: Record<string, string>;
  updatedAt: number;
};

export const speakingDraftSlug = (unitId: string) => `spk-lab:${unitId}`;
export const emptySpeakingState = (): SpeakingState => ({ spk: 1, done: {}, seconds: {}, transcript: {}, notes: {}, checks: {}, choices: {}, updatedAt: 0 });

const record = <T>(value: unknown, keep: (item: unknown) => item is T): Record<string, T> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, T] => keep(entry[1])));
};
const isString = (item: unknown): item is string => typeof item === "string";
const isNumber = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item);
const isBoolean = (item: unknown): item is boolean => typeof item === "boolean";

export function parseSpeakingState(value: unknown): SpeakingState | null {
  if (!value) return null;
  try {
    const parsed = (typeof value === "string" ? JSON.parse(value) : value) as Partial<SpeakingState>;
    if (parsed.spk !== 1) return null;
    return {
      spk: 1, done: record(parsed.done, isString), seconds: record(parsed.seconds, isNumber), transcript: record(parsed.transcript, isString),
      notes: record(parsed.notes, isString), checks: record(parsed.checks, isBoolean), choices: record(parsed.choices, isString), updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch { return null; }
}

export const unitDone = (unit: SpeakingUnit, state: SpeakingState | undefined) => Boolean(state) && unit.tasks.every((task) => state!.done[task.id]);
export const tasksDone = (unit: SpeakingUnit, state: SpeakingState | undefined) => state ? unit.tasks.filter((task) => state.done[task.id]).length : 0;

/**
 * The release rule from the handoff, in one place: a task's question opens once every earlier task is done;
 * its tip opens after the learner has spoken it; the coaching card after the first task; the model after all.
 */
export function releaseFor(unit: SpeakingUnit, content: SpeakingPrivateUnit, state: SpeakingState): SpeakingRelease {
  const prompts: Record<string, SpeakingPrompt> = {};
  const tips: Record<string, SpeakingTip> = {};
  let current: string | null = null;
  for (const task of unit.tasks) {
    const prompt = content.prompts[task.id];
    if (prompt) prompts[task.id] = prompt;
    if (!state.done[task.id]) { current = task.id; break; }
    if (content.after_task[task.id]) tips[task.id] = content.after_task[task.id];
  }
  const first = unit.tasks[0];
  const release: SpeakingRelease = { teach: content.teach, prompts, tips, current };
  if (first && state.done[first.id]) {
    if (content.after_first.coaching) release.coaching = content.after_first.coaching;
    if (content.after_first.card) release.card = content.after_first.card;
  }
  if (current === null && content.after_all.model) release.model = content.after_all.model;
  return release;
}

export const partLabel = (part: number) => `Part ${part}`;
const minutes = (seconds: number) => String(Math.round((seconds / 60) * 2) / 2).replace(".", ",");
export const secondsLabel = (range: { min: number; max: number }) => range.max >= 90 ? `${minutes(range.min)}–${minutes(range.max)} phút` : `${range.min}–${range.max} giây`;
