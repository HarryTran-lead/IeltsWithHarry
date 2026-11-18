/** A quick English definition from the free dictionary, used when a learner taps a word while reading. */
export type QuickDefinition = { phonetic: string; part: string; definition: string; example: string };

type DictionaryEntry = { phonetic?: string; meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[] };

/** "studies" → study, "running" → runn/run… a few plain forms to try when the inflected word has no entry. */
export function wordForms(word: string) {
  return [...new Set([word, word.replace(/ies$/, "y"), word.replace(/(ing|ed|es|s)$/, ""), word.replace(/ing$/, "e")])].filter(Boolean);
}

export async function quickDefine(word: string): Promise<Partial<QuickDefinition>> {
  for (const form of wordForms(word)) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(form)}`);
      if (!response.ok) continue;
      const entry = (await response.json() as DictionaryEntry[])[0];
      const meaning = entry?.meanings?.[0];
      const definition = meaning?.definitions?.[0];
      if (definition?.definition) return { phonetic: entry.phonetic ?? "", part: meaning?.partOfSpeech ?? "", definition: definition.definition, example: definition.example ?? "" };
    } catch { /* The Vietnamese meaning still shows without a definition. */ }
  }
  return {};
}
