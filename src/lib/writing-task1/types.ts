/** Writing Task 1 Lab: shapes and labels shared by the server routes and the learner pages. */

export const TASK1_BASE = "/app/self-study/writing-task-1";
export const TASK1_API = "/api/self-study/writing-task-1";

export type Task1Stage = "foundation" | "developing" | "advanced";
export type Task1Kind = "guided" | "process";

export type ChartSeries = { name: string; values: number[] };
export type CartesianSpec = { kind: "line" | "bar"; title: string; x_axis: { label?: string; categories: string[] }; y_axis?: { label?: string; unit?: string }; series: ChartSeries[] };
/** A process drawn from data (T1-DATA-v1): numbered stages joined by arrows, optionally a cycle or a branch. */
export type ProcessSpec = {
  kind: "process"; title: string; process_type?: "linear" | "cycle" | "branch";
  stages: { id: string; label_en: string; icon_hint?: string }[];
  edges: { from: string; to: string; label_en?: string }[];
};
/** A map drawn from data (T1-DATA-v1): features on a 12×12 grid, north at the top, one panel per date. */
export type MapFeature = { id: string; name: string; type: string; x: number; y: number; w: number; h: number };
export type MapSpec = { kind: "map"; title: string; panels: { label: string; features: MapFeature[] }[]; compass?: boolean };
export type ChartSpec =
  | CartesianSpec
  | { kind: "pie"; title: string; x_axis: { categories: string[] }; series: ChartSeries[] }
  | { kind: "table"; title: string; rows: string[][] }
  | { kind: "mixed"; title: string; panels: ChartSpec[] }
  | ProcessSpec
  | MapSpec;
export type Task1Visual = { type: "chart"; spec: ChartSpec } | { type: "image"; src: string; alt: string };

export type Task1Check = { id: string; kind: "mcq" | "tf"; prompt: string; prompt_vi?: string; options: { id: string; text: string }[] };
export type Task1Drill = { id: string; mode: string; question_vi: string; hint_vi: string };

/* Fields the T1-DATA-v1 lessons add (docs/WRITING_TASK1_DATA_PROMPT.md). All optional: the F37 lessons lack them. */
export type Task1Keyword = { en: string; vi: string; example_en?: string };
export type Task1Phrase = { phrase_en: string; meaning_vi: string; example_en?: string };
export type Task1Mistake = { wrong_en: string; right_en: string; why_vi: string };
export type Task1ScaffoldPart = {
  frame_en?: string; answers?: string[];
  choose?: { a_en: string; b_en: string; better: "a" | "b"; why_vi: string };
  task_vi?: string;
};
export type Task1Part = "intro" | "overview" | "body1" | "body2";
export type Task1ChecklistItem = { criterion: string; item_vi: string; if_no_vi?: string };

export type Task1Lesson = {
  id: string; kind: Task1Kind; group: string; group_label: string; subtopic: string; content_sha256: string;
  stage: Task1Stage; target_range: string; title: string; question: string; minutes: number; unit: string; visual: Task1Visual;
  facts: { en: string; vi: string }[]; phrases: string[]; mistake: { en: string; vi: string } | null;
  steps: { title_vi: string; instruction_vi: string; minutes: number }[];
  checks: Task1Check[]; drills: Task1Drill[]; has_model: boolean;
  question_vi?: string; gist_vi?: string; keywords?: Task1Keyword[];
  language?: Task1Phrase[]; mistakes?: Task1Mistake[];
  scaffold?: Partial<Record<Task1Part, Task1ScaffoldPart>>;
  checklist?: Task1ChecklistItem[];
};
export type Task1LessonSummary = Pick<Task1Lesson, "id" | "kind" | "group" | "group_label" | "subtopic" | "stage" | "target_range" | "title" | "question" | "minutes" | "has_model"> & { check_count: number; drill_count: number };

export type Task1CheckResult = { correct: boolean; answer: string; explanation_vi: string };
export type Task1DrillAnswer = { answer_guide: string; explanation_vi: string };
/** A model sentence with the reason it is written that way (T1-DATA-v1 annotated models). */
export type Task1ModelSentence = { en: string; note_vi?: string; highlight?: string[] };
export type Task1ModelParagraph = string | { role: Task1Part; sentences: Task1ModelSentence[] };
export type Task1Model = { paragraphs: Task1ModelParagraph[]; word_count: number; outline_vi?: string; explanation_vi?: string };
export type Task1Reveal = { drills: Record<string, Task1DrillAnswer>; model?: Task1Model | null };

export const partLabels: Record<Task1Part, string> = { intro: "Mở bài", overview: "Overview", body1: "Body 1", body2: "Body 2" };
const partOrder: Task1Part[] = ["intro", "overview", "body1", "body2"];
/** Model paragraphs as role + sentences, whether the data gives plain paragraphs or annotated ones. */
export function modelParagraphs(model: Task1Model): { role: Task1Part; sentences: Task1ModelSentence[] }[] {
  return model.paragraphs.map((paragraph, index) => typeof paragraph === "string"
    ? { role: partOrder[index] ?? "body2", sentences: [{ en: paragraph }] }
    : paragraph);
}

/** Foundation lessons show their model before the learner writes; later stages only after the report is saved. */
export const modelFirst = (lesson: Pick<Task1Lesson, "stage" | "has_model">) => lesson.stage === "foundation" && lesson.has_model;

/** A lesson counts as done once its writing is saved at the stage's length; reading and drills support it. */
export const lessonDone = (state: Task1State | undefined, stage: Task1Stage) => Boolean(state) && essaySaved(state as Task1State, stage);

/** What a learner has done in one lesson. It lives in the account's writing_drafts row (slug below). */
export type Task1State = {
  t1: 1;
  /** The option chosen for each reading check, and whether the server marked it right. */
  choices: Record<string, string>;
  results: Record<string, Task1CheckResult>;
  answers: Record<string, string>;
  /** When each drill answer was saved; the reference answer opens only after a save. */
  saved: Record<string, string>;
  essay: string;
  essaySavedAt?: string;
  checklist: Record<string, boolean>;
  updatedAt: number;
};

export const DRILL_MIN_CHARS = 3;
/**
 * What the last step asks for at each stage, following the package's stage checkpoints:
 * S01–S03 write an introduction and overview, S04–S05 a 100–150 word report, S06–S07 a full 150+ word report.
 * `min` is the saved length that completes the lesson and opens the model answer.
 */
export const writingTargets: Record<Task1Stage, { label: string; hint: string; goal: number; min: number }> = {
  foundation: { label: "Viết mở bài + Overview", hint: "2–3 câu, khoảng 50 từ", goal: 60, min: 30 },
  developing: { label: "Viết bài hoàn chỉnh", hint: "150 từ, khoảng 20 phút", goal: 150, min: 100 },
  advanced: { label: "Viết bài hoàn chỉnh", hint: "150+ từ, tự kiểm tra 4 tiêu chí", goal: 170, min: 150 },
};
export const task1DraftSlug = (lessonId: string) => `t1-lab:${lessonId}`;
export const countWords = (text: string) => (text.trim().match(/[A-Za-zÀ-ỹ0-9'’.,%-]+/g) ?? []).filter((word) => /[A-Za-zÀ-ỹ0-9]/.test(word)).length;

export function parseTask1State(value: string | null | undefined): Task1State | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Task1State>;
    if (parsed.t1 !== 1 || typeof parsed.answers !== "object" || !parsed.answers) return null;
    return {
      t1: 1, choices: parsed.choices ?? {}, results: parsed.results ?? {}, answers: parsed.answers, saved: parsed.saved ?? {},
      essay: typeof parsed.essay === "string" ? parsed.essay : "", essaySavedAt: parsed.essaySavedAt, checklist: parsed.checklist ?? {}, updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch { return null; }
}

/** A drill counts as done once a non-trivial answer was saved; the writing once it was saved at the stage's length. */
export const drillSaved = (state: Task1State, id: string) => Boolean(state.saved[id]) && (state.answers[id] ?? "").trim().length >= DRILL_MIN_CHARS;
export const essaySaved = (state: Task1State, stage: Task1Stage) => Boolean(state.essaySavedAt) && countWords(state.essay) >= writingTargets[stage].min;

export const stageInfo: Record<Task1Stage, { name: string; levels: string; tone: string; soft: string }> = {
  foundation: { name: "Nền tảng", levels: "S01–S03", tone: "#0a7f89", soft: "#e2f5f4" },
  developing: { name: "Phát triển", levels: "S04–S05", tone: "#2577c8", soft: "#e6f0fb" },
  advanced: { name: "Nâng cao", levels: "S06–S07", tone: "#d2524a", soft: "#fdeeec" },
};
export const stageOrder: Task1Stage[] = ["foundation", "developing", "advanced"];

export const groupLabels: Record<string, string> = {
  line: "Line graph", bar: "Bar chart", pie: "Pie chart", table: "Table", mixed: "Biểu đồ kết hợp", map: "Map", process: "Process",
};

export const drillModeLabels: Record<string, string> = {
  intro: "Mở bài", overview: "Overview", groups: "Chia nhóm Body", observe: "Quan sát", plan: "Dàn ý Body",
};

/** A self-check by the four Task 1 criteria; it is a checklist, not a score. */
export const reportChecklist: { id: string; criterion: string; text: string }[] = [
  { id: "ta-overview", criterion: "TA", text: "Có Overview rõ ràng nêu đặc điểm chính, không chỉ liệt kê số liệu." },
  { id: "ta-accuracy", criterion: "TA", text: "Mọi số liệu, mốc thời gian và vị trí khớp với hình; không suy đoán nguyên nhân." },
  { id: "ta-select", criterion: "TA", text: "Chọn lọc dữ kiện quan trọng và có so sánh, không kể hết mọi con số." },
  { id: "cc-groups", criterion: "CC", text: "Hai đoạn thân bài chia nhóm hợp lý, mỗi đoạn một ý." },
  { id: "cc-links", criterion: "CC", text: "Dùng từ nối và tham chiếu (while, by contrast, this figure…) tự nhiên." },
  { id: "lr-trend", criterion: "LR", text: "Từ vựng xu hướng và so sánh đa dạng, đúng đơn vị (%, thousand, tonnes…)." },
  { id: "gra-tense", criterion: "GRA", text: "Đúng thì theo thời gian của hình (quá khứ, hiện tại, dự báo) và bị động cho quy trình." },
  { id: "gra-check", criterion: "GRA", text: "Đã đọc lại để sửa mạo từ, số ít/số nhiều, giới từ với số liệu (by, to, at)." },
];
