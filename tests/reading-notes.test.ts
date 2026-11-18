import { describe, expect, it } from "vitest";
import { encodeReadingNotes, savedReadingNotes, type ReadingNote } from "../src/features/ielts/reading-highlights";

describe("real-test reading notes", () => {
  it("round-trips notes with their anchor, text and quote", () => {
    const notes: ReadingNote[] = [
      { id: "n1", section: "p2", pane: "passage", block: 2, start: 10, end: 38, text: "licence = permission", quote: "lending licences for e-books" },
      { id: "n2", section: "p2", pane: "questions", block: 0, start: 0, end: 5, text: "", quote: undefined },
    ];
    expect(savedReadingNotes(encodeReadingNotes(notes))).toEqual(notes);
  });

  it("drops malformed entries instead of failing", () => {
    expect(savedReadingNotes("not json")).toEqual([]);
    expect(savedReadingNotes(JSON.stringify([["n1", "p2", "x", 0, 1, 2], ["n2", "p2", "p", 3, 9, 4, "t", ""]]))).toEqual([]);
    expect(savedReadingNotes(undefined)).toEqual([]);
  });
});
