import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, searchCities } from "../src/components/header-weather/weatherApi";
import { formatLocalClock, phaseAt } from "../src/components/header-weather/time";
import { CITY_KEY, readManualCity, saveManualCity } from "../src/components/header-weather/storage";

afterEach(() => vi.unstubAllGlobals());

describe("header weather time and data", () => {
  it("switches phase at each boundary in the selected city's timezone", () => {
    const atSeoul = (hour: number, minute = 0) => phaseAt(
      new Date(Date.UTC(2026, 9, 31, hour - 9, minute)), "Asia/Seoul",
    );
    expect(atSeoul(4, 59)).toBe("lateNight");
    expect(atSeoul(5)).toBe("morning");
    expect(atSeoul(11, 59)).toBe("morning");
    expect(atSeoul(12)).toBe("afternoon");
    expect(atSeoul(17, 59)).toBe("afternoon");
    expect(atSeoul(18)).toBe("evening");
    expect(atSeoul(21, 59)).toBe("evening");
    expect(atSeoul(22)).toBe("lateNight");
    expect(formatLocalClock(new Date("2026-10-31T03:00:00Z"), "Asia/Seoul")).toContain("12:00");
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
