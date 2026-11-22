import { describe, expect, it } from "vitest";
import { readingBlocks, readingComplete } from "../src/lib/news/reading-progress";

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

describe("automatic news reading completion", () => {
  it("splits long paragraphs so stopping at one part cannot count the whole paragraph", () => {
    const blocks = readingBlocks([words(250)]);
    expect(blocks).toHaveLength(3);
    expect(readingComplete(blocks, [blocks[0].targetMs, 0, 0])).toBe(false);
    expect(readingComplete(blocks, blocks.map((block) => block.targetMs))).toBe(true);
  });

  it("requires timed coverage of 80% of blocks including the beginning and end", () => {
    const blocks = readingBlocks(Array.from({ length: 5 }, () => words(100)));
    const complete = blocks.map((block) => block.targetMs);
    expect(readingComplete(blocks, [0, ...complete.slice(1)])).toBe(false);
    expect(readingComplete(blocks, [...complete.slice(0, -1), 0])).toBe(false);
    expect(readingComplete(blocks, [complete[0], complete[1], 0, complete[3], complete[4]])).toBe(true);
    expect(readingComplete(blocks, [complete[0], 0, 0, complete[3], complete[4]])).toBe(false);
  });
});
