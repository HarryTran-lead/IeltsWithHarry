import type { CommonError } from "./schema";

export type DiffToken = { text: string; same: boolean };

export type SmartTokenRole = "exact" | "synonym" | "trap" | "neutral";
export type SmartLearnerToken = { text: string; role: SmartTokenRole; hint?: string };
export type SmartModelToken = { text: string; matched: boolean; lookupable: boolean };

const STOPWORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "to", "of", "in", "on", "at", "by", "for",
  "from", "with", "as", "is", "am", "are", "was", "were", "be", "been", "being", "it", "its",
  "and", "or", "but", "so", "if", "than", "into", "up", "out", "over", "do", "does", "did",
  "has", "have", "had", "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "our", "their",
]);

// Bidirectional IELTS paraphrase clusters so valid synonyms are celebrated rather than flagged red.
const SYNONYM_CLUSTERS: string[][] = [
  ["scholarship", "grant", "bursary", "stipend", "aid"],
  ["give", "gives", "gave", "provide", "provides", "provided", "offer", "offers", "enable", "enables", "allow", "allows"],
  ["student", "students", "learner", "learners", "pupil", "pupils", "undergraduate", "undergraduates"],
  ["rural", "countryside", "remote"],
  ["opportunity", "opportunities", "chance", "chances"],
  ["attend", "attending", "pursue", "pursuing", "enter", "study"],
  ["university", "universities", "college", "higher"],
  ["reduce", "reduces", "reduced", "reducing", "cut", "cuts", "decrease", "decreases", "lower", "lowers", "curb", "curbs", "minimise", "minimize"],
  ["increase", "increases", "increased", "raise", "raises", "boost", "boosts", "grow", "grows", "rise", "rises"],
  ["improve", "improves", "improved", "improving", "enhance", "enhances", "strengthen", "strengthens", "upgrade", "upgrades"],
  ["people", "citizens", "residents", "individuals", "public", "adults"],
  ["children", "kids", "youngsters", "youth"],
  ["worker", "workers", "employee", "employees", "staff", "workforce"],
  ["company", "companies", "business", "businesses", "firm", "firms", "enterprise", "enterprises"],
  ["government", "governments", "authorities", "policymakers", "state"],
  ["city", "cities", "urban", "municipal", "metropolitan"],
  ["believe", "think", "argue", "consider", "view", "hold"],
  ["although", "though", "while", "whereas"],
  ["however", "nevertheless", "nonetheless", "yet"],
  ["therefore", "consequently", "thus", "hence"],
  ["important", "crucial", "vital", "essential", "significant", "critical"],
  ["problem", "problems", "issue", "issues", "challenge", "challenges"],
  ["benefit", "benefits", "advantage", "advantages", "gain", "gains"],
  ["help", "helps", "helped", "assist", "assists", "support", "supports", "facilitate", "facilitates"],
  ["programme", "program", "programmes", "programs", "initiative", "scheme"],
  ["centre", "center", "centres", "centers"],
  ["organisation", "organization", "organisations", "organizations"],
  ["neighbourhood", "neighborhood", "neighbourhoods", "neighborhoods", "community", "communities", "area", "areas"],
  ["emphasise", "emphasize", "highlight", "stress", "underscore"],
  ["sustainable", "durable", "lasting"],
  ["trust", "confidence", "faith"],
  ["evidence", "research", "data", "findings", "proof"],
  ["disclose", "disclosing", "reveal", "revealing", "share", "sharing", "publish", "publishing"],
  ["affordable", "inexpensive", "reasonable"],
  ["delay", "delayed", "postpone", "postponed"],
  ["shop", "shops", "store", "stores", "retailer", "retailers"],
];

const SYNONYM_MAP = new Map<string, Set<string>>();
for (const group of SYNONYM_CLUSTERS) {
  const canonical = new Set(group);
  for (const word of group) {
    const prev = SYNONYM_MAP.get(word);
    if (prev) group.forEach((item) => prev.add(item));
    else SYNONYM_MAP.set(word, new Set(canonical));
  }
}

/** Lowercase and strip punctuation, keeping letters (any script), digits and apostrophes. */
export function wordKey(word: string) {
  return word.toLocaleLowerCase("en-US").replace(/’/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
}

function lightStem(key: string) {
  if (key.length <= 4) return key;
  if (key.endsWith("ies") && key.length > 5) return `${key.slice(0, -3)}y`;
  if (key.endsWith("ing") && key.length > 5) return key.slice(0, -3);
  if (key.endsWith("ed") && key.length > 4) return key.slice(0, -2);
  if (key.endsWith("es") && key.length > 4) return key.slice(0, -2);
  if (key.endsWith("s") && !key.endsWith("ss") && key.length > 4) return key.slice(0, -1);
  return key;
}

function semanticallyMatches(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b || lightStem(a) === lightStem(b)) return true;
  return SYNONYM_MAP.get(a)?.has(b) ?? SYNONYM_MAP.get(lightStem(a))?.has(lightStem(b)) ?? false;
}

export function isContentWord(rawWord: string) {
  const key = wordKey(rawWord).replace(/'[a-z]+$/, "");
  return key.length >= 3 && !STOPWORDS.has(key) && !/^\d+$/.test(key);
}

/**
 * Word-level comparison of the learner's sentence with the model sentence: the longest
 * common subsequence of words, ignoring case and punctuation. Words only in the learner's
 * sentence (`mine`) and words only in the model (`model`) get `same: false`.
 */
export function compareWords(mine: string, model: string): { mine: DiffToken[]; model: DiffToken[] } {
  const split = (text: string) => text.trim().split(/\s+/).filter(Boolean);
  const a = split(mine), b = split(model);
  const ka = a.map(wordKey), kb = b.map(wordKey);
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = ka[i] && ka[i] === kb[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const sameA = new Set<number>(), sameB = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (ka[i] && ka[i] === kb[j]) { sameA.add(i); sameB.add(j); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return {
    mine: a.map((text, index) => ({ text, same: sameA.has(index) || !ka[index] })),
    model: b.map((text, index) => ({ text, same: sameB.has(index) || !kb[index] })),
  };
}

/**
 * The model answer closest to what the learner wrote: the one sharing the largest share
 * of words with it. Ties keep the earlier answer, so the main model wins by default.
 */
export function closestAnswer(mine: string, answers: string[]): number {
  let best = 0, bestScore = -1;
  answers.forEach((answer, index) => {
    const { mine: a, model: b } = compareWords(mine, answer);
    const shared = b.filter((token) => token.same).length;
    const score = shared / Math.max(a.length, b.length, 1);
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}

/**
 * Constructive IELTS expression comparison: celebrates exact matches and valid paraphrases,
 * detects known grammar traps from `commonErrors`, and avoids punishing valid rewording.
 */
export function evaluateExpression(
  mine: string,
  answers: string[],
  commonErrors: CommonError[] = [],
): {
  closestIndex: number;
  closestModel: string;
  learnerTokens: SmartLearnerToken[];
  modelTokens: SmartModelToken[];
  conceptScore: number;
  matchedConcepts: number;
  totalConcepts: number;
  detectedTrap: CommonError | null;
} {
  const closestIndex = closestAnswer(mine, answers);
  const closestModel = answers[closestIndex] ?? answers[0] ?? "";
  const baseDiff = compareWords(mine, closestModel);

  const allModelKeys = new Set(
    answers.flatMap((ans) => ans.trim().split(/\s+/).map(wordKey).filter(Boolean)),
  );
  const modelContentKeys = closestModel
    .trim()
    .split(/\s+/)
    .filter(isContentWord)
    .map(wordKey);

  // Check if the learner fell into any known commonError pattern (e.g. "should to stay", "Although ..., but").
  const normalizedMine = ` ${mine.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()} `;
  let detectedTrap: CommonError | null = null;
  const trapWords = new Set<string>();
  for (const err of commonErrors) {
    const errDiff = compareWords(err.incorrect, err.correction);
    const badChunk = errDiff.mine.filter((tok) => !tok.same).map((tok) => wordKey(tok.text)).filter(Boolean);
    if (badChunk.length > 0) {
      const phrase = badChunk.join(" ");
      if (phrase && normalizedMine.replace(/[^\p{L}\p{N}'\s]/gu, "").includes(` ${phrase} `)) {
        detectedTrap = err;
        badChunk.forEach((w) => trapWords.add(w));
        break;
      }
    }
  }

  // Also flag classic universal Vietnamese->English traps ("can to", "should to", "must to", "will to", "informations", "evidences", "equipments").
  const universalTrapMatch = /\b(can|should|must|will|may|might|could|would)\s+to\s+[a-z]{2,}\b|\b(informations|evidences|equipments|researches|homeworks|advices|knowledges)\b/i.exec(mine);
  if (universalTrapMatch) {
    const rawHit = universalTrapMatch[0];
    rawHit.split(/\s+/).map(wordKey).forEach((w) => trapWords.add(w));
    if (!detectedTrap) {
      const isModal = /\bto\b/i.test(rawHit);
      detectedTrap = {
        incorrect: rawHit,
        correction: isModal ? rawHit.replace(/\s+to\s+/i, " ") : rawHit.replace(/s$/i, ""),
        reasonVi: isModal
          ? "Sau động từ khuyết thiếu (can/should/must/will...) dùng động từ nguyên mẫu không có 'to'."
          : `'${rawHit.replace(/s$/i, "")}' là danh từ không đếm được nên không thêm '-s'.`,
      };
    }
  }

  const learnerKeys = baseDiff.mine.map((tok) => wordKey(tok.text));
  const learnerTokens: SmartLearnerToken[] = baseDiff.mine.map((tok, idx) => {
    const key = learnerKeys[idx];
    if (trapWords.has(key) && !tok.same) {
      return { text: tok.text, role: "trap", hint: detectedTrap?.reasonVi };
    }
    if (tok.same || allModelKeys.has(key)) {
      return { text: tok.text, role: "exact" };
    }
    const isSyn = [...allModelKeys].some((mk) => isContentWord(mk) && semanticallyMatches(key, mk));
    if (isSyn) {
      return { text: tok.text, role: "synonym" };
    }
    return { text: tok.text, role: "neutral" };
  });

  const modelTokens: SmartModelToken[] = baseDiff.model.map((tok) => {
    const key = wordKey(tok.text);
    const synMatched = tok.same || learnerKeys.some((lk) => semanticallyMatches(lk, key));
    return {
      text: tok.text,
      matched: synMatched,
      lookupable: isContentWord(tok.text),
    };
  });

  const uniqueConcepts = [...new Set(modelContentKeys)];
  const matchedConcepts = uniqueConcepts.filter((ck) =>
    learnerKeys.some((lk) => lk === ck || semanticallyMatches(lk, ck)),
  ).length;
  const totalConcepts = Math.max(1, uniqueConcepts.length);
  const conceptScore = Math.round((matchedConcepts / totalConcepts) * 100);

  return {
    closestIndex,
    closestModel,
    learnerTokens,
    modelTokens,
    conceptScore,
    matchedConcepts,
    totalConcepts,
    detectedTrap,
  };
}
