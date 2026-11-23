import { describe, expect, it } from "vitest";
import { addHighlight, parseHighlights, type Highlight } from "@/lib/highlights";
import { questionHighlightSlice } from "./question-highlights";

const prompt = "Tobacco sales are now banned within ______ of educational institutions.";

describe("question highlights", () => {
  it("keeps source offsets on both sides of a completion input", () => {
    const start = prompt.indexOf("educational");
    const highlights: Highlight[] = [{ id: "word", p: 0, start, end: start + 11, color: "sun" }];
    const gap = prompt.indexOf("______");
    expect(questionHighlightSlice(prompt, 0, gap, highlights).some((part) => part.highlight)).toBe(false);
    expect(questionHighlightSlice(prompt, gap + 6, prompt.length, highlights).find((part) => part.highlight)?.text).toBe("educational");
    expect(questionHighlightSlice(prompt, gap + 6, prompt.length, highlights).find((part) => part.highlight)?.start).toBe(start);
  });

  it("splits a highlight across a hidden answer gap and restores it", () => {
    const start = prompt.indexOf("within");
    const end = prompt.indexOf("educational") + "educational".length;
    const saved = addHighlight([], { id: "selection", p: 0, start, end, color: "mint" });
    const restored = parseHighlights(JSON.stringify(saved), [prompt]);
    const gap = prompt.indexOf("______");
    expect(questionHighlightSlice(prompt, 0, gap, restored).find((part) => part.highlight)?.text).toBe("within ");
    expect(questionHighlightSlice(prompt, gap + 6, prompt.length, restored).find((part) => part.highlight)?.text).toBe(" of educational");
  });

  it("keeps legacy prompt highlights and supports answer options separately", () => {
    const legacy = [{ id: "old", p: 0, start: 0, end: 7, color: "rose" }];
    const restored = parseHighlights(JSON.stringify(legacy), [prompt, "True", "False"]);
    const option = addHighlight(restored, { id: "option", p: 1, start: 0, end: 4, color: "sun" });
    expect(questionHighlightSlice(prompt, 0, 7, option).find((part) => part.highlight)?.text).toBe("Tobacco");
    expect(questionHighlightSlice("True", 0, 4, option, 1).find((part) => part.highlight)?.text).toBe("True");
  });
});
