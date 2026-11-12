import { describe, expect, it } from "vitest";
import { celebrationFor, milestoneAt, milestoneProgress, nextSeen, tierFor } from "../src/lib/streak-milestones";

const base = { current: 5, longest: 5, today: "2026-11-12", activeToday: true };

describe("streak celebration", () => {
  it("stays quiet until today has activity, and only once a day", () => {
    expect(celebrationFor({ ...base, activeToday: false }, null)).toBeNull();
    expect(celebrationFor(base, { day: "2026-11-12", count: 5 })).toBeNull();
    expect(celebrationFor(base, { day: "2026-11-11", count: 4 })?.kind).toBe("daily");
  });

  it("names first days, milestones and restarts", () => {
    expect(celebrationFor({ ...base, current: 1, longest: 1 }, null)?.kind).toBe("first");
    const week = celebrationFor({ ...base, current: 7, longest: 7 }, { day: "2026-11-11", count: 6 });
    expect(week?.kind).toBe("milestone");
    expect(week?.tierUp).toBe(true);
    expect(week?.from).toBe(6);
    const restart = celebrationFor({ ...base, current: 1, longest: 20 }, { day: "2026-11-05", count: 20 });
    expect(restart?.kind).toBe("restart");
    expect(restart?.message).toContain("20");
  });

  it("calls out a new personal record once, on the day it is beaten", () => {
    const seen = { day: "2026-11-11", count: 11, pastBest: 11 };
    expect(celebrationFor({ ...base, current: 12, longest: 12 }, seen)?.kind).toBe("record");
    expect(celebrationFor({ ...base, current: 13, longest: 13 }, { ...seen, count: 12 })?.kind).toBe("daily");
    expect(celebrationFor({ ...base, current: 12, longest: 12 }, { day: "2026-11-11", count: 11 })?.kind).toBe("daily");
  });

  it("keeps the best finished run as the record to beat", () => {
    expect(nextSeen({ current: 3, longest: 20, today: "2026-11-12" }, null).pastBest).toBe(20);
    expect(nextSeen({ current: 25, longest: 25, today: "2026-11-12" }, { day: "2026-11-11", count: 24, pastBest: 20 }).pastBest).toBe(20);
  });
});

describe("milestones and tiers", () => {
  it("finds milestones and the road to the next one", () => {
    expect(milestoneAt(30)?.badge).toBe("1 tháng");
    expect(milestoneAt(31)).toBeNull();
    expect(milestoneAt(1200)?.days).toBe(1200);
    expect(milestoneProgress(10)).toMatchObject({ left: 4, next: { days: 14 } });
  });

  it("changes flame colour as the streak grows", () => {
    expect(tierFor(3).id).toBe("spark");
    expect(tierFor(45).id).toBe("blaze");
    expect(tierFor(400).id).toBe("legend");
  });
});
