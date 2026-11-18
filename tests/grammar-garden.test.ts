import { describe, expect, it } from "vitest";
import { practiced, reviewedCount } from "../src/lib/grammar/types";

describe("Grammar editorial progress", () => {
  it("counts submitted editorial questions and ignores skipped or legacy V5 responses", () => {
    const now = new Date().toISOString();
    const responses = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`A1-01-Q${String(index + 1).padStart(3, "0")}`, { answer: "", status: "SKIPPED" as const, updatedAt: now }]));
    const skipped = { theorySeen: true, updatedAt: now, responses };
    expect(reviewedCount(skipped)).toBe(0);
    expect(practiced(skipped)).toBe(false);
    const reviewed = { ...skipped, responses: Object.fromEntries(Object.entries(responses).map(([id, response]) => [id, { ...response, answer: "My answer", status: "UNDERSTOOD" as const }])) };
    expect(reviewedCount(reviewed)).toBe(30);
    expect(practiced(reviewed)).toBe(true);
    reviewed.responses["V4-BASE-A1-01-CTX01"] = { answer: "Old answer", status: "UNDERSTOOD", updatedAt: now };
    expect(reviewedCount(reviewed)).toBe(30);
  });
});
