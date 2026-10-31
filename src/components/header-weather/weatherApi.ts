import type { GeocodingResult, SelectedLocation, WeatherSnapshot } from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export async function fetchCurrentWeather(location: SelectedLocation, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code,is_day,cloud_cover',
    timezone: 'auto',
    forecast_days: '1',
  });
  const response = await fetch(`${FORECAST_URL}?${params}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) throw new Error('Unexpected weather response');
  const result = json as Record<string, unknown>;
  const current = result.current as Record<string, unknown> | undefined;
  if (!current || typeof current.temperature_2m !== 'number' || !Number.isFinite(current.temperature_2m)) {
    throw new Error('Weather is missing valid temperature');
  }
  return {
    temperatureC: current.temperature_2m,
    weatherCode: typeof current.weather_code === 'number' ? current.weather_code : -1,
    isDay: current.is_day === 1,
    cloudCover: typeof current.cloud_cover === 'number' ? current.cloud_cover : null,
    timezone: typeof result.timezone === 'string' ? result.timezone : undefined,
    observedAt: typeof current.time === 'string' ? current.time : undefined,
  };
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
  const search = query.trim();
  if (search.length < 2) return [];
  const params = new URLSearchParams({ name: search, count: '6', language: 'vi', format: 'json' });
  const response = await fetch(`${GEOCODING_URL}?${params}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) return [];
  const raw = (json as {results?: unknown}).results;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is GeocodingResult => {
    return typeof item === 'object' && item !== null &&
      typeof item.name === 'string' && typeof item.latitude === 'number' &&
      typeof item.longitude === 'number' && Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude);
  });
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Trời quang';
  if (code >= 1 && code <= 3) return 'Có mây';
  if (code === 45 || code === 48) return 'Sương mù';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Mưa phùn';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Có mưa';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Có tuyết';
  if ([95, 96, 99].includes(code)) return 'Giông bão';
  return 'Thời tiết';
}

export function weatherSymbol(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 3 && code >= 1) return isDay ? '⛅' : '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  return '🌤️';
}
