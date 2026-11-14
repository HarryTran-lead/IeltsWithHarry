import { describe, expect, it } from "vitest";
import { vietnamMonthStart } from "../src/lib/writing-grading/quota-window";

describe("Writing monthly quota", () => {
  it("resets at midnight on the first day in Vietnam", () => {
    expect(vietnamMonthStart(new Date("2026-11-30T16:59:59Z"))).toBe("2026-10-31T17:00:00.000Z");
    expect(vietnamMonthStart(new Date("2026-11-30T17:00:00Z"))).toBe("2026-11-30T17:00:00.000Z");
    expect(vietnamMonthStart(new Date("2026-12-31T17:00:00Z"))).toBe("2026-12-31T17:00:00.000Z");
  });
});
