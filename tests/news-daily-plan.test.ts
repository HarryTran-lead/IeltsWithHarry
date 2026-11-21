import { describe, expect, it } from "vitest";
import { dailyNewsPicks, originalNewsSource, readingMinutes } from "../src/lib/news/daily-plan";

describe("daily news plan", () => {
  it("prefers ready, unread Vietnamese stories and spreads categories", () => {
    const rows = ["Science", "Science", "Culture", "Health", "Business", "Education"].map((category, index) => ({
      id: String(index), category, published_at: `2026-11-20T0${index}:00:00Z`, origin_region: index === 5 ? "international" : "vietnam",
    }));
    const picks = dailyNewsPicks(rows, new Set(["0", "1", "2", "3", "4"]), new Set(["1"]));
    expect(picks.map((row) => row.id)).toEqual(["4", "3", "2", "0"]);
  });
  it("names the actual publisher and estimates reading time", () => {
    expect(originalNewsSource("https://e.vnexpress.net/news/a", "https://example.com", "IeltsWithHarry")).toBe("VnExpress");
    expect(originalNewsSource("https://vnexpress.net/a", "https://example.com", "IeltsWithHarry")).toBe("VnExpress");
    expect(originalNewsSource("https://tuoitre.vn/a", "https://example.com", "IeltsWithHarry")).toBe("Tuổi Trẻ");
    expect(originalNewsSource("https://thanhnien.vn/a", "https://example.com", "IeltsWithHarry")).toBe("Thanh Niên");
    expect(originalNewsSource(null, "https://example.com", "NASA")).toBe("NASA");
    expect(readingMinutes(758)).toBe(6);
  });
  it("places a preferred topic first while retaining category variety", () => {
    const rows = ["Science", "Health", "Culture", "Education", "Business"].map((category, index) => ({ id: String(index), category, published_at: `2026-11-20T0${index}:00:00Z`, origin_region: "vietnam" }));
    const picks = dailyNewsPicks(rows, new Set(rows.map((row) => row.id)), new Set(), ["Science"]);
    expect(picks[0].category).toBe("Science");
    expect(new Set(picks.map((row) => row.category)).size).toBe(4);
  });
});
