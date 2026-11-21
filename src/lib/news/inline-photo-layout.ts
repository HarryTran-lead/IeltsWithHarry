/** Put the first photo halfway through the passage and an optional third near three-quarters. */
export function inlinePhotoAfterParagraph(paragraphCount: number, position: 1 | 2) {
  if (paragraphCount < 4) return -1;
  return Math.max(0, Math.min(paragraphCount - 2, Math.floor(paragraphCount * (position === 1 ? 0.5 : 0.75)) - 1));
}
