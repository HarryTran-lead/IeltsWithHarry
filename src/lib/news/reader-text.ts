/** Repair sentence capitalization in imported text without rewriting names or acronyms. */
export function formatNewsParagraph(value: string) {
  return value
    .replace(/^([\s"'“‘([{]*)(\p{Ll})/u, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("en"))
    .replace(/([.!?][\s"'”’]+)(\p{Ll})/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("en"));
}
