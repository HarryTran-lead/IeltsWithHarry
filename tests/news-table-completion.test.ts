import { describe, expect, it } from "vitest";
import { parseTableCompletion } from "../src/lib/news/table-completion";

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
