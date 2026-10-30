import { describe, expect, it } from "vitest";
import { parseArrowTableCompletion, parseTableCompletion } from "../src/lib/news/table-completion";

describe("Table Completion prompt layout", () => {
  it("recovers the flattened two-column table shown to learners", () => {
    const table = parseTableCompletion("Complete the table below. Choose **ONE WORD ONLY** from the article for each answer. Corporate Sector | Example --- | --- Retail & Property | various sectors Telecommunications | ______");
    expect(table).toEqual({
      instruction: "Complete the table below. Choose ONE WORD ONLY from the article for each answer.",
      headers: ["Corporate Sector", "Example"],
      rows: [["Retail & Property", "various sectors"], ["Telecommunications", "______"]],
      gap: { row: 1, column: 1 },
    });
  });

  it("keeps Markdown rows and puts the answer in the correct cell", () => {
    const table = parseTableCompletion("Complete the table below.\n\n| Project Structure | Design Attribute |\n| --- | --- |\n| Terminals | specialized |\n| Structure in deep water | ______ |");
    expect(table?.headers).toEqual(["Project Structure", "Design Attribute"]);
    expect(table?.rows).toEqual([["Terminals", "specialized"], ["Structure in deep water", "______"]]);
    expect(table?.gap).toEqual({ row: 1, column: 1 });
  });

  it("separates another flattened row even when the answer has words before the blank", () => {
    const table = parseTableCompletion("Complete the table below. Choose ONE WORD ONLY from the article for each answer. Corporate Relationship | Role --- | --- Parent Company | announced the filing Builder Division | real estate ______");
    expect(table?.rows).toEqual([["Parent Company", "announced the filing"], ["Builder Division", "real estate ______"]]);
    expect(table?.gap).toEqual({ row: 1, column: 1 });
  });

  it("leaves non-table or ambiguous prompts for the original question layout", () => {
    expect(parseTableCompletion("Complete the table below. Builder Division ______")).toBeNull();
    expect(parseTableCompletion("Complete the table below. A | B --- | --- A1 | ______ A2 | ______")).toBeNull();
  });
});

describe("shared Table Completion form", () => {
  it("combines the Vega Island arrow prompts into one table", () => {
    const lead = "Complete the table note with a word from the article: Feature of Vega Island skull -> Corresponding landscape element ";
    expect(parseArrowTableCompletion([
      `${lead}Eye socket -> A ______ jutting out of the ice`,
      `${lead}Mouth -> A ______ moraine`,
      `${lead}Jawbone -> Bahía del Diablo (Devil's Bay) ______`,
    ])).toEqual({
      instruction: "Complete the table note with a word from the article:",
      headers: ["Feature of Vega Island skull", "Corresponding landscape element"],
      rows: [
        { label: "Eye socket", value: "A ______ jutting out of the ice" },
        { label: "Mouth", value: "A ______ moraine" },
        { label: "Jawbone", value: "Bahía del Diablo (Devil's Bay) ______" },
      ],
    });
  });

  it("supports one arrow question and rejects mixed or ambiguous groups", () => {
    expect(parseArrowTableCompletion(["Complete the table: Feature -> Landscape Mouth -> A ______ moraine"])?.rows).toEqual([{ label: "Mouth", value: "A ______ moraine" }]);
    expect(parseArrowTableCompletion(["Complete the table: Feature -> Landscape Mouth -> A ______ moraine", "Complete the table: Feature -> Landscape Jawbone -> ______ ______"])).toBeNull();
    expect(parseArrowTableCompletion(["Complete the table: Feature -> Landscape Mouth -> A moraine"])).toBeNull();
  });
});
