import dictionary from "./vi-en-word-hints.json";

type Index = Record<string, string[]>;
const index = dictionary as Index;
export type ViEnResult = { query: string; exact: string[]; pieces: { vi: string; en: string[] }[]; related: { vi: string; en: string[] }[] };

export const normalizeVi = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{M}\s-]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Vietnamese → English from the project's own word list (no external service,
 * no quota): the whole phrase when it is listed, otherwise the longest listed
 * pieces from left to right, plus a few longer entries that start with it.
 */
export function lookupViEn(raw: string): ViEnResult {
  const query = normalizeVi(raw).slice(0, 50).trim();
  const exact = index[query] ?? [];
  const words = query ? query.split(" ") : [];
  const pieces: ViEnResult["pieces"] = [];
  for (let start = 0; start < words.length;) {
    let found = 0;
    for (let length = Math.min(5, words.length - start); length >= 1; length--) {
      const phrase = words.slice(start, start + length).join(" ");
      if (index[phrase]?.length) { pieces.push({ vi: phrase, en: index[phrase].slice(0, 4) }); found = length; break; }
    }
    if (!found) { pieces.push({ vi: words[start], en: [] }); found = 1; }
    start += found;
  }
  const related = query ? Object.keys(index).filter((key) => key.startsWith(`${query} `)).slice(0, 6).map((key) => ({ vi: key, en: index[key].slice(0, 3) })) : [];
  return { query, exact: exact.slice(0, 6), pieces: exact.length || pieces.length < 2 ? [] : pieces, related };
}
