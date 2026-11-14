import { describe, expect, it } from "vitest";
import { lookupViEn } from "../src/lib/vocabulary/vi-en-lookup";

describe("Vietnamese → English lookup", () => {
  it("finds a listed word and splits a longer phrase into listed pieces", () => {
    expect(lookupViEn("An toàn").exact).toContain("safe");
    const phrase = lookupViEn("kinh nghiệm thực tế");
    expect(phrase.exact.length + phrase.pieces.filter((piece) => piece.en.length).length).toBeGreaterThan(0);
  });

  it("ignores punctuation and empty input", () => {
    expect(lookupViEn("  an toàn!! ").query).toBe("an toàn");
    expect(lookupViEn("???")).toEqual({ query: "", exact: [], pieces: [], related: [] });
  });
});
