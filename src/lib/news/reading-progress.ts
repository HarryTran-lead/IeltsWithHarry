/** Reading time is credited in roughly 100-word blocks, even inside a long paragraph. */
export function readingBlocks(paragraphs: string[]) {
  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    const wordCount = paragraph.trim().split(/\s+/).filter(Boolean).length;
    if (!wordCount) return [];
    const count = Math.ceil(wordCount / 100);
    return Array.from({ length: count }, (_, blockIndex) => ({
      paragraphIndex,
      blockIndex,
      count,
      // 35% of the time at 200 words/minute, with a small floor for short blocks.
      targetMs: Math.max(2500, Math.ceil((wordCount / count / 200) * 60_000 * 0.35)),
    }));
  });
}

export function readingComplete(blocks: ReturnType<typeof readingBlocks>, times: number[]) {
  if (!blocks.length) return false;
  const reached = blocks.map((block, index) => (times[index] ?? 0) >= block.targetMs);
  return reached[0] && reached[reached.length - 1] && reached.filter(Boolean).length >= Math.ceil(blocks.length * 0.8);
}
