import { describe, expect, it } from "vitest";
import { attemptMinutes, bucketActivity, dayTotal, localDay, monthWeeks, skillFromSlug, weekOf } from "../src/lib/study-progress";

describe("study progress helpers", () => {
  it("reads the skill from lesson slugs", () => {
    expect(skillFromSlug("starter-u01-reading-city-gardens")).toBe("Reading");
    expect(skillFromSlug("listening-daily-life")).toBe("Listening");
    expect(skillFromSlug("starter-u01-vocabulary-daily-routine")).toBe("other");
    expect(skillFromSlug("proofreading-tips")).toBe("other");
  });

  it("estimates test minutes and caps forgotten tabs", () => {
    expect(attemptMinutes("2026-10-27T01:00:00Z", "2026-10-27T01:42:20Z", 60)).toBe(42);
    expect(attemptMinutes("2026-10-27T01:00:00Z", "2026-10-27T09:00:00Z", 60)).toBe(70);
    expect(attemptMinutes("2026-10-27T01:00:00Z", null, 60)).toBe(0);
  });

  it("buckets activity by the learner's local day", () => {
    // 18:30 UTC is already the next morning in Vietnam.
    expect(localDay("2026-10-26T18:30:00Z", "Asia/Ho_Chi_Minh")).toBe("2026-10-27");
    const days = bucketActivity([
      { at: "2026-10-26T18:30:00Z", skill: "Reading", minutes: 20, counted: true },
      { at: "2026-10-27T03:00:00Z", skill: "other", minutes: 0, counted: true },
      { at: "2026-10-27T04:00:00Z", skill: "Listening", minutes: 0, counted: false },
    ], "2026-10-26", "2026-10-28", "Asia/Ho_Chi_Minh", ["2026-10-28"]);
    expect(days.map((day) => [day.day, day.active, dayTotal(day)])).toEqual([["2026-10-26", false, 0], ["2026-10-27", true, 2], ["2026-10-28", true, 0]]);
    expect(days[1]).toMatchObject({ Reading: 1, Listening: 0, other: 1, minutes: 20 });
  });

  it("lays out Monday-first month weeks", () => {
    const weeks = monthWeeks("2026-10");
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks.at(-1)![6]).toBe("2026-11-01");
    expect(weeks).toHaveLength(5);
    expect(weekOf("2026-10-27")).toEqual(weeks[4]);
  });
});
