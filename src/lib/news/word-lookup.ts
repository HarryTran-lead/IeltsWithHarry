export type NewsWordDefinition = {
  word: string; phonetic: string; part: string; definition: string; example: string; meaningVi: string;
  sourceUrl?: string; alternatives?: string[];
};

type VocabularyMeaning = { pos?: string; definition?: string; example?: string; meaningVi?: string };
type VocabularyResult = { ipa?: string; meanings?: VocabularyMeaning[]; source?: { url?: string } };

export function pickNewsWordMeaning(word: string, result: VocabularyResult): NewsWordDefinition {
  const meaning = result.meanings?.find((item) => item.meaningVi?.trim()) ?? result.meanings?.[0];
  const alternatives = [...new Set((result.meanings ?? []).map((item) => item.meaningVi?.trim()).filter((value): value is string => Boolean(value)))].slice(0, 3);
  return { word, phonetic: result.ipa ?? "", part: meaning?.pos ?? "", definition: meaning?.definition ?? "",
    example: meaning?.example ?? "", meaningVi: meaning?.meaningVi ?? "", sourceUrl: result.source?.url, alternatives };
}

export async function lookupNewsWord(word: string, fetcher: typeof fetch = fetch): Promise<NewsWordDefinition> {
  const response = await fetcher(`/api/vocabulary/lookup?word=${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
  return pickNewsWordMeaning(word, await response.json() as VocabularyResult);
}
