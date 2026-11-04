export type EvidenceLocation = { paragraph: number; start: number; end: number };

type Word = { value: string; start: number; end: number };

function words(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    value: match[0].toLocaleLowerCase("en"), start: match.index, end: match.index + match[0].length,
  }));
}

const common = new Set("a an and are as at be by for from has have in is it of on or that the their this to was were with".split(" "));

/** Find the quoted evidence in the rendered passage, allowing punctuation and spacing to differ. */
export function findEvidenceLocation(paragraphs: string[], quote: string): EvidenceLocation | null {
  const query = words(quote).map((word) => word.value);
  if (query.length < 2) return null;

  for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
    const passage = words(paragraphs[paragraph]);
    for (let start = 0; start <= passage.length - query.length; start++) {
      if (query.every((value, offset) => passage[start + offset].value === value)) {
        return { paragraph, start: passage[start].start, end: passage[start + query.length - 1].end };
      }
    }
  }

  // Older generated explanations may paraphrase a sentence. Only jump when
  // its distinctive words make one passage sentence a reasonably strong match.
  const keyWords = query.filter((word) => !common.has(word));
  if (keyWords.length < 3) return null;
  let best: { location: EvidenceLocation; score: number } | null = null;
  for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
    for (const match of paragraphs[paragraph].matchAll(/[^.!?]+(?:[.!?]+|$)/g)) {
      const candidate = words(match[0]);
      const important = candidate.map((word) => word.value).filter((word) => !common.has(word));
      if (!important.length) continue;
      const counts = new Map<string, number>();
      important.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
      let shared = 0;
      for (const word of keyWords) {
        const count = counts.get(word) ?? 0;
        if (count > 0) { shared++; counts.set(word, count - 1); }
      }
      const score = (2 * shared) / (keyWords.length + important.length);
      if (score > (best?.score ?? 0)) best = { score, location: { paragraph, start: match.index, end: match.index + match[0].length } };
    }
  }
  return best && best.score >= 0.6 ? best.location : null;
}
