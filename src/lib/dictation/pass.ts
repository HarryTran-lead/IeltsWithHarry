/*
 * One pass rule for every Dictation bank. A short sentence must be exact, and a sentence with a
 * focus word (the sound, number or name the lesson is about) fails when that word is wrong, however
 * high the share of other words is. Accuracy is 0–1.
 */
export const SHORT_SENTENCE_WORDS = 6;
export const PASS_ACCURACY = 0.8;

export function wordCount(text: string) {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).length;
}

export function dictationPassed(reference: string, accuracy: number, missedFocus: readonly string[] = []) {
  if (missedFocus.length) return false;
  return wordCount(reference) <= SHORT_SENTENCE_WORDS ? accuracy >= 0.999 : accuracy >= PASS_ACCURACY;
}

/** VOA and Quick store accuracy as a percentage. */
export const percentPassed = (reference: string, percent: number) => dictationPassed(reference, Number(percent) / 100);

const comparable = (value: string) => ` ${value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ").trim()} `;

/** Focus phrases missing from the learner's sentence (whole-word match, case and punctuation ignored). */
export function missingFocus(focus: readonly string[], answer: string) {
  const typed = comparable(answer);
  return focus.filter((phrase) => !typed.includes(comparable(phrase)));
}
