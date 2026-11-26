import { describe, expect, it } from "vitest";
import { reviewDate, reviewDue } from "./notes-model";

describe("note review schedule", () => {
  it("rolls dates across month and year boundaries", () => {
    expect(reviewDate(1, new Date(2026, 11, 31))).toBe("2027-01-01");
    expect(reviewDate(7, new Date(2026, 1, 25))).toBe("2026-03-04");
  });

  it("shows reviews due today or earlier", () => {
    const now = new Date(2026, 10, 25, 15);
    expect(reviewDue(null, now)).toBe(false);
    expect(reviewDue("2026-11-24", now)).toBe(true);
    expect(reviewDue("2026-11-25", now)).toBe(true);
    expect(reviewDue("2026-11-26", now)).toBe(false);
  });
});
