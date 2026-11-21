import { describe, expect, it } from "vitest";
import { inlinePhotoAfterParagraph } from "../src/lib/news/inline-photo-layout";

describe("inline news photo placement", () => {
  it("breaks an eight-paragraph passage at the midpoint and later only for a second photo", () => {
    expect(inlinePhotoAfterParagraph(8, 1)).toBe(3);
    expect(inlinePhotoAfterParagraph(8, 2)).toBe(5);
  });
  it("does not interrupt a short article", () => {
    expect(inlinePhotoAfterParagraph(3, 1)).toBe(-1);
  });
});
