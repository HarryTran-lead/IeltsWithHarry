import { describe, expect, it } from "vitest";
import { checkpointAttempt, elapsedAttemptMs } from "./attempt-clock";
import { attemptMinutes } from "./schema";

describe("pausable attempt clock", () => {
  const started = "2026-11-01T00:00:00Z";
  it("does not consume Reading or Listening time while away, including across days", () => {
    const notes = checkpointAttempt({ __section: "p1", __minutes: "25" }, 125000);
    for (const skill of ["Reading", "Listening"]) {
      expect(elapsedAttemptMs(skill, started, notes, Date.parse(started) + 86400000)).toBe(125000);
      expect(attemptMinutes(skill, 60, notes) * 60000 - elapsedAttemptMs(skill, started, notes)).toBe(1375000);
    }
  });
  it("continues from saved active time and does not decrease it for a stale checkpoint", () => {
    const saved = checkpointAttempt({}, 120000);
    const resumed = checkpointAttempt(saved, 150000);
    expect(checkpointAttempt(resumed, 130000).__elapsed_ms).toBe("150000");
    expect(elapsedAttemptMs("Reading", started, resumed)).toBe(150000);
  });
  it("keeps legacy in-progress attempts resumable instead of expiring them by their start date", () => {
    expect(elapsedAttemptMs("Reading", started, { __part: "1" })).toBe(0);
    expect(elapsedAttemptMs("Listening", started, null)).toBe(0);
  });
  it("preserves Writing and Speaking wall-clock behavior", () => {
    for (const skill of ["Writing", "Speaking"]) {
      expect(elapsedAttemptMs(skill, started, { __elapsed_ms: "100" }, Date.parse(started) + 60000)).toBe(60000);
    }
  });
});
