import { describe, expect, it } from "vitest";
import { writingPromptPreview } from "../src/lib/ielts-bank/catalog";

describe("writingPromptPreview", () => {
  it("joins paragraphs and drops the closing word-count line", () => {
    const prompt = "The chart and graph below show how people in Verdon travelled to work in 2024.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.";
    expect(writingPromptPreview(prompt)).toBe("The chart and graph below show how people in Verdon travelled to work in 2024. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.");
  });

  it("drops the Task 2 lead-in and returns nothing for an empty prompt", () => {
    expect(writingPromptPreview("Write about the following topic:\n\nSome people think cities should ban cars. To what extent do you agree?")).toBe("Some people think cities should ban cars. To what extent do you agree?");
    expect(writingPromptPreview(null)).toBe("");
    expect(writingPromptPreview("   ")).toBe("");
  });
});
