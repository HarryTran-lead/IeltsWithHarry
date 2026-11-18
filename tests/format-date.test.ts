import { describe, expect, it } from "vitest";
import { viDate, viDayMonth } from "../src/lib/format-date";

describe("format-date", () => {
  it("formats a plain day in the portal's vi-VN medium style", () => {
    expect(viDate("2026-10-26")).toBe(new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(2026, 9, 26)));
    expect(viDate("2026-10-26")).toMatch(/26/);
    expect(viDate("2026-10-26")).toMatch(/2026/);
  });

  it("keeps a plain day on the same calendar day in every time zone", () => {
    expect(viDayMonth("2026-01-01")).toBe(new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(new Date(2026, 0, 1)));
  });

  it("accepts timestamps and Date objects", () => {
    const date = new Date(2026, 4, 3, 15, 30);
    expect(viDate(date.toISOString())).toBe(viDate(date));
  });
});
