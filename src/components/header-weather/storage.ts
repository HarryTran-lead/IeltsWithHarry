import type { HeaderDisplayMode, SelectedLocation } from './types';

export const MODE_KEY = 'ieltswithharry:headerWeatherMode:v1';
export const CITY_KEY = 'ieltswithharry:headerWeatherCity:v1';

export function readMode(): HeaderDisplayMode {
  try {
    const stored = window.localStorage.getItem(MODE_KEY);
    return stored === 'full' || stored === 'sky' || stored === 'off' ? stored : 'full';
  } catch { return 'full'; }
}

export function saveMode(mode: HeaderDisplayMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
}

// Persist an explicitly chosen city, never GPS coordinates or geolocation permission state.
export function readManualCity(): SelectedLocation | null {
  try {
    const raw = window.localStorage.getItem(CITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Partial<SelectedLocation>;
    if (value.source !== 'manual' || typeof value.name !== 'string' ||
      typeof value.latitude !== 'number' || typeof value.longitude !== 'number' ||
      !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
      Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null;
    return { name: value.name, country: value.country, source: 'manual',
      latitude: value.latitude, longitude: value.longitude, timezone: value.timezone };
  } catch { return null; }
}

export function saveManualCity(location: SelectedLocation | null): void {
  try {
    if (location && location.source === 'manual') window.localStorage.setItem(CITY_KEY, JSON.stringify(location));
    else window.localStorage.removeItem(CITY_KEY);
  } catch { /* storage blocked */ }
}
