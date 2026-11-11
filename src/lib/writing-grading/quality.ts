/** A bare infinitive after help (with or without an object) is grammatical. */
export function isOptionalHelpToCorrection(item: { category: string; original_text: string; suggestion: string | null }) {
  if (item.category !== "grammar" || !item.suggestion) return false;
  const withoutOptionalTo = item.suggestion.replace(
    /(\bhelp\b)((?:\s+[A-Za-z][A-Za-z'-]*){0,4})\s+to\s+([A-Za-z][A-Za-z'-]*)/i,
    (_match, help: string, object: string, verb: string) => `${help}${object} ${verb}`,
  );
  return withoutOptionalTo !== item.suggestion && withoutOptionalTo === item.original_text;
}

export function filterUnsupportedWritingErrors<T extends { category: string; original_text: string; suggestion: string | null }>(items: T[]) {
  return items.filter((item) => !isOptionalHelpToCorrection(item));
}
