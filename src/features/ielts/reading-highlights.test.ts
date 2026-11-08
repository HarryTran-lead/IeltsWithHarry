import { describe, expect, it } from "vitest";
import { encodeReadingMarks, savedReadingMarks } from "./reading-highlights";

describe("Reading highlights", () => {
  it("keeps old passage highlights and new question highlights readable", () => {
    const old = savedReadingMarks('[["passage-1",0,4,12]]');
    expect(old).toEqual([{ section: "passage-1", pane: "passage", block: 0, start: 4, end: 12, quote: undefined }]);
    const marks = [...old, { section: "passage-1", pane: "questions" as const, block: 3, start: 2, end: 15, quote: "a canal lock" }];
    expect(savedReadingMarks(encodeReadingMarks(marks))).toEqual(marks);
  });

  it("ignores corrupt offsets", () => {
    expect(savedReadingMarks('[["passage-1","q",3,15,2]]')).toEqual([]);
  });
});
