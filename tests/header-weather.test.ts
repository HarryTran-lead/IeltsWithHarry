import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, searchCities } from "../src/components/header-weather/weatherApi";
import { formatLocalClock, phaseAt } from "../src/components/header-weather/time";
import { CITY_KEY, readManualCity, saveManualCity } from "../src/components/header-weather/storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => vi.unstubAllGlobals());

describe("header weather time and data", () => {
  it("switches phase at each boundary in the selected city's timezone", () => {
    const atSeoul = (hour: number, minute = 0) => phaseAt(
      new Date(Date.UTC(2026, 9, 31, hour - 9, minute)), "Asia/Seoul",
    );
    const cases = [
      [4, 59, "lateNight"], [5, 0, "earlyMorning"], [6, 59, "earlyMorning"],
      [7, 0, "lateMorning"], [10, 59, "lateMorning"], [11, 0, "midday"],
      [13, 59, "midday"], [14, 0, "lateAfternoon"], [16, 59, "lateAfternoon"],
      [17, 0, "sunset"], [18, 59, "sunset"], [19, 0, "night"],
      [21, 59, "night"], [22, 0, "lateNight"], [23, 59, "lateNight"],
    ] as const;
    for (const [hour, minute, phase] of cases) expect(atSeoul(hour, minute)).toBe(phase);
    expect(formatLocalClock(new Date("2026-10-31T03:00:00Z"), "Asia/Seoul")).toContain("12:00");
  });

  it("ships seven precomposed images with the expected 2172 × 160 dimensions", () => {
    for (const phase of ["earlyMorning", "lateMorning", "midday", "lateAfternoon", "sunset", "night", "lateNight"]) {
      const file = readFileSync(join(process.cwd(), "public", "harry-header-skies", `${phase}.png`));
      expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(file.readUInt32BE(16)).toBe(2172);
      expect(file.readUInt32BE(20)).toBe(160);
    }
  });

  it("uses API weather only when a valid temperature is returned", async () => {
    const location = { name: "Hà Nội", latitude: 21.03, longitude: 105.85, source: "manual" as const };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      timezone: "Asia/Bangkok",
      current: { temperature_2m: 25.4, weather_code: 3, is_day: 1, cloud_cover: 70 },
    }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ current: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentWeather(location)).resolves.toMatchObject({ temperatureC: 25.4, weatherCode: 3 });
    expect(fetchMock.mock.calls[0][0]).toContain("latitude=21.03");
    await expect(fetchCurrentWeather(location)).rejects.toThrow("valid temperature");
  });

  it("does not search the API for an incomplete city name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchCities("H")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists a chosen city but removes GPS coordinates from storage", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    saveManualCity({ name: "Seoul", latitude: 37.57, longitude: 126.98, timezone: "Asia/Seoul", source: "manual" });
    expect(readManualCity()).toMatchObject({ name: "Seoul", timezone: "Asia/Seoul" });
    saveManualCity({ name: "Vị trí hiện tại", latitude: 21.03, longitude: 105.85, source: "gps" });
    expect(values.has(CITY_KEY)).toBe(false);
  });
});
