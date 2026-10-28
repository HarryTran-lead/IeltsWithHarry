/*
 * What the Content Factory can write, one practice item per job: every Listening part, a Reading passage,
 * every Writing task and every Speaking part. Each kind has a model brief, an output schema, and a builder that
 * turns the model's reply into a question-bank draft and lists everything that keeps it from the real format
 * (docs/IELTS_FORMAT_RULES.md). Question groups rotate between the mixes seen in the owner's reference tests.
 */
import { z } from "zod";
import type { ExamQuestion, NormalizedExam } from "../ielts-bank/schema";
import { checkFormat, fitsLimit, wordLimit } from "../ielts-bank/format-rules";

export type TextSkill = "Listening" | "Reading" | "Writing" | "Speaking";
export type FactoryKind =
  | "listening_part1" | "listening_part2" | "listening_part3" | "listening_part4" | "reading_passage" | "reading_passage1" | "reading_passage2" | "reading_passage3"
  | "writing_task1_academic" | "writing_task1_general" | "writing_task2" | "speaking_part1" | "speaking_part2";

export const factoryKinds: Record<FactoryKind, { skill: TextSkill; label: string }> = {
  listening_part1: { skill: "Listening", label: "Listening Part 1" },
  listening_part2: { skill: "Listening", label: "Listening Part 2" },
  listening_part3: { skill: "Listening", label: "Listening Part 3" },
  listening_part4: { skill: "Listening", label: "Listening Part 4" },
  reading_passage: { skill: "Reading", label: "Reading passage" },
  reading_passage1: { skill: "Reading", label: "Reading Passage 1" },
  reading_passage2: { skill: "Reading", label: "Reading Passage 2" },
  reading_passage3: { skill: "Reading", label: "Reading Passage 3" },
  writing_task1_academic: { skill: "Writing", label: "Writing Task 1 (Academic)" },
  writing_task1_general: { skill: "Writing", label: "Writing Task 1 (General Training)" },
  writing_task2: { skill: "Writing", label: "Writing Task 2" },
  speaking_part1: { skill: "Speaking", label: "Speaking Part 1" },
  speaking_part2: { skill: "Speaking", label: "Speaking Part 2 and 3" },
};

/** The kind a bare skill means (admin "generate" without a kind, and older callers). */
export const defaultKind: Record<TextSkill, FactoryKind> = { Listening: "listening_part1", Reading: "reading_passage", Writing: "writing_task2", Speaking: "speaking_part2" };

// ---- question groups -------------------------------------------------------------------------------
type GroupType =
  | "form_completion" | "note_completion" | "table_completion" | "sentence_completion" | "summary_completion" | "flow_chart_completion"
  | "multiple_choice" | "multiple_answers" | "matching" | "true_false_not_given" | "yes_no_not_given"
  | "matching_headings" | "matching_information" | "matching_features" | "matching_sentence_endings";
type GroupPlan = { type: GroupType; count: number; limit?: string; box?: number };
const ONE_NUM = "ONE WORD AND/OR A NUMBER", ONE = "ONE WORD ONLY", TWO = "NO MORE THAN TWO WORDS";

/** Group mixes per kind, taken from the reference papers; the day number picks one. */
export const plans: Partial<Record<FactoryKind, GroupPlan[][]>> = {
  listening_part1: [
    [{ type: "form_completion", count: 10, limit: ONE_NUM }],
    [{ type: "note_completion", count: 6, limit: ONE_NUM }, { type: "multiple_choice", count: 4 }],
    [{ type: "table_completion", count: 5, limit: ONE_NUM }, { type: "note_completion", count: 5, limit: ONE_NUM }],
  ],
  listening_part2: [
    [{ type: "multiple_choice", count: 5 }, { type: "matching", count: 5, box: 7 }],
    [{ type: "matching", count: 4, box: 6 }, { type: "multiple_choice", count: 6 }],
    [{ type: "multiple_choice", count: 6 }, { type: "matching", count: 4, box: 6 }],
  ],
  listening_part3: [
    [{ type: "multiple_answers", count: 2 }, { type: "multiple_answers", count: 2 }, { type: "multiple_choice", count: 6 }],
    [{ type: "multiple_answers", count: 2 }, { type: "multiple_answers", count: 2 }, { type: "multiple_choice", count: 6 }],
    [{ type: "multiple_answers", count: 2 }, { type: "multiple_choice", count: 3 }, { type: "flow_chart_completion", count: 5, box: 8 }],
  ],
  listening_part4: [
    [{ type: "note_completion", count: 10, limit: ONE }],
    [{ type: "note_completion", count: 6, limit: ONE }, { type: "table_completion", count: 4, limit: ONE }],
  ],
  reading_passage: [
    [{ type: "true_false_not_given", count: 6 }, { type: "note_completion", count: 4, limit: ONE }, { type: "multiple_choice", count: 3 }],
    [{ type: "matching_headings", count: 6, box: 8 }, { type: "sentence_completion", count: 4, limit: TWO }, { type: "yes_no_not_given", count: 3 }],
    [{ type: "matching_information", count: 5 }, { type: "summary_completion", count: 4, limit: ONE }, { type: "multiple_choice", count: 4 }],
    [{ type: "matching_features", count: 5, box: 5 }, { type: "true_false_not_given", count: 4 }, { type: "matching_sentence_endings", count: 4, box: 6 }],
    [{ type: "multiple_answers", count: 2 }, { type: "multiple_answers", count: 2 }, { type: "yes_no_not_given", count: 5 }, { type: "sentence_completion", count: 4, limit: TWO }],
  ],
  reading_passage1: [
    [{ type: "true_false_not_given", count: 7 }, { type: "note_completion", count: 6, limit: ONE }],
    [{ type: "table_completion", count: 6, limit: ONE }, { type: "true_false_not_given", count: 7 }],
    [{ type: "note_completion", count: 8, limit: ONE }, { type: "true_false_not_given", count: 5 }],
  ],
  reading_passage2: [
    [{ type: "matching_headings", count: 6, box: 8 }, { type: "multiple_answers", count: 2 }, { type: "multiple_answers", count: 2 }, { type: "summary_completion", count: 3, limit: ONE }],
    [{ type: "matching_information", count: 5 }, { type: "matching_features", count: 4, box: 5 }, { type: "sentence_completion", count: 4, limit: ONE }],
  ],
  reading_passage3: [
    [{ type: "multiple_choice", count: 5 }, { type: "yes_no_not_given", count: 5 }, { type: "matching_sentence_endings", count: 4, box: 6 }],
    [{ type: "yes_no_not_given", count: 4 }, { type: "multiple_choice", count: 5 }, { type: "summary_completion", count: 5, limit: ONE }],
  ],
};

export const isReadingKind = (kind: FactoryKind) => kind.startsWith("reading_passage");
const passagePosition = (kind: FactoryKind) => kind === "reading_passage1" ? 1 : kind === "reading_passage2" ? 2 : kind === "reading_passage3" ? 3 : 1;

const isGap = (type: GroupType) => type.endsWith("_completion") && type !== "flow_chart_completion";
const usesBox = (plan: GroupPlan) => Boolean(plan.box) || plan.type === "matching_information";
const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

const describe: Record<GroupType, (plan: GroupPlan, skill: TextSkill) => string> = {
  form_completion: (p) => `form completion: ${p.count} lines of a booking or registration form titled in "heading"; each prompt is one labelled line with one gap, e.g. "Surname: ______" (word limit ${p.limit})`,
  note_completion: (p) => `note completion: ${p.count} lines of notes under the title in "heading"; each prompt is one note line with one gap (word limit ${p.limit})`,
  table_completion: (p) => `table completion: ${p.count} table cells, each prompt names its row and column then the gap, e.g. "Saturday class – cost: £______" (word limit ${p.limit})`,
  sentence_completion: (p) => `sentence completion: ${p.count} sentences, each with one gap (word limit ${p.limit})`,
  summary_completion: (p) => `summary completion: ${p.count} consecutive sentences of a summary titled in "heading", each with one gap (word limit ${p.limit})`,
  flow_chart_completion: (p) => `flow-chart completion with a box: put ${p.box} short options in "box" (no letters); each of the ${p.count} prompts is a flow-chart step with one gap; the answer is the letter of the box option`,
  multiple_choice: (_p, skill) => `${_p.count} multiple-choice questions, each with exactly ${skill === "Reading" ? "four" : "three"} options written without letters; the answer is the option letter`,
  multiple_answers: () => `one "Choose TWO letters" item worth two marks: a single question object with exactly five options (no letters), answer written as two different letters such as "B, D", and evidence giving both quotations separated by " || "`,
  matching: (p) => `matching: put ${p.box} options in "box" (no letters, e.g. opinions or features); each of the ${p.count} prompts is an item to match; answers are box letters and at least ${p.box! - p.count} options stay unused`,
  true_false_not_given: (p) => `${p.count} TRUE / FALSE / NOT GIVEN statements about the information in the passage; answers are TRUE, FALSE or NOT GIVEN, at least one of each`,
  yes_no_not_given: (p) => `${p.count} YES / NO / NOT GIVEN statements about the writer's claims or views; answers are YES, NO or NOT GIVEN, at least one of each`,
  matching_headings: (p) => `List of Headings: put ${p.box} headings in "box" (no numerals); ${p.count} questions, one per paragraph, prompt exactly "Paragraph A", "Paragraph B" and so on in passage order; the answer is the heading's roman numeral by box position (i, ii, iii…)`,
  matching_information: (p) => `${p.count} "Which paragraph contains the following information?" items; each prompt is a paraphrased piece of information; the answer is the paragraph letter; "box" stays empty`,
  matching_features: (p) => `matching features: put ${p.box} named people or organisations in "box"; each of the ${p.count} prompts is a statement; the answer is the letter of who said or found it`,
  matching_sentence_endings: (p) => `sentence endings: put ${p.box} sentence endings in "box"; each of the ${p.count} prompts is a sentence beginning; the answer is the letter of the correct ending`,
};

function rubricFor(plan: GroupPlan, skill: TextSkill, from: number, to: number, boxSize: number) {
  const source = skill === "Reading" ? " from the passage" : "";
  const limit = plan.limit ? ` Write ${plan.limit}${source} for each answer.` : "";
  switch (plan.type) {
    case "form_completion": return `Complete the form below.${limit}`;
    case "note_completion": return `Complete the notes below.${limit}`;
    case "table_completion": return `Complete the table below.${limit}`;
    case "sentence_completion": return `Complete the sentences below.${limit}`;
    case "summary_completion": return `Complete the summary below.${limit}`;
    case "flow_chart_completion": return `Complete the flow-chart below. Choose ${boxSize === 0 ? "" : `the correct letter, A–${String.fromCharCode(64 + boxSize)}, `}for each answer.`;
    case "multiple_choice": return skill === "Reading" ? "Choose the correct letter, A, B, C or D." : "Choose the correct letter, A, B or C.";
    case "multiple_answers": return "Choose TWO letters, A–E.";
    case "matching": return `Choose the correct letter, A–${String.fromCharCode(64 + boxSize)}, next to Questions ${range(from, to)}.`;
    case "true_false_not_given": return "Do the following statements agree with the information given in the passage? Write TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this.";
    case "yes_no_not_given": return "Do the following statements agree with the claims of the writer? Write YES if the statement agrees with the claims of the writer, NO if the statement contradicts the claims of the writer, or NOT GIVEN if it is impossible to say what the writer thinks about this.";
    case "matching_headings": return "The passage has lettered paragraphs. Choose the correct heading for each paragraph from the list of headings below.";
    case "matching_information": return `The passage has lettered paragraphs. Which paragraph contains the following information? Write the correct letter for Questions ${range(from, to)}. NB You may use any letter more than once.`;
    case "matching_features": return `Match each statement with the correct person or organisation, A–${String.fromCharCode(64 + boxSize)}. NB You may use any letter more than once.`;
    case "matching_sentence_endings": return `Complete each sentence with the correct ending, A–${String.fromCharCode(64 + boxSize)}.`;
  }
}

// ---- model replies ---------------------------------------------------------------------------------
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const groupReply = z.object({
  heading: z.string().trim().max(120).default(""), box: z.array(text(1, 200)).max(12).default([]),
  questions: z.array(z.object({ prompt: text(4, 400), options: z.array(text(1, 200)).max(6).default([]), answer: text(1, 80), evidence: text(8, 900) })).min(1).max(10),
});
const listeningReply = z.object({
  title: text(8, 140), topic: text(4, 100), setting: text(10, 300),
  speakers: z.array(z.object({ name: text(1, 30), gender: z.enum(["female", "male"]), accent: z.enum(["UK", "US"]) })).min(1).max(3),
  turns: z.array(z.object({ speaker: text(1, 30), text: text(2, 2500) })).min(2).max(90),
  groups: z.array(groupReply).min(1).max(4),
});
const readingReply = z.object({ title: text(8, 140), topic: text(4, 100), paragraphs: z.array(text(40, 2500)).min(5).max(10), groups: z.array(groupReply).min(2).max(4) });
const chartReply = z.object({
  title: text(8, 140), topic: text(4, 100), description: text(30, 400),
  visual: z.object({ kind: z.enum(["line", "bar", "table", "process"]), title: text(4, 160), unit: z.string().trim().max(60).default(""),
    x_axis: z.object({ label: z.string().trim().max(60).default(""), categories: z.array(text(1, 40)).max(8).default([]) }).default({ label: "", categories: [] }),
    series: z.array(z.object({ name: text(1, 60), values: z.array(z.number()).max(8) })).max(6).default([]),
    rows: z.array(z.array(z.string().trim().max(60)).max(6)).max(9).default([]),
    steps: z.array(z.object({ label: text(2, 160) })).max(14).default([]) }),
});
const letterReply = z.object({ title: text(8, 140), topic: text(4, 100), situation: text(30, 500), recipient: text(3, 80), salutation: text(3, 60), bullets: z.array(text(8, 160)).length(3) });
const essayReply = z.object({ title: text(8, 140), topic: text(4, 100), statement: text(40, 600), question: text(10, 240) });
const part1Reply = z.object({ title: text(8, 140), topic: text(4, 100), questions: z.array(text(10, 200)).min(4).max(6) });
const part2Reply = z.object({ title: text(8, 140), topic: text(4, 100), describe: text(15, 200), bullets: z.array(text(5, 120)).length(3), explain: text(10, 160), followUps: z.array(text(12, 250)).min(4).max(6) });

const s = { type: "string" } as const;
const arr = (items: object) => ({ type: "array", items });
const obj = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const groupSchema = obj({ heading: s, box: arr(s), questions: arr(obj({ prompt: s, options: arr(s), answer: s, evidence: s })) });

export function outputSchema(kind: FactoryKind): object {
  if (kind.startsWith("listening")) return obj({ title: s, topic: s, setting: s, speakers: arr(obj({ name: s, gender: { type: "string", enum: ["female", "male"] }, accent: { type: "string", enum: ["UK", "US"] } })), turns: arr(obj({ speaker: s, text: s })), groups: arr(groupSchema) });
  if (isReadingKind(kind)) return obj({ title: s, topic: s, paragraphs: arr(s), groups: arr(groupSchema) });
  if (kind === "writing_task1_academic") return obj({ title: s, topic: s, description: s, visual: obj({ kind: { type: "string", enum: ["line", "bar", "table", "process"] }, title: s, unit: s, x_axis: obj({ label: s, categories: arr(s) }), series: arr(obj({ name: s, values: arr({ type: "number" }) })), rows: arr(arr(s)), steps: arr(obj({ label: s })) }) });
  if (kind === "writing_task1_general") return obj({ title: s, topic: s, situation: s, recipient: s, salutation: s, bullets: arr(s) });
  if (kind === "writing_task2") return obj({ title: s, topic: s, statement: s, question: s });
  if (kind === "speaking_part1") return obj({ title: s, topic: s, questions: arr(s) });
  return obj({ title: s, topic: s, describe: s, bullets: arr(s), explain: s, followUps: arr(s) });
}

// ---- briefs ------------------------------------------------------------------------------------------
const partBrief: Record<number, { who: string; words: [number, number]; speakers: string }> = {
  1: { who: "an everyday conversation between two people about a practical matter (a booking, enquiry or registration). Include a name spelled letter by letter, a number or date that is first misheard or changed and then corrected, and natural small talk", words: [680, 900], speakers: "exactly two speakers" },
  2: { who: "a talk by one speaker in a social context (for example a guide, organiser or manager describing a place, event, service or facility to a group)", words: [680, 900], speakers: "exactly one speaker" },
  3: { who: "an academic discussion between two students, or two students and a tutor, about a project, assignment or study, in which they compare opinions, change their minds and agree on next steps", words: [800, 1050], speakers: "two or three speakers" },
  4: { who: "part of a university lecture by one speaker on an academic topic, with a clear structure of sections", words: [680, 900], speakers: "exactly one speaker" },
};
const chartKinds = ["line", "bar", "table", "process"] as const;
const essayTypes = [
  ["an opinion essay", "To what extent do you agree or disagree?"],
  ["a discussion essay", "Discuss both these views and give your own opinion."],
  ["an advantages and disadvantages essay", "Do the advantages of this outweigh the disadvantages?"],
  ["a problem and solution essay", "What problems does this cause? What solutions can you suggest?"],
  ["a two-part question essay", "Why is this the case? Is this a positive or negative development?"],
  ["a causes and effects essay", "What are the causes of this? What effects does it have on individuals and society?"],
] as const;

export type Brief = { kind: FactoryKind; plan: GroupPlan[]; extra: string; chart?: (typeof chartKinds)[number]; essay?: (typeof essayTypes)[number] };

/** What the model is asked for today: the group mix, chart kind or essay type rotate with the day number. */
export function briefFor(kind: FactoryKind, day: number): Brief {
  const options = plans[kind] ?? [[]];
  const plan = options[Math.floor(day / 2) % options.length];
  if (kind.startsWith("listening")) {
    const n = Number(kind.slice(-1));
    const p = partBrief[n];
    let next = (n - 1) * 10 + 1;
    const groups = plan.map((group, i) => { const from = next; next += group.count; return `${i + 1}) Questions ${range(from, next - 1)}: ${describe[group.type](group, "Listening")}`; });
    return { kind, plan, extra: `Write one original IELTS Listening Part ${n} recording: ${p.who}. Use ${p.speakers} with first names (or a role such as Tutor or Lecturer), and give each speaker's gender and a UK or US accent. The transcript must be ${p.words[0]}-${p.words[1]} words in total (count them: a transcript under ${p.words[0]} words is rejected), split into natural turns${n === 2 || n === 4 ? " (8-12 paragraph-sized turns of 60-100 words, all by the one speaker)" : " (20-40 turns)"}. Questions follow the order of the recording, and each evidence quotation is one or two consecutive sentences copied exactly from a single turn. "setting" completes the sentence "You will hear …". Then write the questions in ${plan.length} group(s), in this order:\n${groups.join("\n")}` };
  }
  if (isReadingKind(kind)) {
    const position = passagePosition(kind);
    const [minimum, maximum] = kind === "reading_passage" ? [780, 1000] : position === 1 ? [750, 900] : position === 2 ? [800, 950] : [850, 1000];
    let next = position === 1 ? 1 : position === 2 ? 14 : 27;
    const groups = plan.map((group, i) => { const from = next; next += group.count; return `${i + 1}) Questions ${range(from, next - 1)}: ${describe[group.type](group, "Reading")}`; });
    return { kind, plan, extra: `Write original IELTS Academic Reading Passage ${position}, ${minimum}-${maximum} words, in 6-8 paragraphs (each paragraph a separate string, without letters; the platform letters them A, B, C…). Passage 1 is accessible and factual; Passage 2 compares research or historical evidence; Passage 3 is the most demanding and includes the writer's claims and viewpoints. Keep the neutral style of a magazine or journal article. Then write ${position === 3 ? 14 : 13} questions in ${plan.length} groups, in this order:\n${groups.join("\n")}` };
  }
  if (kind === "writing_task1_academic") {
    const chart = chartKinds[Math.floor(day / 4) % chartKinds.length];
    const shape = chart === "table" ? `"rows": a table of 4-7 rows by 3-5 columns, first row the headers, numbers as text with units in the headers; leave series and categories empty`
      : chart === "process" ? `"steps": 7-11 stages of a process or life cycle, each a short label; leave series, categories and rows empty`
      : `"x_axis.categories": 4-7 time points or groups, and "series": 2-4 named data series, each with exactly one number per category; leave rows and steps empty`;
    return { kind, plan: [], chart, extra: `Write one original IELTS Academic Writing Task 1 question about a ${chart === "line" ? "line graph" : chart === "bar" ? "bar chart" : chart === "table" ? "table" : "process diagram"}. "description" is the sentence printed above the visual, e.g. "The graph below shows …" with the place and time period. "visual.kind" is "${chart}". Give the data in ${shape}. Invent plausible, internally consistent figures with clear trends, a highest and lowest, and at least one crossing or change worth comparing. Do not write a model answer.` };
  }
  if (kind === "writing_task1_general") {
    const tone = ["formal", "semi-formal", "informal"][day % 3];
    return { kind, plan: [], extra: `Write one original IELTS General Training Writing Task 1 letter task in a ${tone} register: "situation" sets the scene in 1-3 sentences addressed to the candidate ("You recently…", "You are…"); "recipient" is who to write to (e.g. "the manager", "a friend"); "bullets" are the three things to cover; "salutation" is how the letter begins after "Dear" ("Sir or Madam" for formal, "Mr Brown" style for semi-formal, a first name for informal). Do not write a model letter.` };
  }
  if (kind === "writing_task2") {
    const essay = essayTypes[Math.floor(day / 4) % essayTypes.length];
    return { kind, plan: [], essay, extra: `Write one original IELTS Writing Task 2 question for ${essay[0]}. "statement" is the 1-3 sentence background or claim (40-90 words) on an everyday social topic, with no names or statistics; "question" is the instruction, which must be "${essay[1]}" or a close variant of it. Do not write a model essay.` };
  }
  if (kind === "speaking_part1") return { kind, plan: [], extra: `Write one original IELTS Speaking Part 1 topic: "topic" is the topic name (e.g. "Morning routines") and "questions" are 4-6 short, personal, everyday questions the examiner asks about it, from simple to slightly more reflective, each ending with a question mark. Do not include sample answers.` };
  return { kind, plan: [], extra: `Write one original IELTS Speaking Part 2 cue card and its Part 3 discussion: "describe" is the task starting with "Describe" (e.g. "Describe a time when you helped a stranger"); "bullets" are the three "You should say" points; "explain" is the final point starting with "and explain"; "followUps" are 4-6 Part 3 questions that move from the personal topic to wider social issues, each ending with a question mark. Do not include sample answers.` };
}

// ---- building and checking -------------------------------------------------------------------------
// Evidence is matched word for word, ignoring case, punctuation and quote styles; "…" splits a quotation
// into fragments that must each appear.
const comparable = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/['‘’`]/g, "").replace(/[^a-z0-9£$%]+/g, " ").trim();
const fragments = (quote: string) => quote.split(/\s*(?:\.{3,}|…)\s*/).map(comparable).filter((part) => part.length > 0);
const quoted = (source: string, quote: string) => { const text = comparable(source); return fragments(quote).every((part) => text.includes(part)); };
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const BLANK = "__________";

type Built = { exam: NormalizedExam; problems: string[]; audioPayload: Record<string, unknown> | null; evidence: Record<string, string> };
type Meta = Omit<NormalizedExam, "title" | "topic" | "content">;

/** Turns model groups into numbered bank questions, checking counts, options, answers and evidence on the way. */
function buildQuestions(skill: "Listening" | "Reading", plan: GroupPlan[], groups: z.infer<typeof groupReply>[], start: number, source: string, problems: string[], paragraphCount = 0) {
  const questions: ExamQuestion[] = [];
  const evidence: Record<string, string> = {};
  const printed: string[] = [];
  if (groups.length !== plan.length) problems.push(`expected ${plan.length} question groups, got ${groups.length}`);
  let number = start;
  plan.forEach((group, index) => {
    const reply = groups[index];
    if (!reply) return;
    const expected = group.type === "multiple_answers" ? 1 : group.count;
    if (reply.questions.length !== expected) problems.push(`group ${index + 1} needs ${expected} question(s), got ${reply.questions.length}`);
    const from = number, to = number + group.count - 1;
    const boxSize = group.type === "matching_information" ? paragraphCount : reply.box.length;
    if (group.box && reply.box.length !== group.box) problems.push(`group ${index + 1} box needs ${group.box} options, got ${reply.box.length}`);
    const rubric = rubricFor(group, skill, from, to, boxSize);
    const box = group.type === "matching_headings" ? reply.box.map((option, i) => `${roman[i]} — ${option.replace(/^\s*[ivx]+[.)]\s*/i, "")}`)
      : group.type === "matching_information" ? letters(paragraphCount)
      : usesBox(group) ? reply.box.map((option, i) => `${letters(12)[i]} — ${option.replace(/^\s*[A-L][.)]\s*/, "")}`) : [];
    printed.push(`**Questions ${range(from, to)}**`, rubric, ...(reply.heading ? [`**${reply.heading}**`] : []), ...box);
    reply.questions.slice(0, expected).forEach((item) => {
      const quotes = item.evidence.split(/\s*\|\|\s*/).map((quote) => quote.trim()).filter(Boolean);
      for (const quote of quotes) if (!quoted(source, quote)) problems.push(`Q${number}: evidence is not in the ${skill === "Reading" ? "passage" : "transcript"}`);
      const own = item.options.map((option, i) => `${letters(6)[i]} — ${option.replace(/^\s*[A-F][.):]\s*/, "")}`);
      const base = { instructions: [reply.heading && `**${reply.heading}**`, rubric].filter(Boolean).join("\n"), explanation: `Evidence: ${quotes.join(" … ")}` };
      if (group.type === "multiple_answers") {
        const picks = item.answer.split(/[\s,]+/).map((letter) => letter.trim().toUpperCase()).filter(Boolean);
        if (own.length !== 5) problems.push(`Q${number}: Choose TWO needs five options`);
        if (picks.length !== 2 || new Set(picks).size !== 2 || picks.some((letter) => !letters(5).includes(letter))) problems.push(`Q${number}: Choose TWO needs two different letters A–E`);
        printed.push(`**${range(number, number + 1)}** ${item.prompt}`, ...own.map((option) => `   ${option}`));
        for (const [offset, letter] of picks.slice(0, 2).entries()) {
          questions.push({ ...base, id: `q${number + offset}`, number: number + offset, type: "multiple_answers", prompt: `Questions ${range(number, number + 1)}: ${item.prompt}`, options: own, answers: [letter], group: `g${number}` });
          evidence[`q${number + offset}`] = quotes.join(" || ");
        }
        number += 2;
        return;
      }
      const id = `q${number}`;
      evidence[id] = quotes.join(" || ");
      if (isGap(group.type)) {
        const prompt = item.prompt.replace(/_{3,}|\.{4,}|…+/g, BLANK);
        if ((prompt.match(/_{10}/g) ?? []).length !== 1) problems.push(`Q${number}: a completion prompt needs exactly one gap`);
        if (!fitsLimit(item.answer, wordLimit({ wordLimit: group.limit, instructions: "" })!)) problems.push(`Q${number}: "${item.answer}" breaks ${group.limit}`);
        if (!quotes.some((quote) => comparable(quote).includes(comparable(item.answer)))) problems.push(`Q${number}: the answer is not in its evidence`);
        if (comparable(prompt).includes(comparable(item.answer)) && item.answer.length > 3) problems.push(`Q${number}: the prompt gives the answer away`);
        printed.push(`**${number}** ${prompt}`);
        questions.push({ ...base, id, number, type: group.type, prompt, options: [], answers: [item.answer.trim()], wordLimit: group.limit });
      } else if (group.type === "true_false_not_given" || group.type === "yes_no_not_given") {
        const allowed = group.type === "true_false_not_given" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"];
        const answer = item.answer.trim().toUpperCase();
        if (!allowed.includes(answer)) problems.push(`Q${number}: answer must be ${allowed.join(" / ")}`);
        printed.push(`**${number}** ${item.prompt}`);
        questions.push({ ...base, id, number, type: group.type, prompt: item.prompt, options: [], answers: [answer] });
      } else {
        const options = group.type === "multiple_choice" ? own : box;
        const keys = group.type === "matching_headings" ? roman.slice(0, options.length) : letters(options.length);
        const answer = group.type === "matching_headings" ? item.answer.trim().toLowerCase() : item.answer.trim().toUpperCase().replace(/[.)].*$/, "");
        if (group.type === "multiple_choice" && options.length !== (skill === "Reading" ? 4 : 3)) problems.push(`Q${number}: multiple choice needs ${skill === "Reading" ? 4 : 3} options`);
        if (!keys.includes(answer)) problems.push(`Q${number}: answer ${item.answer} is not an option`);
        printed.push(`**${number}** ${item.prompt}`, ...(group.type === "multiple_choice" ? own.map((option) => `   ${option}`) : []));
        const type = group.type === "flow_chart_completion" ? "flow_chart_completion" : group.type;
        questions.push({ ...base, id, number, type, prompt: item.prompt.replace(/_{3,}|\.{4,}|…+/g, BLANK), options, answers: [answer] });
      }
      number += 1;
    });
    printed.push("");
    // Answers that repeat across a box group are fine (NB any letter more than once) except for headings.
    if (group.type === "matching_headings") {
      const used = questions.filter((q) => q.number >= from && q.number <= to).map((q) => q.answers[0]);
      if (new Set(used).size !== used.length) problems.push(`Questions ${range(from, to)}: each heading can be used only once`);
    }
  });
  if (number !== start + plan.reduce((sum, group) => sum + group.count, 0)) problems.push(`question numbers end at ${number - 1}`);
  return { questions, evidence, printed: printed.join("\n").trim() };
}

/** Builds the bank draft for one model reply and lists every problem that keeps it from the real format. */
export function buildDraft(brief: Brief, value: unknown, meta: Meta): Built {
  const problems: string[] = [];
  const { kind } = brief;
  let exam: NormalizedExam;
  let audioPayload: Record<string, unknown> | null = null;
  let evidence: Record<string, string> = {};
  if (kind.startsWith("listening")) {
    const reply = listeningReply.parse(value);
    const part = Number(kind.slice(-1));
    const names = reply.speakers.map((speaker) => speaker.name);
    const expectedSpeakers = part === 2 || part === 4 ? [1, 1] : part === 1 ? [2, 2] : [2, 3];
    if (names.length < expectedSpeakers[0] || names.length > expectedSpeakers[1]) problems.push(`Part ${part} needs ${expectedSpeakers.join("–")} speakers`);
    const unknown = reply.turns.filter((turn) => !names.includes(turn.speaker));
    if (unknown.length) problems.push(`turns by unknown speakers: ${[...new Set(unknown.map((turn) => turn.speaker))].join(", ")}`);
    const transcript = reply.turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n");
    const spoken = reply.turns.map((turn) => turn.text).join(" ");
    const built = buildQuestions("Listening", brief.plan, reply.groups, (part - 1) * 10 + 1, spoken, problems);
    evidence = built.evidence;
    // Answers follow the order of the recording.
    const at = built.questions.filter((q) => !q.group).map((q) => comparable(spoken).indexOf(fragments(evidence[q.id].split(" || ")[0])[0] ?? ""));
    if (at.some((position, i) => i > 0 && position >= 0 && position < at[i - 1])) problems.push("questions do not follow the order of the recording");
    // Kokoro voices by gender and accent; Part 3's third speaker takes the remaining voice.
    const pool = { female: { UK: "bf_emma", US: "af_heart" }, male: { UK: "bm_george", US: "am_michael" } } as const;
    const all = ["bf_emma", "bm_george", "af_heart", "am_michael"];
    const voices: Record<string, string> = {};
    for (const speaker of reply.speakers) {
      const wanted = pool[speaker.gender][speaker.accent];
      voices[speaker.name] = Object.values(voices).includes(wanted) ? all.find((voice) => !Object.values(voices).includes(voice))! : wanted;
    }
    const turns = reply.turns.map((turn, ordinal) => ({ ordinal, speaker: turn.speaker, voice: voices[turn.speaker] ?? "bf_emma", text: turn.text }));
    const alignment = Object.fromEntries(Object.entries(evidence).map(([id, quote]) => [id, [...new Set(quote.split(" || ").map((q) => reply.turns.findIndex((turn) => comparable(turn.text).includes(fragments(q)[0] ?? ""))).filter((i) => i >= 0))]]));
    const sectionId = `part-${part}`;
    exam = { ...meta, durationMinutes: 10, title: reply.title, topic: reply.topic, content: { prompt: "", taskType: `Listening Part ${part}`, sections: [{ id: sectionId, title: `Part ${part}: ${reply.title}`, passage: built.printed, transcript, questions: built.questions }] } };
    audioPayload = { sectionId, setting: reply.setting, turns, evidence: alignment, answerPhrases: built.questions.filter((q) => !q.options.length).map((q) => q.answers[0]) };
    for (const finding of checkFormat("Listening", exam.content, "part")) if (finding.severity === "error" && finding.code !== "L2" || finding.code === "L11") problems.push(`${finding.code}${finding.question ? ` Q${finding.question}` : ""}: ${finding.message}`);
  } else if (isReadingKind(kind)) {
    const reply = readingReply.parse(value);
    const position = passagePosition(kind);
    const lettered = brief.plan.some((group) => group.type === "matching_headings" || group.type === "matching_information");
    const paragraphs = reply.paragraphs.map((paragraph) => paragraph.replace(/^\s*\(?[A-H]\)?[.)]?\s+(?=[A-Z])/, ""));
    const passage = paragraphs.map((paragraph, i) => (lettered ? `(${letters(10)[i]}) ${paragraph}` : paragraph)).join("\n\n");
    const built = buildQuestions("Reading", brief.plan, reply.groups, position === 1 ? 1 : position === 2 ? 14 : 27, passage, problems, paragraphs.length);
    evidence = built.evidence;
    const headings = built.questions.filter((q) => q.type === "matching_headings");
    if (headings.length && headings.some((q, i) => q.prompt.trim() !== `Paragraph ${letters(10)[i]}`)) problems.push("headings questions must ask about Paragraph A, B, C… in order");
    exam = { ...meta, durationMinutes: 20, title: reply.title, topic: reply.topic, content: { prompt: "", sections: [{ id: `passage-${position}`, title: reply.title, passage, transcript: "", questions: built.questions }] } };
    for (const finding of checkFormat("Reading", exam.content, "part")) if (finding.severity === "error") problems.push(`${finding.code}${finding.question ? ` Q${finding.question}` : ""}: ${finding.message}`);
    const [minimum, maximum] = kind === "reading_passage" ? [700, 1150] : position === 1 ? [750, 900] : position === 2 ? [800, 950] : [850, 1000];
    if (wordCount(passage) < minimum || wordCount(passage) > maximum) problems.push(`passage has ${wordCount(passage)} words (aim ${minimum}–${maximum})`);
  } else if (kind === "writing_task1_academic") {
    const reply = chartReply.parse(value);
    const visual = reply.visual;
    if (visual.kind !== brief.chart) problems.push(`visual must be a ${brief.chart}`);
    if (visual.kind === "line" || visual.kind === "bar") {
      const n = visual.x_axis.categories.length;
      if (n < 3 || visual.series.length < 1 || visual.series.length > 5) problems.push("chart needs 3-8 categories and 1-5 series");
      if (visual.series.some((series) => series.values.length !== n || series.values.some((v) => !Number.isFinite(v) || v < 0))) problems.push("every series needs one non-negative number per category");
    }
    if (visual.kind === "table" && (visual.rows.length < 4 || new Set(visual.rows.map((row) => row.length)).size !== 1 || visual.rows[0].length < 3)) problems.push("table needs 4+ rows of equal length and 3+ columns");
    if (visual.kind === "process" && (visual.steps.length < 6 || visual.steps.length > 12)) problems.push("process needs 6-12 steps");
    if (!/\bbelow\b/i.test(reply.description)) problems.push('description should introduce the visual ("… below shows …")');
    const prompt = `You should spend about 20 minutes on this task.\n\n${reply.description.trim()}\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.`;
    exam = { ...meta, durationMinutes: 20, title: reply.title, topic: reply.topic, content: { prompt, taskType: "task1_academic", minimumWords: 150, sections: [], visual: { kind: visual.kind, title: visual.title, unit: visual.unit, ...(visual.series.length ? { x_axis: visual.x_axis, series: visual.series } : {}), ...(visual.rows.length ? { rows: visual.rows } : {}), ...(visual.steps.length ? { steps: visual.steps } : {}) } } };
  } else if (kind === "writing_task1_general") {
    const reply = letterReply.parse(value);
    const prompt = `You should spend about 20 minutes on this task.\n\n${reply.situation.trim()}\n\nWrite a letter to ${reply.recipient.trim()}. In your letter\n\n• ${reply.bullets.map((bullet) => bullet.replace(/^[•\-\s]+/, "").replace(/\.$/, "")).join("\n• ")}\n\nWrite at least 150 words.\n\nYou do NOT need to write any addresses.\n\nBegin your letter as follows:\n\nDear ${reply.salutation.replace(/^Dear\s+/i, "").replace(/,$/, "")},`;
    exam = { ...meta, format: "General Training", durationMinutes: 20, title: reply.title, topic: reply.topic, content: { prompt, taskType: "gt_task1", minimumWords: 150, sections: [] } };
  } else if (kind === "writing_task2") {
    const reply = essayReply.parse(value);
    if (wordCount(reply.statement) < 25 || wordCount(reply.statement) > 100) problems.push("statement should be 25-100 words");
    const prompt = `You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\n${reply.statement.trim()}\n\n${reply.question.trim()}\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.`;
    exam = { ...meta, durationMinutes: 40, title: reply.title, topic: reply.topic, content: { prompt, taskType: "Writing Task 2", minimumWords: 250, sections: [] } };
  } else if (kind === "speaking_part1") {
    const reply = part1Reply.parse(value);
    if (reply.questions.some((question) => !question.trim().endsWith("?") || /^describe/i.test(question) || wordCount(question) > 20)) problems.push("Part 1 questions must be short direct questions");
    exam = { ...meta, durationMinutes: 5, title: reply.title, topic: reply.topic, content: { prompt: reply.topic, speakingPart: 1, taskType: "Speaking Part 1", sections: [{ id: "part-1", title: `Part 1: ${reply.topic}`, passage: "", transcript: "", questions: reply.questions.map((prompt, i) => ({ id: `q${i + 1}`, number: i + 1, type: "speaking", prompt, instructions: "", options: [], answers: [], explanation: "" })) }] } };
  } else {
    const reply = part2Reply.parse(value);
    if (!/^describe\b/i.test(reply.describe)) problems.push('the cue card must start with "Describe"');
    if (!/^and explain\b/i.test(reply.explain)) problems.push('the last point must start with "and explain"');
    if (reply.followUps.some((question) => !question.trim().endsWith("?"))) problems.push("Part 3 questions must end with a question mark");
    const cueCard = `${reply.describe.trim()}\n\nYou should say:\n• ${reply.bullets.map((bullet) => bullet.replace(/^[•\-\s]+/, "")).join("\n• ")}\n${reply.explain.trim()}\n\nYou will have to talk about the topic for one to two minutes. You have one minute to think about what you are going to say.`;
    exam = { ...meta, durationMinutes: 8, title: reply.title, topic: reply.topic, content: { prompt: cueCard, speakingPart: 2, taskType: "Speaking Part 2 and Part 3", sections: [{ id: "part-3", title: "Part 3: Discussion", passage: "", transcript: "", questions: reply.followUps.map((prompt, i) => ({ id: `q${i + 1}`, number: i + 1, type: "speaking", prompt, instructions: "", options: [], answers: [], explanation: "" })) }] } };
  }
  return { exam, problems: [...new Set(problems)], audioPayload, evidence };
}

// ---- schedule ----------------------------------------------------------------------------------------
/** Five daily slots: two Listening parts (all four every two days), Reading, Writing and Speaking. */
export function kindForSlot(slot: number, day: number): FactoryKind {
  if (slot === 0) return (["listening_part1", "listening_part2", "listening_part3", "listening_part4"] as const)[day % 4];
  if (slot === 1) return (["listening_part3", "listening_part4", "listening_part1", "listening_part2"] as const)[day % 4];
  if (slot === 2) return "reading_passage";
  if (slot === 3) return (["writing_task2", "writing_task1_academic", "writing_task2", "writing_task1_general"] as const)[day % 4];
  return (["speaking_part1", "speaking_part2"] as const)[day % 2];
}

/** Topic seeds per kind; recent titles are also passed to the model so it avoids repeating them. */
export const topicSeeds: Record<FactoryKind, string[]> = {
  listening_part1: ["Booking a community workshop", "Joining a sports club", "Renting a holiday flat", "Registering for an evening class", "Arranging a removal service", "Enquiring about a volunteer role", "Booking a venue for a party", "Signing up for a city tour"],
  listening_part2: ["A new public library", "A local food festival", "A nature reserve visitor centre", "A town recycling scheme", "A community theatre season", "A newly opened sports complex", "A historic house tour", "A city bike-share scheme"],
  listening_part3: ["A group presentation on urban gardens", "A survey of student sleep habits", "A project on museum accessibility", "Planning a field trip report", "Evaluating a language exchange app", "A study of plastic use in cafés", "A marketing case study", "A history assignment on local industry"],
  listening_part4: ["The science of bird song", "The history of public parks", "How glaciers shape landscapes", "Early printing technology", "Urban noise and health", "The economics of fair trade", "Bioluminescent sea creatures", "Ancient water management"],
  reading_passage: ["The history of the umbrella", "How bees navigate", "Rewilding farmland", "The psychology of queues", "Ancient Roman concrete", "The rise of citizen science", "Desert agriculture", "The invention of standard time"],
  reading_passage1: ["The history of the umbrella", "How bees navigate", "Traditional paper making", "Urban beekeeping", "The invention of standard time", "Coastal gardens", "The growth of public libraries", "How glass is recycled"],
  reading_passage2: ["Rewilding farmland", "Ancient Roman concrete", "Citizen science projects", "Desert agriculture", "Museums and public memory", "The history of botanical gardens", "Changing transport networks", "How cities measure air quality"],
  reading_passage3: ["The psychology of queues", "How language shapes memory", "The limits of scientific models", "Public trust in research", "The meaning of cultural heritage", "Designing fairer cities", "Why experts disagree", "The future of shared knowledge"],
  writing_task1_academic: ["Household energy use", "Visitors to museums", "Water consumption by sector", "Commuting methods", "Book sales by format", "Recycling rates", "How paper is recycled", "Tourist arrivals by region"],
  writing_task1_general: ["A problem with a recent purchase", "Inviting a friend to an event", "Applying for a part-time job", "Complaining about noise", "Thanking a host", "Asking a landlord for repairs", "Changing a course booking", "Recommending a holiday place"],
  writing_task2: ["Working from home", "Online learning", "Public transport funding", "Advertising aimed at children", "Tourism and local culture", "Fast food and health", "Space exploration spending", "Social media and friendship"],
  speaking_part1: ["Morning routines", "Hometown", "Music", "Weekends", "Cooking", "Weather", "Books", "Public transport"],
  speaking_part2: ["A time you helped someone", "A place you would like to visit", "A useful skill you learned", "A memorable journey", "A person who inspires you", "An object you treasure", "A time you changed your mind", "A celebration you enjoyed"],
};
