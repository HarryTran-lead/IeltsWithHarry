import { describe, expect, it } from "vitest";
import catalog from "../src/data/grammar/catalog.json";
import guides from "../src/data/grammar/guides.json";
import a1 from "../src/data/grammar/practice-A1.json";
import a2 from "../src/data/grammar/practice-A2.json";
import b1 from "../src/data/grammar/practice-B1.json";
import b2 from "../src/data/grammar/practice-B2.json";
import c1 from "../src/data/grammar/practice-C1.json";
import c2 from "../src/data/grammar/practice-C2.json";
import { practiced, reviewedCount } from "../src/lib/grammar/types";
import release from "../src/data/grammar/release-approval.json";

describe("Grammar V5 preview data", () => {
  it("contains 180 lessons and 30 distinct self-review activities per lesson", () => {
    const items = Object.assign({}, a1, a2, b1, b2, c1, c2) as Record<string, typeof a1["A1-01"]>;
    const ids = Object.values(items).flat().map((item) => item.item_id);
    expect(catalog).toHaveLength(180);
    expect(Object.keys(guides)).toHaveLength(180);
    expect(Object.keys(items)).toHaveLength(180);
    expect(ids).toHaveLength(5400);
    expect(new Set(ids).size).toBe(5400);
    expect(Object.values(items).every((lessonItems) => lessonItems.length === 30)).toBe(true);
    expect(release.owner_approved).toBe(true);
    expect(release.scope).toBe("self_review_content_only");
  });

  it("does not count skipped open answers as practiced", () => {
    const now = new Date().toISOString();
    const skipped = { theorySeen: true, updatedAt: now, responses: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`item-${index}`, { answer: "", status: "SKIPPED" as const, updatedAt: now }])) };
    expect(reviewedCount(skipped)).toBe(0);
    expect(practiced(skipped)).toBe(false);
    const reviewed = { ...skipped, responses: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`item-${index}`, { answer: "My answer", status: "UNDERSTOOD" as const, revealed: true, updatedAt: now }])) };
    expect(practiced(reviewed)).toBe(true);
  });
});
