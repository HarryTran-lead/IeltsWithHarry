import { describe, expect, it } from "vitest";
import { attemptMinutes } from "./schema";

describe("Reading attempt duration", () => {
  it("uses the selected full-test duration and preserves older attempts", () => {
    expect(attemptMinutes("Reading", 60, { __minutes: "55" })).toBe(55);
    expect(attemptMinutes("Reading", 60, { __minutes: "45" })).toBe(45);
  });

  it("uses the selected passage duration, falling back to 20 minutes for existing passage attempts", () => {
    expect(attemptMinutes("Reading", 60, { __section: "p1", __minutes: "25" })).toBe(25);
    expect(attemptMinutes("Reading", 60, { __section: "p1" })).toBe(20);
  });
});
