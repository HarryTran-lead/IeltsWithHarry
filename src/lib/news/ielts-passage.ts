export const ieltsQuestionTypes = [
  "mcq", "tfng", "ynng", "matching_headings", "matching_information",
  "matching_features", "matching_sentence_endings", "sentence_completion",
  "summary_completion", "note_completion", "table_completion",
  "flow_chart_completion", "diagram_label_completion", "short_answer",
] as const;
export type IeltsQuestionType = typeof ieltsQuestionTypes[number];
export type ReadingPassage = 1 | 2 | 3;
export const passageBands: Record<ReadingPassage, string> = { 1: "4.0–5.0", 2: "5.0–6.0", 3: "6.0–7.0+" };
export const choiceTypes = new Set<IeltsQuestionType>([
  "mcq", "tfng", "ynng", "matching_headings", "matching_information",
  "matching_features", "matching_sentence_endings",
]);
export const gapTypes = new Set<IeltsQuestionType>([
  "sentence_completion", "summary_completion", "note_completion",
  "table_completion", "flow_chart_completion", "diagram_label_completion",
]);
/** Stable assignment spreads new rewrites across three target levels. */
export function passageForKey(key: string): ReadingPassage {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 3 + 1) as ReadingPassage;
}
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
