import { describe, expect, it } from "vitest";
import sample from "../src/content/demo-pack.json";
import { authoredPackSchema, compareSentence, countWords } from "../src/lib/authored-content";

describe("authored content", () => {
  it("accepts a pack with multiple vocabulary items and questions", () => {
    const result = authoredPackSchema.parse(sample);
    expect(result.vocabulary).toHaveLength(2);
    expect(result.grammar.questions).toHaveLength(2);
    expect(result.reading.questions).toHaveLength(2);
    expect(result.listening.questions).toHaveLength(2);
  });

  it("rejects an answer key outside the options", () => {
    const invalid = structuredClone(sample);
    invalid.grammar.questions[0].correctIndex = 9;
    expect(authoredPackSchema.safeParse(invalid).success).toBe(false);
  });

  it("compares authored sentence variants without claiming a language score", () => {
    const accepted = ["My phone is a useful device for studying English."];
    expect(compareSentence(" my PHONE is a useful device for studying English! ", accepted).exact).toBe(true);
    expect(compareSentence("The device helps me study.", accepted).exact).toBe(false);
    expect(countWords("I study every day.")).toBe(4);
  });
});
