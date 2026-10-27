import { describe, expect, it } from "vitest";
import { balancedCatalog, catalogGroups, catalogHref } from "../src/lib/ielts-bank/catalog";

describe("IELTS catalog grouping", () => {
  it("interleaves formats so one large category does not fill the first page", () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `essay-${i}`, practice_type: "task2" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `chart-${i}`, practice_type: "task1_academic" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `letter-${i}`, practice_type: "task1_general" })),
    ];
    const result = balancedCatalog(items, catalogGroups.Writing.map((group) => group.id));
    expect(result.slice(0, 6).map((item) => item.practice_type)).toEqual([
      "task1_academic", "task1_general", "task2",
      "task1_academic", "task1_general", "task2",
    ]);
    expect(result).toHaveLength(items.length);
    expect(new Set(result.map((item) => item.id)).size).toBe(items.length);
  });

  it("links every type to its own skill page", () => {
    expect(catalogHref("Writing", "task1_general")).toBe("/app/writing?type=task1_general");
    expect(catalogHref("Speaking", "part2")).toBe("/app/speaking?type=part2");
  });
});
