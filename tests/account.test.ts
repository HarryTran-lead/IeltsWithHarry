import { describe, expect, it } from "vitest";
import { activeUntil, avatarPhotoUrl, heatmapWeeks, streakWeek } from "../src/lib/account";

describe("account helpers", () => {
  it("builds photo URLs only for paths inside the avatar bucket", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    try {
      const path = "22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555555.webp";
      expect(avatarPhotoUrl(path)).toBe(`https://example.supabase.co/storage/v1/object/public/user-avatars/${path}`);
      expect(avatarPhotoUrl("https://evil.example/photo.jpg")).toBeNull();
      expect(avatarPhotoUrl("../someone/avatar.webp")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
  it("treats infinity as permanent and past dates as expired", () => {
    const now = Date.parse("2026-10-26T10:00:00Z");
    expect(activeUntil("infinity", now)).toBe(true);
    expect(activeUntil("2026-10-27T00:00:00Z", now)).toBe(true);
    expect(activeUntil("2026-10-25T00:00:00Z", now)).toBe(false);
    expect(activeUntil(null, now)).toBe(false);
    expect(activeUntil("not a date", now)).toBe(false);
  });

  it("lays out Monday-first weeks ending with the current week", () => {
    // 2026-10-28 is a Wednesday.
    const weeks = heatmapWeeks([{ day: "2026-10-26", events: 2, kinds: ["lesson"] }, { day: "2026-10-20", events: 1, kinds: ["task"] }], "2026-10-28", 2);
    expect(weeks.map((week) => week[0].date)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(weeks[0][1]).toMatchObject({ date: "2026-10-20", events: 1, future: false });
    expect(weeks[1][0]).toMatchObject({ date: "2026-10-26", events: 2 });
    expect(weeks[1][3].future).toBe(true);
    expect(streakWeek([], "2026-11-01").map((cell) => cell.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});
