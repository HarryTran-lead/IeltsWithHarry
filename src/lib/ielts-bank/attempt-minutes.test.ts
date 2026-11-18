import { describe, expect, it } from "vitest";
import { attemptMinutes, customAttemptMinutes } from "./schema";

describe("Reading attempt duration", () => {
  it("uses the selected full-test duration and preserves older attempts", () => {
    expect(attemptMinutes("Reading", 60, { __minutes: "55" })).toBe(55);
    expect(attemptMinutes("Reading", 60, { __minutes: "45" })).toBe(45);
  });

  it("uses the selected passage duration, falling back to 20 minutes for existing passage attempts", () => {
    expect(attemptMinutes("Reading", 60, { __section: "p1", __minutes: "25" })).toBe(25);
    expect(attemptMinutes("Reading", 60, { __section: "p1" })).toBe(20);
  });
  it("accepts a custom duration within 5–180 minutes", () => {
    expect(attemptMinutes("Reading", 60, { __section: "p1", __minutes: "37" })).toBe(37);
    expect(attemptMinutes("Reading", 60, { __minutes: "90" })).toBe(90);
    expect(attemptMinutes("Listening", 40, { __section: "s1", __minutes: "12" })).toBe(12);
    expect(attemptMinutes("Listening", 40, { __minutes: "75" })).toBe(75);
    expect(attemptMinutes("Listening", 40, { __section: "s1" })).toBe(10);
    expect(customAttemptMinutes(4)).toBe(false);
    expect(customAttemptMinutes(181)).toBe(false);
  });
});
