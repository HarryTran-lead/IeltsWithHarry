import type { BandExercise } from "./band-practice";
import { compareWords, wordKey } from "./compare-words";

export type ChunkTile = {
  id: string;
  text: string;
  isDistractor: boolean;
};

export type ChunkPuzzle = {
  solution: ChunkTile[];
  bank: ChunkTile[];
};

export type ParagraphStep = {
  index: number;
  promptVi: string;
  answerEn: string;
};

const GLUE_START = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "to", "of", "in", "on", "at", "by", "for", "from", "with", "without", "into", "about", "not",
  "can", "cannot", "could", "should", "must", "will", "would", "may", "might", "do", "does", "did",
  "has", "have", "had", "is", "are", "was", "were",
]);

function stableSeed(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle<T>(items: T[], seedStr: string): T[] {
  const copy = [...items];
  let seed = stableSeed(seedStr) || 1;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  // Ensure shuffled order differs from original when possible.
  if (copy.length > 1 && copy.every((item, idx) => item === items[idx])) {
    [copy[0], copy[copy.length - 1]] = [copy[copy.length - 1], copy[0]];
  }
  return copy;
}

/**
 * Splits a reference sentence into 3–8 natural collocation/phrase chunks (keeping articles,
 * auxiliaries, and prepositions attached to the words they govern) plus 1–2 grammar-trap distractors.
 */
export function buildChunkPuzzle(item: Pick<BandExercise, "id" | "referenceAnswers" | "commonErrors" | "type">): ChunkPuzzle {
  const answer = item.referenceAnswers[0].trim();
  const words = answer.split(/\s+/).filter(Boolean);

  // Single words or 2-word phrases split by word; longer sentences group into 2–3 word chunks.
  const rawChunks: string[] = [];
  if (words.length <= 4) {
    rawChunks.push(...words);
  } else {
    let buffer: string[] = [];
    const maxChunkLen = words.length > 16 ? 3 : 2;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      buffer.push(word);
      const clean = wordKey(word);
      const endsPunct = /[,.;:!?]$/.test(word);
      const shouldKeepGlue = GLUE_START.has(clean) && buffer.length < maxChunkLen + 1 && i < words.length - 1;
      if (!shouldKeepGlue && (endsPunct || buffer.length >= maxChunkLen)) {
        rawChunks.push(buffer.join(" "));
        buffer = [];
      }
    }
    if (buffer.length) {
      if (buffer.length === 1 && rawChunks.length > 0 && rawChunks[rawChunks.length - 1].split(/\s+/).length < 3) {
        rawChunks[rawChunks.length - 1] += ` ${buffer[0]}`;
      } else {
        rawChunks.push(buffer.join(" "));
      }
    }
  }

  const solution: ChunkTile[] = rawChunks.map((text, idx) => ({
    id: `${item.id}-sol-${idx}`,
    text,
    isDistractor: false,
  }));

  // Derive realistic grammar-trap distractors from commonErrors or safe inflection traps.
  const existingLower = new Set(rawChunks.map((c) => c.toLowerCase()));
  const distractorTexts: string[] = [];

  for (const err of item.commonErrors) {
    const diff = compareWords(err.incorrect, err.correction);
    const wrongSpan = diff.mine.filter((tok) => !tok.same).map((tok) => tok.text).join(" ").trim();
    if (wrongSpan && wrongSpan.split(/\s+/).length <= 3 && !existingLower.has(wrongSpan.toLowerCase())) {
      distractorTexts.push(wrongSpan);
      existingLower.add(wrongSpan.toLowerCase());
    }
    if (distractorTexts.length >= 2) break;
  }

  // Fallback distractor so the puzzle always requires active grammar attention.
  if (distractorTexts.length === 0 && words.length >= 3) {
    for (const chunk of rawChunks) {
      const modalSwap = chunk.replace(/\b(can|should|will|may|must)\s+([a-z]+)\b/i, "$1 to $2");
      if (modalSwap !== chunk && !existingLower.has(modalSwap.toLowerCase())) {
        distractorTexts.push(modalSwap);
        break;
      }
      const prepSwap = chunk.replace(/\b(in|on|at|for|to|from)\b/i, (m) => (m.toLowerCase() === "to" ? "for" : "to"));
      if (prepSwap !== chunk && !existingLower.has(prepSwap.toLowerCase())) {
        distractorTexts.push(prepSwap);
        break;
      }
    }
  }

  const distractors: ChunkTile[] = distractorTexts.slice(0, 2).map((text, idx) => ({
    id: `${item.id}-trap-${idx}`,
    text,
    isDistractor: true,
  }));

  return {
    solution,
    bank: deterministicShuffle([...solution, ...distractors], item.id),
  };
}

function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Aligns a multi-sentence paragraph exercise into step-by-step sentence pairs when
 * the Vietnamese prompt and English model have the same number of sentences (>= 2).
 */
export function splitParagraphSteps(item: Pick<BandExercise, "type" | "promptVi" | "referenceAnswers">): ParagraphStep[] | null {
  if (item.type !== "paragraph") return null;
  const viParts = splitSentences(item.promptVi);
  const enParts = splitSentences(item.referenceAnswers[0] ?? "");
  if (viParts.length < 2 || viParts.length !== enParts.length) return null;
  return viParts.map((promptVi, idx) => ({
    index: idx,
    promptVi,
    answerEn: enParts[idx],
  }));
}
