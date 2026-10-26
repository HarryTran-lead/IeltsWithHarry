import { describe, expect, it } from "vitest";
import { addHighlight, parseHighlightCache, parseHighlights, segments, trimRange, type Highlight } from "../src/lib/highlights";

const mark = (id: string, start: number, end: number, p = 0): Highlight => ({ id, p, start, end, color: "sun" });

describe("highlights", () => {
  it("splits a paragraph into plain and highlighted runs", () => {
    const parts = segments("The cat sat down", 0, [mark("a", 4, 7), mark("b", 12, 16), mark("c", 0, 3, 1)]);
    expect(parts.map((part) => [part.text, part.highlight?.id])).toEqual([["The ", undefined], ["cat", "a"], [" sat ", undefined], ["down", "b"]]);
  });

  it("trims and splits overlapping highlights when a new one is added", () => {
    const list = addHighlight([mark("a", 0, 20), mark("b", 0, 5, 1)], { ...mark("n", 5, 10), color: "rose" });
    expect(list.map((item) => [item.id, item.p, item.start, item.end])).toEqual([["a", 0, 0, 5], ["n", 0, 5, 10], ["a-r", 0, 10, 20], ["b", 1, 0, 5]]);
  });

  it("drops stored highlights that do not fit the current text", () => {
    const stored = JSON.stringify([mark("ok", 0, 3), mark("long", 0, 99), mark("para", 0, 2, 4), { id: "x", p: 0, start: 0, end: 2, color: "blue" }, "junk"]);
    expect(parseHighlights(stored, ["Hello world"]).map((item) => item.id)).toEqual(["ok"]);
    expect(parseHighlights("{not json", ["Hello"])).toEqual([]);
  });

  it("trims whitespace from a selection range", () => {
    expect(trimRange("  word  ", 0, 8)).toEqual([2, 6]);
    expect(trimRange("   ", 0, 3)).toEqual([3, 3]);
  });

  it("restores separate highlights across paragraphs from a saved cache", () => {
    const saved = { updatedAt: "2026-10-26T04:00:00.000Z", highlights: [mark("first", 0, 4), mark("second", 2, 6, 1)] };
    expect(parseHighlightCache(JSON.stringify(saved), ["Read this", "A book today"]).highlights).toEqual(saved.highlights);
    expect(parseHighlightCache(JSON.stringify(saved), ["No", "A book today"]).highlights.map((item) => item.id)).toEqual(["second"]);
  });
});
