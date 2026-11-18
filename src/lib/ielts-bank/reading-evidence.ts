export type ReadingEvidence = { quote: string; paragraph: string };

/** Imported Reading packages may keep their verified quote in the explanation. */
export function evidenceFromExplanation(explanation: string): ReadingEvidence | null {
  const match = /Dẫn chứng\s*\((P\d+-[A-Z])\)\s*:\s*“([^”]+)”/iu.exec(explanation);
  return match ? { paragraph: match[1].toUpperCase(), quote: match[2].trim() } : null;
}

export function explanationWithoutEvidence(explanation: string) {
  return explanation.replace(/\s*Dẫn chứng\s*\(P\d+-[A-Z]\)\s*:\s*“[^”]+”\s*$/iu, "").trim();
}
