/*
 * Strict format review for Reading and Listening papers, derived from the owner's reference tests.
 * The rules, their codes and severities are documented in docs/IELTS_FORMAT_RULES.md.
 */
import type { ExamContent, ExamQuestion } from "./schema";

export type FormatFinding = { code: string; severity: "error" | "warning"; message: string; question?: number };
export type FormatScope = "full" | "part";

type Kind = "completion" | "mcq" | "many" | "tfng" | "ynng" | "headings" | "match-info" | "labelling" | "matching" | "other";

export function kindOf(type: string): Kind {
  if (/completion|short[_-]answer/.test(type)) return "completion";
  if (/multiple[_-]answers|multiple[_-]choice[_-]many/.test(type)) return "many";
  if (/^multiple[_-]choice$/.test(type)) return "mcq";
  if (/true[_-]false/.test(type)) return "tfng";
  if (/yes[_-]no/.test(type)) return "ynng";
  if (/headings/.test(type)) return "headings";
  if (/matching[_-]information/.test(type)) return "match-info";
  if (/labelling/.test(type)) return "labelling";
  if (/matching|classification/.test(type)) return "matching";
  return "other";
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** The word limit printed for a question, from its wordLimit or its rubric. */
export function wordLimit(question: Pick<ExamQuestion, "wordLimit" | "instructions">) {
  const text = `${question.wordLimit ?? ""} ${question.instructions}`.toUpperCase();
  const match = /(ONE|TWO|THREE|FOUR) WORDS?/.exec(text);
  if (!match) return null;
  return { words: ["ONE", "TWO", "THREE", "FOUR"].indexOf(match[1]) + 1, number: /AND\/OR A NUMBER|OR A NUMBER/.test(text) };
}

/** True when an answer respects a limit. "AND/OR A NUMBER" allows one number on top of the words;
 *  without it, a number counts as a word. */
export function fitsLimit(answer: string, limit: { words: number; number: boolean }) {
  // A run of digit groups such as a phone number ("0800 555 118") is one number.
  const tokens = answer.trim().replace(/(\d)\s+(?=\d)/g, "$1").split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (!limit.number) return tokens.length <= limit.words;
  const numbers = tokens.filter((token) => /\d/.test(token)).length;
  return numbers <= 1 && tokens.length - numbers <= limit.words;
}

const hasBlank = (prompt: string) => /_{3,}|…{1,}|\.{4,}|\(\s*\d+\s*\)|\b\d+\s*_{2,}|\{\{gap\}\}/.test(prompt);
// Same keys as qOptionKey in schema.ts ("G — text", "iii — text", " — B. text", "C. text"); kept local so this
// file has no relative value imports and runs under node --experimental-strip-types in the audit script.
const optionKey = (option: string) => {
  const text = option.trim();
  return /^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—/.exec(text)?.[1] ?? /^—\s*([A-Z])\.\s/.exec(text)?.[1] ?? /^([A-Z])\.\s/.exec(text)?.[1] ?? text;
};

export function checkFormat(skill: "Reading" | "Listening", content: ExamContent, scope: FormatScope): FormatFinding[] {
  const out: FormatFinding[] = [];
  const add = (code: string, severity: FormatFinding["severity"], message: string, question?: number) => out.push({ code, severity, message, question });
  const questions = content.sections.flatMap((section) => section.questions);

  // ---- general -----------------------------------------------------------------------------------
  const numbers = questions.map((q) => q.number);
  const first = Math.min(...numbers);
  if (numbers.some((n, i) => n !== first + i)) add("G6", "error", `Questions are not numbered continuously (${numbers.join(",")})`);
  const prompts = new Map<string, number>();
  for (const q of questions) {
    const kind = kindOf(q.type);
    if (!q.prompt.trim() || !q.answers.length || q.answers.every((a) => !a.trim())) add("G1", "error", "Missing prompt or answer", q.number);
    if (!q.instructions.trim()) add("G2", "error", "No rubric/instructions printed for this question", q.number);
    if (kind === "completion") {
      const limit = wordLimit(q);
      if (!limit && !q.options.length) add("G3", "error", "Completion question without a word limit", q.number);
      else if (limit && !q.options.length) {
        const fitting = q.answers.filter((answer) => fitsLimit(answer, limit));
        if (!fitting.length) add("G3", "error", `Answer "${q.answers[0]}" breaks the word limit`, q.number);
        else if (fitting.length < q.answers.length) add("G3", "warning", `Alternative answer exceeds the word limit: ${q.answers.filter((a) => !fitsLimit(a, limit)).join(" / ")}`, q.number);
      }
      if (!/short[_-]answer/.test(q.type) && !hasBlank(q.prompt)) add("G4", "error", "Completion prompt has no gap", q.number);
      if (q.answers.some((answer) => answer.length > 3 && normalize(q.prompt).includes(normalize(answer)))) add("G7", "warning", "The prompt already contains the answer", q.number);
    }
    if (q.options.length && ["mcq", "many", "headings", "match-info", "labelling", "matching"].includes(kind)) {
      const keys = q.options.map(optionKey);
      if (q.answers.some((answer) => !keys.includes(optionKey(answer)) && !q.options.includes(answer))) add("G5", "error", `Answer ${q.answers.join("/")} is not one of the options`, q.number);
    }
    const key = normalize(q.prompt);
    if (!q.group && prompts.has(key) && kind !== "matching" && kind !== "labelling") add("G8", "warning", `Same prompt as question ${prompts.get(key)}`, q.number);
    prompts.set(key, q.number);
  }

  // ---- Choose TWO / THREE ------------------------------------------------------------------------
  const groups = new Map<string, ExamQuestion[]>();
  for (const q of questions) if (q.group) groups.set(q.group, [...(groups.get(q.group) ?? []), q]);
  for (const q of questions) if (kindOf(q.type) === "many" && !q.group) add(skill === "Listening" ? "L4" : "R6", "error", "Choose TWO/THREE stored as one question: it must be one question per letter (one mark each)", q.number);
  for (const members of groups.values()) {
    const size = members.length;
    const options = members[0].options.length;
    const code = skill === "Listening" ? "L4" : "R6";
    if (size < 2 || size > 3) add(code, "error", `Choose-many group has ${size} question(s)`, members[0].number);
    else if (options !== (size === 2 ? 5 : 7)) add(code, "error", `Choose ${size === 2 ? "TWO" : "THREE"} needs ${size === 2 ? 5 : 7} options, has ${options}`, members[0].number);
    if (new Set(members.map((m) => optionKey(m.answers[0] ?? ""))).size !== size) add(code, "error", "Choose-many answers must all be different", members[0].number);
  }

  // ---- skill rules -------------------------------------------------------------------------------
  const kindsIn = (list: ExamQuestion[]) => list.map((q) => kindOf(q.type));
  if (skill === "Listening") {
    if (scope === "full") {
      if (content.sections.length !== 4) add("L1", "error", `Listening test has ${content.sections.length} parts`);
      content.sections.forEach((section, index) => {
        const expected = Array.from({ length: 10 }, (_, i) => index * 10 + 1 + i).join(",");
        if (section.questions.map((q) => q.number).join(",") !== expected) add("L1", "error", `Part ${index + 1} must hold questions ${index * 10 + 1}–${index * 10 + 10}`);
      });
    }
    let total = 0;
    content.sections.forEach((section, index) => {
      const part = scope === "full" ? index + 1 : Math.ceil((section.questions[0]?.number ?? 1) / 10);
      if (!section.audioUrl) add("L2", "error", `Part ${part} has no audio`);
      const kinds = kindsIn(section.questions);
      const gaps = kinds.filter((kind) => kind === "completion").length;
      for (const q of section.questions) {
        const kind = kindOf(q.type);
        if (kind === "mcq" && q.options.length !== 3) add("L3", "error", `Listening MCQ needs 3 options (A–C), has ${q.options.length}`, q.number);
        if (kind === "labelling" && (!q.mediaUrl || q.options.length <= 1)) add("L5", "error", "Labelling question needs its picture and letter options", q.number);
        if (kind === "matching" && q.options.length < 3) add("L6", "error", `Matching needs at least 3 options, has ${q.options.length}`, q.number);
        if (kind === "completion") {
          const limit = wordLimit(q);
          if (limit && limit.words > 3) add("L10", "warning", "Word limit above three words is unusual", q.number);
          if (part === 4 && limit && limit.words > 2) add("L10", "warning", "Part 4 notes normally take ONE WORD ONLY", q.number);
        }
      }
      if (section.transcript) {
        const count = words(section.transcript.replace(/^[A-Z][\w .'-]{0,30}:/gm, ""));
        total += count;
        const [min, max] = [[600, 1000], [600, 950], [700, 1100], [600, 950]][part - 1] ?? [600, 1100];
        if (count < min || count > max) add("L11", "warning", `Part ${part} transcript has ${count} words (real tests: ${min}–${max})`);
      }
      if (scope === "full") {
        if (part === 1 && gaps < 6) add("L7", "warning", `Part 1 has ${gaps}/10 completion questions (real tests: mostly a form or notes)`);
        if (part === 4 && gaps < 7) add("L8", "warning", `Part 4 has ${gaps}/10 note-completion questions`);
        if ((part === 2 || part === 3) && (gaps > 6 || kinds.every((kind) => kind === "completion"))) add("L9", "warning", `Part ${part} is mostly gap-filling (${gaps}/10); real tests use letters (MCQ, matching, maps)`);
      }
    });
    if (scope === "full") {
      if (total && total < 2800) add("L12", "warning", `Transcripts total ${total} words (real tests: about 3,000–3,300)`);
      const distinct = new Set(kindsIn(questions)).size;
      if (distinct < 4) add("L13", "warning", `Only ${distinct} question types in the whole test`);
    }
  } else {
    if (scope === "full") {
      if (content.sections.length !== 3) add("R1", "error", `Reading test has ${content.sections.length} passages`);
      if (questions.length !== 40) add("R1", "error", `Reading test has ${questions.length} questions`);
      content.sections.forEach((section, index) => {
        if (section.questions.length < 12 || section.questions.length > 14) add("R1", "error", `Passage ${index + 1} has ${section.questions.length} questions (real tests: 13 / 13 / 14)`);
      });
    }
    content.sections.forEach((section, index) => {
      const count = words(section.passage);
      if (count < 650 || count > 1300) add("R2", "error", `Passage ${index + 1} has ${count} words (real tests: 730–1,270)`);
      const lettered = /(^|\n)\s*(\*\*)?(\[[A-H]\]|\([A-H]\)|[A-H][\s.)]|Paragraph [A-H])/.test(section.passage);
      const kinds = kindsIn(section.questions);
      for (const q of section.questions) {
        const kind = kindOf(q.type);
        if (kind === "mcq" && q.options.length !== 4) add("R3", "error", `Reading MCQ needs 4 options (A–D), has ${q.options.length}`, q.number);
        if (kind === "tfng" && !q.answers.every((a) => ["TRUE", "FALSE", "NOT GIVEN"].includes(a.trim().toUpperCase()))) add("R4", "error", `TRUE/FALSE/NOT GIVEN answer is "${q.answers.join("/")}"`, q.number);
        if (kind === "ynng" && !q.answers.every((a) => ["YES", "NO", "NOT GIVEN"].includes(a.trim().toUpperCase()))) add("R4", "error", `YES/NO/NOT GIVEN answer is "${q.answers.join("/")}"`, q.number);
        // Paragraph letters are needed only when the choices are paragraphs, not named sections ("A — Willow Court").
        const byParagraph = kind === "headings" || q.options.every((option) => /^\s*—?\s*[A-H]\s*(—\s*Paragraph [A-H]|[.)]?)\s*$/i.test(option));
        if ((kind === "headings" || kind === "match-info") && byParagraph && !lettered) add("R5", "error", "Paragraph questions need a passage with lettered paragraphs (A, B, C…)", q.number);
        if (kind === "completion") { const limit = wordLimit(q); if (limit && limit.words > 3) add("R9", "warning", "Word limit above three words is unusual", q.number); }
      }
      const headings = section.questions.filter((q) => kindOf(q.type) === "headings");
      if (headings.length && !headings[0].options.length) add("R5", "error", "List of Headings is not given as answer choices", headings[0].number);
      else if (headings.length && headings[0].options.length <= headings.length) add("R5", "error", `List of Headings needs more headings (${headings[0].options.length}) than questions (${headings.length})`, headings[0].number);
      if (scope === "full") {
        if (new Set(kinds).size < 2) add("R7", "warning", `Passage ${index + 1} uses only one question type`);
        if (index === 0 && !kinds.some((kind) => kind === "tfng" || kind === "completion")) add("R8", "warning", "Passage 1 normally has TRUE/FALSE/NOT GIVEN or completion questions");
        if (index === 2 && !kinds.some((kind) => kind === "mcq" || kind === "ynng")) add("R8", "warning", "Passage 3 normally has MCQ A–D or YES/NO/NOT GIVEN questions");
      }
    });
  }
  return out;
}
