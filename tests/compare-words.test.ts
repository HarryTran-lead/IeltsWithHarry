import { describe, expect, it } from "vitest";
import { compareWords } from "../src/lib/translation/compare-words";

const changed = (tokens: { text: string; same: boolean }[]) => tokens.filter((token) => !token.same).map((token) => token.text);

describe("compareWords", () => {
  it("marks the words to drop and the words to add", () => {
    const diff = compareWords(
      "I am improving english because I want to improve communication skill",
      "I am studying English because I want to improve my communication skills.",
    );
    expect(changed(diff.mine)).toEqual(["improving", "skill"]);
    expect(changed(diff.model)).toEqual(["studying", "my", "skills."]);
  });

  it("ignores case and punctuation", () => {
    const diff = compareWords("hello, world", "Hello world!");
    expect(changed(diff.mine)).toEqual([]);
    expect(changed(diff.model)).toEqual([]);
  });

  it("keeps the original words, spacing aside, for display", () => {
    const diff = compareWords("  a   b ", "a c");
    expect(diff.mine.map((token) => token.text)).toEqual(["a", "b"]);
    expect(diff.model.map((token) => token.text)).toEqual(["a", "c"]);
  });

  it("handles an empty answer", () => {
    const diff = compareWords("", "name");
    expect(diff.mine).toEqual([]);
    expect(changed(diff.model)).toEqual(["name"]);
  });
});
