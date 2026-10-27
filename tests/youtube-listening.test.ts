import { describe, expect, it } from "vitest";
import { parseCaptions, validateQuestions, wordDifferences, youtubeId } from "../src/lib/listening/youtube";

describe("licensed YouTube lesson inputs", () => {
  it("accepts official URL shapes and rejects lookalike hosts", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeId("https://youtube.com.evil.test/watch?v=abcdefghijk")).toBeNull();
    expect(youtubeId("http://youtube.com/watch?v=abcdefghijk")).toBeNull();
  });
  it("validates SRT and VTT timing and rejects overlapping cues", () => {
    expect(parseCaptions("WEBVTT\n\n00:01.000 --> 00:02.500\nHello world")).toEqual([{ start: 1, end: 2.5, text: "Hello world" }]);
    expect(() => parseCaptions("1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:01,500 --> 00:00:03,000\nTwo")).toThrow(/overlapping/);
  });
  it("finds missing and incorrect dictation words", () => {
    expect(wordDifferences("The cat is here", "The dog here").map((row) => row.kind)).toEqual(["correct", "incorrect", "missing", "missing", "correct"]);
  });
  it("requires an answer index for each authored question", () => {
    expect(validateQuestions('[{"prompt":"Why?","options":["A","B"],"answer":1}]')).toHaveLength(1);
    expect(() => validateQuestions('[{"prompt":"Why?","options":["A","B"],"answer":2}]')).toThrow();
  });
});
