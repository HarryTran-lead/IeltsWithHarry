const WORDS = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

export function wordCount(text: string) {
  return (text.match(WORDS) ?? []).length;
}

/** Number of words the learner has written correctly from the start of this sentence. */
export function correctPrefixWords(reference: string, typed: string) {
  const expected = reference.match(WORDS) ?? [];
  const actual = typed.match(WORDS) ?? [];
  let index = 0;
  while (index < expected.length && index < actual.length &&
    expected[index].normalize("NFKC").replace(/[’]/g, "'").toLowerCase() === actual[index].normalize("NFKC").replace(/[’]/g, "'").toLowerCase()) index += 1;
  return index;
}

/** Reveal the first wrong/missing word; further requests reveal one more word. */
export function nextHintCount(reference: string, typed: string, alreadyRevealed: number) {
  return Math.min(wordCount(reference), Math.max(correctPrefixWords(reference, typed), alreadyRevealed) + 1);
}

export function maskedAnswer(reference: string, revealedWords: number) {
  let index = 0;
  return reference.replace(WORDS, (word) => {
    index += 1;
    return index <= revealedWords ? word : "•".repeat(Math.min(word.length, 12));
  });
}
