export const ieltsQuestionTypes = [
  "mcq", "tfng", "ynng", "matching_headings", "matching_information",
  "matching_features", "matching_sentence_endings", "sentence_completion",
  "summary_completion", "note_completion", "table_completion",
  "flow_chart_completion", "diagram_label_completion", "short_answer",
  "summary_word_list", "mcq_multiple",
] as const;
export type IeltsQuestionType = typeof ieltsQuestionTypes[number];
export const choiceTypes = new Set<IeltsQuestionType>([
  "mcq", "tfng", "ynng", "matching_headings", "matching_information",
  "matching_features", "matching_sentence_endings", "summary_word_list", "mcq_multiple",
]);
/**
 * Choice forms whose items share one option list: the matching forms, a summary completed from a list of words
 * (A–J), and Choose TWO, whose two items are one question with the same prompt and options.
 */
export function sharesOptionPool(type: string) {
  return type.startsWith("matching_") || type === "summary_word_list" || type === "mcq_multiple";
}
export const gapTypes = new Set<IeltsQuestionType>([
  "sentence_completion", "summary_completion", "note_completion",
  "table_completion", "flow_chart_completion", "diagram_label_completion",
]);
export function typesForKey(key: string): IeltsQuestionType[] {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const available = [...ieltsQuestionTypes];
  const selected: IeltsQuestionType[] = [];
  for (let i = 0; i < 3; i++) {
    hash = Math.imul(hash ^ (i + 1), 16777619) >>> 0;
    selected.push(available.splice(hash % available.length, 1)[0]);
  }
  return selected;
}
