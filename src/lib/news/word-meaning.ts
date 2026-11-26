import { glossaryKey, type GlossaryEntry, type SentencePair } from "./article-translation";

/** Base forms a word may appear as in a dictionary: "indicators" → indicator, "rising" → rise. */
export function wordForms(raw: string): string[] {
  const word = glossaryKey(raw).replace(/'s$/, "");
  if (!word) return [];
  const forms = new Set([word]);
  const add = (value: string) => { if (value.length >= 2) forms.add(value); };
  if (word.endsWith("ies")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) add(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss")) add(word.slice(0, -1));
  if (word.endsWith("ied")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed")) { add(word.slice(0, -2)); add(word.slice(0, -1)); if (/(.)\1ed$/.test(word)) add(word.slice(0, -3)); }
  if (word.endsWith("ing")) { add(word.slice(0, -3)); add(`${word.slice(0, -3)}e`); if (/(.)\1ing$/.test(word)) add(word.slice(0, -4)); }
  if (word.endsWith("ly")) { add(word.slice(0, -2)); if (word.endsWith("ily")) add(`${word.slice(0, -3)}y`); }
  if (word.endsWith("er")) add(word.slice(0, -2));
  if (word.endsWith("est")) add(word.slice(0, -3));
  return [...forms];
}

const wordPattern = (word: string) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");

/**
 * The article's own meaning for a word: an exact glossary match (any form) first, then a glossary
 * phrase that contains the word and appears in the sentence being read.
 */
export function glossaryMeaning(glossary: GlossaryEntry[], word: string, sentence?: string): GlossaryEntry | null {
  // The two spellings match when one is a base form of the other ("indicators" / "indicator").
  const key = glossaryKey(word);
  const forms = new Set(wordForms(word));
  const exact = glossary.find((entry) => forms.has(glossaryKey(entry.word)) || wordForms(entry.word).includes(key));
  if (exact) return exact;
  if (!sentence) return null;
  return glossary.find((entry) => entry.word.includes(" ") && wordPattern(glossaryKey(word)).test(entry.word)
    && sentence.toLowerCase().includes(glossaryKey(entry.word))) ?? null;
}

/**
 * The translated sentence a learner is reading: the sentence containing the word that best matches
 * the selection context, or the first sentence with the word.
 */
export function sentenceFor(pairs: SentencePair[][], word: string, context?: string): SentencePair | null {
  const pattern = wordPattern(glossaryKey(word));
  const all = pairs.flat().filter((pair) => pattern.test(pair.en));
  if (!all.length) return null;
  const near = context?.replace(/\s+/g, " ").trim().toLowerCase();
  if (near) {
    const match = all.find((pair) => near.includes(pair.en.toLowerCase()) || pair.en.toLowerCase().includes(near));
    if (match) return match;
  }
  return all[0];
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
/**
 * Vietnamese for a selected passage taken from the stored sentence pairs: every sentence the
 * selection overlaps, in order. Null when the selection does not map onto stored sentences.
 */
export function selectionTranslation(pairs: SentencePair[], selected: string): string | null {
  const target = normalise(selected);
  if (!target || !pairs.length) return null;
  const hits = pairs.filter((pair) => {
    const en = normalise(pair.en);
    return en.includes(target) || target.includes(en) || overlaps(en, target);
  });
  return hits.length ? hits.map((pair) => pair.vi).join(" ") : null;
}
/** A selection that starts inside one sentence and ends inside the next overlaps both. */
function overlaps(sentence: string, selection: string) {
  const longest = Math.min(sentence.length, selection.length);
  for (let size = longest; size >= 8; size--) {
    if (sentence.endsWith(selection.slice(0, size)) || sentence.startsWith(selection.slice(-size))) return true;
  }
  return false;
}
