import { describe, expect, it } from "vitest";
import { currentStreak, topStreaks } from "./streak-leaderboard";

describe("current streak leaderboard", () => {
  it("keeps yesterday's run until the current local day ends, then expires it", () => {
    const days = new Set(["2026-10-30", "2026-10-31"]);
    expect(currentStreak(days, "2026-11-01")).toBe(2);
    expect(currentStreak(days, "2026-11-02")).toBe(0);
  });

  it("ranks the five largest current streaks using each learner's timezone", () => {
    const now = new Date("2026-11-01T00:30:00Z");
    const profiles = [
      { id: "a", display_name: "A", timezone: "Asia/Ho_Chi_Minh" },
      { id: "b", display_name: "B", timezone: "America/Los_Angeles" },
      { id: "c", display_name: "C", timezone: "Asia/Ho_Chi_Minh" },
      { id: "d", display_name: "D", timezone: "Asia/Ho_Chi_Minh" },
      { id: "e", display_name: "E", timezone: "Asia/Ho_Chi_Minh" },
      { id: "f", display_name: "F", timezone: "Asia/Ho_Chi_Minh" },
      { id: "g", display_name: "G", timezone: "Asia/Ho_Chi_Minh" },
    ];
    const activity = [
      { user_id: "a", day: "2026-10-31" }, { user_id: "a", day: "2026-10-30" },
      { user_id: "b", day: "2026-10-31" }, { user_id: "b", day: "2026-10-30" }, { user_id: "b", day: "2026-10-29" },
      { user_id: "c", day: "2026-10-31" },
      { user_id: "d", day: "2026-10-31" }, { user_id: "d", day: "2026-10-30" }, { user_id: "d", day: "2026-10-29" }, { user_id: "d", day: "2026-10-28" },
      { user_id: "e", day: "2026-10-31" }, { user_id: "e", day: "2026-10-30" },
      { user_id: "f", day: "2026-10-31" },
      { user_id: "g", day: "2026-10-28" }, { user_id: "g", day: "2026-10-27" },
    ];
    expect(topStreaks(profiles, activity, now, new Set(["d"])).map(({ id, days }) => [id, days]))
      .toEqual([["b", 3], ["a", 2], ["e", 2], ["c", 1], ["f", 1]]);
  });
});
