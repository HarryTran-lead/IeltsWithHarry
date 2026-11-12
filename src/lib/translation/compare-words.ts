export type DiffToken = { text: string; same: boolean };

/** Lowercase and strip punctuation, keeping letters (any script), digits and apostrophes. */
function wordKey(word: string) {
  return word.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}']/gu, "");
}

/**
 * Word-level comparison of the learner's sentence with the model sentence: the longest
 * common subsequence of words, ignoring case and punctuation. Words only in the learner's
 * sentence (`mine`) and words only in the model (`model`) get `same: false`, so the
 * review screen can show what to add or drop. Pure punctuation tokens count as same.
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
