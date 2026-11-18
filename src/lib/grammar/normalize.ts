import type { GrammarGuide, GrammarMistake, GrammarPracticeItem } from "./types";

/** Field shapes found across the six editorial level files; lessons use several authoring formats. */
type Loose = Record<string, unknown>;

export type SourceQuestion = {
  id: string; stage: string; type: string; instruction_vi?: string; prompt_en: string;
  translation_vi?: string | null; options?: string[]; hint_vi?: string;
  chunks?: (string | { text: string })[]; segments?: string[]; tokens?: (string | { text: string })[];
  correct_answer: string; accepted_answers?: string[]; explanation_correct_vi?: string;
  explanation_wrong_vi?: string; feedback_on_wrong_vi?: string; error_tag?: string;
  option_rationales_vi?: Record<string, string>; auto_gradable?: boolean;
  grading?: Record<string, unknown>; publishable: boolean;
};

export type SourceLesson = Loose & {
  id?: string; lesson_id?: string; title?: string; name_en?: string;
  sections?: Loose[]; learning_objectives?: string[];
  learn?: Loose & { title?: string; objectives_vi?: string[]; rules?: Loose[] };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const unique = <T,>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];

/** Notes written for teachers or editors (grading policy, release checks) are not shown to learners. */
const editorNote = /giáo viên|biên tập|accepted_answers|phát hành|trước khi công khai|(?:không|chỉ|được) chấm|chấm (?:sai|đúng|điểm)|đáp án thay thế/i;
/** Generic overview sentence the importer stamped on every A1 top-level lesson. */
const templateOverview = /^Chủ điểm .+: học từ tình huống thực tế/;
/** Raw rule identifiers such as SHOULD_HAVE leak into some objectives. */
const ruleCode = /\b[A-Z]{2,}(?:_[A-Z]+)+\b/;

function learnerNote(value: unknown) {
  const note = text(value);
  return note && !editorNote.test(note) ? note : "";
}

function mistake(value: unknown): GrammarMistake | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Loose;
  const wrong = text(item.wrong);
  if (!wrong) return null;
  return { wrong, correct: text(item.correct), why: text(item.why_vi) || text(item.reason_vi) || text(item.explanation_vi) };
}

function example(value: unknown) {
  if (typeof value === "string") return value.trim() ? { en: value.trim() } : null;
  if (!value || typeof value !== "object") return null;
  const item = value as Loose;
  const en = text(item.en) || text(item.example_en) || text(item.example);
  if (!en) return null;
  const vi = text(item.vi) || text(item.example_vi) || text(item.translation);
  return vi ? { en, vi } : { en };
}

const columnNames: Record<string, string> = { pronoun: "Đại từ", meaning: "Nghĩa", example: "Ví dụ", translation: "Dịch", form: "Dạng", use: "Cách dùng" };

function table(value: unknown) {
  const rows = list(value).filter((row): row is Loose => Boolean(row) && typeof row === "object");
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  return { columns: keys.map((key) => columnNames[key] ?? key), rows: rows.map((row) => keys.map((key) => text(row[key]))) };
}

/** A formula that is only an upper-case rule label ("SHOULD HAVE") repeats the heading, so it is dropped. */
function formula(value: unknown) {
  const pattern = text(value);
  return /[a-z+/…(]/.test(pattern) ? pattern : "";
}

function section(part: Loose): GrammarGuide["sections"][number] {
  return {
    heading: text(part.heading) || text(part.heading_en) || text(part.function_vi) || "Quy tắc",
    formula: formula(part.formula ?? part.formula_or_pattern ?? part.pattern),
    explanation: text(part.explanation_vi) || text(part.vi) || (part.heading || part.heading_en ? text(part.function_vi) : ""),
    examples: [...list(part.examples), ...(part.example_en ? [{ en: part.example_en, vi: part.example_vi }] : [])].map(example).filter((item) => item !== null),
    points: [],
    table: table(part.items),
    mistake: mistake(part.common_mistake),
    note: learnerNote(part.exception_note_vi ?? part.note_vi),
  };
}

/** A1-10 to A1-30 keep their rule at the lesson's top level instead of in sections. */
function topLevelSections(lesson: SourceLesson): GrammarGuide["sections"] {
  const intro = example(lesson.example);
  const points = list(lesson.micro_rules).flatMap((rule) => {
    if (typeof rule === "string") return rule.trim() ? [{ text: rule.trim() }] : [];
    if (!rule || typeof rule !== "object") return [];
    const item = rule as Loose;
    const ruleText = text(item.rule_vi) || text(item.rule);
    const sample = example(item);
    return ruleText ? [{ text: ruleText, ...(sample ?? {}) }] : [];
  });
  const sections: GrammarGuide["sections"] = [];
  if (lesson.formula || intro) sections.push({ heading: "Công thức", formula: formula(lesson.formula), explanation: "", examples: intro ? [intro] : [], points: [], table: null, mistake: null, note: "" });
  if (points.length) sections.push({ heading: "Quy tắc cần nhớ", formula: "", explanation: "", examples: [], points, table: null, mistake: null, note: "" });
  return sections;
}

export function normalizeGuide(lesson: SourceLesson): GrammarGuide {
  const learn = lesson.learn ?? {};
  const parts = lesson.sections ?? learn.rules ?? [];
  const overview = [text(learn.overview_vi), text(lesson.overview_vi)].find((value) => value && !templateOverview.test(value)) ?? "";
  const mistakes = [lesson.common_errors, lesson.additional_common_errors, learn.misconceptions, learn.common_mistakes, learn.common_errors_vi]
    .flatMap(list).map(mistake).filter((item) => item !== null);
  const caveats = [lesson.exceptions, lesson.usage_caveats_vi, lesson.exception_note, learn.caveats_vi, learn.exception_notes_vi,
    learn.usage_notes_and_exceptions_vi, learn.exceptions_and_usage_notes_vi, learn.exceptions_and_register_notes_vi]
    .flatMap(list).map(learnerNote).filter(Boolean);
  return {
    code: text(lesson.id) || text(lesson.lesson_id),
    title: text(lesson.title) || text(learn.title) || text(lesson.name_en),
    overview,
    objectives: (lesson.learning_objectives ?? learn.objectives_vi ?? []).filter((objective) => !ruleCode.test(objective)),
    sections: parts.length ? parts.map(section) : topLevelSections(lesson),
    mistakes: unique(mistakes, (item) => item.wrong),
    caveats: unique(caveats, (item) => item),
  };
}

/** Orderable chunks; a few ordering questions only list them in the prompt as "a / b / c". */
function chunks(question: SourceQuestion) {
  const given = (question.chunks ?? question.segments ?? question.tokens ?? []).map((chunk) => typeof chunk === "string" ? chunk : chunk.text);
  if (given.length || !/^sentence_order/.test(question.type) || !question.prompt_en.includes(" / ")) return { chunks: given, derived: false };
  return { chunks: question.prompt_en.split(" / ").map((chunk) => chunk.trim()).filter(Boolean), derived: true };
}

export function normalizeItem(question: SourceQuestion): GrammarPracticeItem {
  const order = chunks(question);
  return {
    id: question.id,
    stage: question.stage as GrammarPracticeItem["stage"],
    type: question.type === "fill" ? "fill_blank" : question.type === "sentence_order" ? "sentence_ordering" : question.type as GrammarPracticeItem["type"],
    instruction: question.instruction_vi ?? "",
    prompt: order.derived ? "Sắp xếp các cụm thành một câu đúng." : question.prompt_en,
    translation: question.translation_vi ?? null,
    options: question.options ?? null,
    chunks: order.chunks,
    hint: question.hint_vi ?? null,
    publishable: question.publishable,
  };
}

/** Some rationales quote the learner's answer through an unfilled template slot such as {student_answer} or {team}. */
export function fillAnswer(message: string, answer: string) {
  return message.replace(/“[^”]*\{[a-z_]+\}[^”]*”/g, `“${answer}”`).replace(/\{[a-z_]+\}/g, answer);
}

/** Rationales that only restate the target answer; the lesson-level wrong-answer note explains more. */
const genericRationale = /không khớp dạng từ hoặc ý nghĩa đã giới hạn trong đề/;

export function wrongFeedback(question: SourceQuestion, answer: string) {
  const rationale = question.option_rationales_vi?.[answer];
  const message = rationale && !genericRationale.test(rationale) ? rationale
    : question.feedback_on_wrong_vi ?? question.explanation_wrong_vi ?? rationale ?? "";
  return fillAnswer(message, answer);
}
