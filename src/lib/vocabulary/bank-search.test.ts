import { describe, expect, it } from "vitest";
import { bankSearchText, matchRank, rankMatches } from "./bank-search";

describe("bank search", () => {
  it("removes wildcard characters from the search text", () => {
    expect(bankSearchText(" 100%_sure, (ok) ")).toBe("100 sure ok");
  });

  it("ranks exact and article-only differences first", () => {
    expect(matchRank("Mitigate", "mitigate")).toBe(0);
    expect(matchRank("a baptism of fire", "baptism of fire")).toBe(1);
    expect(matchRank("sustainable development", "sustainable")).toBe(2);
    expect(matchRank("environmentally sustainable", "sustainable")).toBe(3);
    expect(matchRank("unsustainable", "sustainable")).toBe(4);
  });

  it("orders rows by rank, then length", () => {
    const words = ["unsustainable", "sustainable development", "sustainable", "sustainably"];
    expect(rankMatches(words, "sustainable", (word) => word).map((item) => item.row)).toEqual(["sustainable", "sustainable development", "sustainably", "unsustainable"]);
  });
});
