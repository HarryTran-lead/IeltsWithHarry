import { choiceTypes, gapTypes, ieltsQuestionTypes, type IeltsQuestionType } from "../ielts-passage";
import { looksLikeDirectLookup } from "../adaptive-quiz";
import { parseQuestionDiagram, sharedMatchingOptions } from "../question-presentation";
import type { BlindReview, Candidate, Generation, PassageMap } from "./types";

export type Validation = { valid: Candidate[]; issues: string[] };
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (s: string) => normalize(s).split(" ").filter(Boolean);
const vi = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;
const knownTypes = new Set<string>(ieltsQuestionTypes);
const needsGroup = new Set<IeltsQuestionType>([
  "matching_headings", "matching_information", "matching_features", "matching_sentence_endings",
  "summary_completion", "note_completion", "table_completion", "flow_chart_completion",
]);
const otherGap = /_{3,}|\.{3,}|…/g;

const PARAGRAPH_LETTERS = "ABCDEFGHIJKL";
/** Accepts "A", "a", "A.", "(A)", "Paragraph A", "1", "P1" or "Paragraph 1"; anything else keeps source position. */
export function paragraphLabel(raw: unknown, index: number): string {
  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  const letter = /^(?:paragraph\s+)?\(?([A-Za-z])\)?\.?$/i.exec(text);
  if (letter) return letter[1].toUpperCase();
  const number = /^(?:paragraph\s+|p)?(\d{1,2})\.?$/i.exec(text);
  if (number && Number(number[1]) >= 1 && Number(number[1]) <= 26) return String.fromCharCode(64 + Number(number[1]));
  return PARAGRAPH_LETTERS[index] ?? "";
}
/** Map issues that cannot be trusted for paragraph-referencing forms. */
export const PARAGRAPH_MAP_ISSUES = new Set(["PASSAGE_MAP_PARAGRAPH", "PASSAGE_MAP_COUNT"]);

/** Vietnamese text check shared with the factory's normalization. */
export function isVietnameseNote(note: unknown) { return typeof note === "string" && note.length >= 8 && vi.test(note); }

export function validatePassageMap(map: PassageMap, article: string): string[] {
  const issues: string[] = [];
  if (!map || !Array.isArray(map.paragraphs) || !Array.isArray(map.opportunities)
    || !Array.isArray(map.process_steps) || !Array.isArray(map.diagram_structure)
    || !Array.isArray(map.comparisons) || !Array.isArray(map.qualifications)
    || !Array.isArray(map.causal_links)
    || typeof map.writer_view !== "string") return ["PASSAGE_MAP_SCHEMA"];
  const ids = new Set<string>();
  map.paragraphs.forEach((paragraph, index) => {
    const id = paragraph ? paragraphLabel(paragraph.id, index) : "";
    if (!paragraph || !/^[A-Z]$/.test(id) || ids.has(id)
      || !paragraph.main_idea || !Array.isArray(paragraph.key_facts)) issues.push("PASSAGE_MAP_PARAGRAPH");
    ids.add(id);
  });
  if (map.paragraphs.length < 1 || map.paragraphs.length > 12) issues.push("PASSAGE_MAP_COUNT");
  for (const opportunity of map.opportunities) {
    if (!knownTypes.has(opportunity?.type) || !opportunity.skill || !opportunity.evidence
      || !article.includes(opportunity.evidence)) issues.push("PASSAGE_MAP_OPPORTUNITY");
  }
  return issues;
}

/** Structural checks are necessary but never treated as semantic proof. */
export function validateCandidate(item: Candidate, article: string, map: PassageMap): string[] {
  const errors: string[] = [];
  if (!item || typeof item !== "object" || !map) return ["SCHEMA"];
  if (!/^[a-z0-9_-]{1,40}$/i.test(item.id ?? "")) errors.push("ID");
  if (!knownTypes.has(item.type)) return [...errors, "TYPE"];
  if (!/^[a-z0-9_-]{1,40}$/i.test(item.group_id ?? "")) errors.push("GROUP_ID");
  if (!["P1", "P2", "P3"].includes(item.difficulty)) errors.push("DIFFICULTY");
  if (item.paraphrase_depth !== Number(item.difficulty?.slice(1))) errors.push("PARAPHRASE_DEPTH");
  if (!["detail", "paraphrase", "main_idea", "inference", "writer_view", "process"].includes(item.skill)) errors.push("SKILL");
  if (!["sentence", "paragraph", "multiple_paragraphs", "whole_passage"].includes(item.evidence_scope)) errors.push("SCOPE");
  if (typeof item.prompt !== "string" || item.prompt.trim().length < 10 || item.prompt.length > 500) errors.push("PROMPT");
  // Length bounds match the database checks on news_auto_questions and news_auto_answer_keys.
  if (typeof item.supporting_sentence !== "string" || item.supporting_sentence.length < 15 || item.supporting_sentence.length > 500
    || !article.includes(item.supporting_sentence)) errors.push("EVIDENCE");
  if (!Array.isArray(item.evidence_spans) || item.evidence_spans.length < 1
    || item.evidence_spans.some((span) => !Number.isInteger(span?.start) || !Number.isInteger(span?.end)
      || span.start < 0 || span.end <= span.start || span.end > article.length
      || article.slice(span.start, span.end) !== span.quote)
    || !item.evidence_spans.some((span) => span.quote === item.supporting_sentence)) errors.push("EVIDENCE_OFFSETS");
  if (typeof item.explanation !== "string" || item.explanation.length < 25 || item.explanation.length > 2000 || !vi.test(item.explanation)) errors.push("EXPLANATION");
  if (typeof item.explanation_en !== "string" || item.explanation_en.length < 20) errors.push("EXPLANATION_EN");
  if (!Array.isArray(item.options) || !Array.isArray(item.option_notes)) return [...errors, "OPTIONS_SCHEMA"];
  const type = item.type;
  if (choiceTypes.has(type)) {
    const fixed = type === "tfng" ? ["True", "False", "Not Given"] : type === "ynng" ? ["Yes", "No", "Not Given"] : null;
    if (fixed ? JSON.stringify(item.options) !== JSON.stringify(fixed)
      // The database stores three or four options per item (news_auto_questions_options_check).
      : item.options.length < 3 || item.options.length > 4 || new Set(item.options.map(normalize)).size !== item.options.length) errors.push("CHOICE_POOL");
    if (!Number.isInteger(item.correct_index) || item.correct_index < 0 || item.correct_index >= item.options.length) errors.push("KEY");
    if (item.answer !== "") errors.push("CHOICE_ANSWER");
    // Matching forms may leave per-option notes out (a shared pool); when present they must all be valid.
    if (!(type.startsWith("matching_") && item.option_notes.length === 0) && (item.option_notes.length !== item.options.length
      || item.option_notes.some((note) => typeof note !== "string" || note.length < 8 || !vi.test(note)))) errors.push("OPTION_NOTES");
    if (type === "mcq" && item.options.length !== 4) errors.push("MCQ_FOUR");
    if (type === "ynng" && !map.writer_view.trim()) errors.push("NO_WRITER_VIEW");
    if (type === "matching_headings" && !/\bparagraph\s+[A-Z]\b/i.test(item.prompt)) errors.push("HEADING_PARAGRAPH");
    if (type === "matching_information" && !item.options.every((option) => /^paragraph [A-Z]$/i.test(option))) errors.push("INFORMATION_PARAGRAPHS");
    if (type === "matching_sentence_endings" && /[.!?]\s*$/.test(item.prompt)) errors.push("SENTENCE_STEM");
  } else {
    if (item.options.length || item.option_notes.length || item.correct_index !== -1) errors.push("WRITTEN_SHAPE");
    if (typeof item.answer !== "string" || !item.answer.trim() || words(item.answer).length > 3
      || !item.supporting_sentence?.includes(item.answer)) errors.push("WRITTEN_ANSWER");
    if (item.prompt && normalize(item.prompt).includes(normalize(item.answer))) errors.push("ANSWER_LEAK");
    if (gapTypes.has(type) && (item.prompt?.match(otherGap) ?? []).length !== 1) errors.push("ONE_GAP");
    if (type === "short_answer" && !item.prompt?.trim().endsWith("?")) errors.push("SHORT_QUESTION");
    if (type === "table_completion" && !/^[^:\n]{2,50}:\s*.+_{3,}/.test(item.prompt)) errors.push("TABLE_ROW");
    if (type === "flow_chart_completion" && (!/^Step\s+\d+:\s*.+_{3,}/i.test(item.prompt)
      || map.process_steps.length < 2)) errors.push("FLOW_PROCESS");
    if (type === "diagram_label_completion") {
      const diagram = parseQuestionDiagram(item.prompt);
      if (!diagram || map.diagram_structure.length < 2
        || diagram.labels.filter((label) => label !== "______").some((label) => !article.toLowerCase().includes(label.toLowerCase()))) errors.push("DIAGRAM");
    }
  }
  if (item.prompt && item.supporting_sentence && looksLikeDirectLookup(item.prompt, item.supporting_sentence) && item.difficulty !== "P1") errors.push("DIRECT_LOOKUP");
  return errors;
}

export function validateGeneration(data: Generation, article: string, selected: IeltsQuestionType[]): Validation {
  const issues = validatePassageMap(data?.passage_map, article);
  // Only a broken map shape is fatal. Paragraph and opportunity notes are metadata: every question is still
  // checked against the exact article and by blind QA, so they are recorded instead of discarding the whole set.
  if (issues.includes("PASSAGE_MAP_SCHEMA") || !Array.isArray(data?.questions))
    return { valid: [], issues: [...issues, ...(!Array.isArray(data?.questions) ? ["QUESTIONS_SCHEMA"] : [])] };
  const paragraphMapReliable = !issues.some((issue) => PARAGRAPH_MAP_ISSUES.has(issue));
  const valid: Candidate[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  const evidence = new Set<string>();
  for (const item of data.questions) {
    const errors = validateCandidate(item, article, data.passage_map);
    if (!selected.includes(item?.type)) errors.push("UNSELECTED_TYPE");
    if (!paragraphMapReliable && (item?.type === "matching_headings" || item?.type === "matching_information"))
      errors.push("PARAGRAPH_MAP_UNRELIABLE");
    if (ids.has(item?.id)) errors.push("DUPLICATE_ID");
    if (prompts.has(normalize(item?.prompt ?? ""))) errors.push("DUPLICATE_PROMPT");
    const testedFact = normalize(item?.supporting_sentence ?? "") + "|" + normalize(
      item?.correct_index >= 0 ? item?.options?.[item.correct_index] ?? "" : item?.answer ?? "");
    if (evidence.has(testedFact)) errors.push("DUPLICATE_FACT");
    ids.add(item?.id);
    prompts.add(normalize(item?.prompt ?? ""));
    evidence.add(testedFact);
    if (errors.length) issues.push(`${item?.id ?? "?"}:${errors.join(",")}`);
    else valid.push(item);
  }
  const groups = new Map<string, Candidate[]>();
  for (const item of valid) groups.set(item.group_id, [...(groups.get(item.group_id) ?? []), item]);
  const rejectedGroups = new Set<string>();
  for (const [groupId, group] of groups) {
    const before = issues.length;
    const type = group[0].type;
    if (group.some((item) => item.type !== type)) issues.push(`${groupId}:MIXED_GROUP`);
    if (needsGroup.has(type) && group.length < 2) issues.push(`${groupId}:GROUP_TOO_SMALL`);
    if (type.startsWith("matching_") && group.length > 1 && !sharedMatchingOptions(group)) issues.push(`${groupId}:MATCHING_POOL`);
    if (type === "flow_chart_completion" && group.some((item, index) => !new RegExp(`^Step ${index + 1}:`, "i").test(item.prompt))) issues.push(`${groupId}:FLOW_ORDER`);
    if (type === "matching_headings" && group.length > 1 && new Set(group.map((item) => item.correct_index)).size !== group.length) issues.push(`${groupId}:HEADING_REUSE`);
    if (type === "matching_headings" && group[0].options.length <= group.length) issues.push(`${groupId}:NO_EXTRA_HEADING`);
    if (type === "note_completion") {
      const limits = new Set(group.map((item) => /\[W([123])\]/.exec(item.prompt)?.[1] ?? ""));
      if (limits.size !== 1 || limits.has("")) issues.push(`${groupId}:WORD_LIMIT`);
      else if (group.some((item) => words(item.answer).length > Number([...limits][0]))) issues.push(`${groupId}:WORD_LIMIT_EXCEEDED`);
    }
    if (issues.length > before) rejectedGroups.add(groupId);
  }
  return { valid: valid.filter((item) => !rejectedGroups.has(item.group_id)), issues };
}

/** QA problems that make the whole review untrustworthy; a per-item mismatch only drops that item. */
export const BLOCKING_QA_ISSUES = new Set(["QA_SCHEMA", "QA_ID", "QA_COVERAGE"]);

export function validateBlindReview(review: BlindReview, candidates: Candidate[]): { accepted: Candidate[]; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(review?.reviews)) return { accepted: [], issues: ["QA_SCHEMA"] };
  const ids = new Set(candidates.map((item) => item.id));
  const seen = new Set<string>();
  const accepted: Candidate[] = [];
  for (const verdict of review.reviews) {
    if (!ids.has(verdict?.id) || seen.has(verdict.id)) issues.push("QA_ID");
    seen.add(verdict?.id);
    const item = candidates.find((candidate) => candidate.id === verdict?.id);
    if (!item || verdict.status !== "answerable" || !Array.isArray(verdict.competing_answers)
      || verdict.competing_answers.length || !verdict.independent_answer?.trim()
      || verdict.paraphrase_faithful !== true || verdict.distractors_fair !== true || verdict.form_valid !== true
      || !verdict.reason_vi?.trim()) continue;
    const expected = choiceTypes.has(item.type) ? item.options[item.correct_index] : item.answer;
    if (normalize(expected) !== normalize(verdict.independent_answer)) {
      issues.push(`${item.id}:QA_MISMATCH`);
      continue;
    }
    accepted.push(item);
  }
  if (seen.size !== candidates.length) issues.push("QA_COVERAGE");
  return { accepted: issues.some((issue) => issue === "QA_ID" || issue === "QA_COVERAGE") ? [] : accepted, issues };
}
