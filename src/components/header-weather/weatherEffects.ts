import type { WeatherSnapshot } from './types';

export type WeatherEffect = 'rain' | 'snow' | 'cloud' | 'fog' | 'sun' | 'none';
export type WeatherIntensity = 'light' | 'medium' | 'strong';

const SNOW_LIGHT = [71, 77, 85];
const SNOW_MEDIUM = [73];
const SNOW_STRONG = [75, 86];

export function effectForWeather(weather: WeatherSnapshot | null): { effect: WeatherEffect; intensity: WeatherIntensity } {
  if (!weather) return { effect: 'none', intensity: 'light' };
  const code = weather.weatherCode;
  if ([45, 48].includes(code)) return { effect: 'fog', intensity: 'medium' };
  if ([51, 56, 61, 66, 80].includes(code)) return { effect: 'rain', intensity: 'light' };
  if ([53, 57, 63, 67, 81].includes(code)) return { effect: 'rain', intensity: 'medium' };
  if ([55, 65, 82, 95, 96, 99].includes(code)) return { effect: 'rain', intensity: 'strong' };
  if (SNOW_LIGHT.includes(code)) return { effect: 'snow', intensity: 'light' };
  if (SNOW_MEDIUM.includes(code)) return { effect: 'snow', intensity: 'medium' };
  if (SNOW_STRONG.includes(code)) return { effect: 'snow', intensity: 'strong' };
  if (code >= 1 && code <= 3) return { effect: 'cloud', intensity: code === 3 ? 'strong' : code === 2 ? 'medium' : 'light' };
  if (code === 0 && weather.isDay) return { effect: 'sun', intensity: 'medium' };
  return { effect: 'none', intensity: 'light' };
}

/** Everything the canvas renderer needs, derived from one live API snapshot. */
export type WeatherScene = {
  effect: WeatherEffect;
  /** 0..1: how much rain/snow/cloud/fog/sun to show before the user's strength setting. */
  amount: number;
  drizzle: boolean;
  storm: boolean;
  /** Horizontal wind on screen, -1 (blowing left) .. 1 (blowing right). */
  wind: number;
  /** 0..1, fraction of the sky covered by cloud. */
  cloudCover: number;
  isDay: boolean;
};

const BASE_AMOUNT: Record<WeatherIntensity, number> = { light: .34, medium: .64, strong: .95 };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function sceneForWeather(weather: WeatherSnapshot | null): WeatherScene {
  const { effect, intensity } = effectForWeather(weather);
  const code = weather?.weatherCode ?? -1;
  let amount = BASE_AMOUNT[intensity];
  const precipitation = weather?.precipitationMm;
  if ((effect === 'rain' || effect === 'snow') && typeof precipitation === 'number' && precipitation > 0) {
    // Blend the code's category with the measured rate so a "moderate" shower can still feel heavy.
    amount = clamp(amount * .55 + clamp(precipitation / 7) * .45, .2, 1);
  }
  const cloudCover = clamp((weather?.cloudCover ?? (effect === 'cloud' ? amount * 100 : effect === 'rain' ? 90 : 0)) / 100);
  if (effect === 'cloud') amount = clamp(Math.max(amount, cloudCover), .25, 1);

  // Meteorological direction is where wind comes FROM; 270° (west) pushes rain to the right.
  let wind = .18;
  const speed = weather?.windSpeedKmh;
  const direction = weather?.windDirectionDeg;
  if (typeof speed === 'number' && typeof direction === 'number') {
    const horizontal = -Math.sin(direction * Math.PI / 180) * speed;
    wind = clamp(horizontal / 38, -1, 1);
  }

  return {
    effect,
    amount,
    drizzle: [51, 53, 55, 56, 57].includes(code),
    storm: [95, 96, 99].includes(code),
    wind,
    cloudCover,
    isDay: weather?.isDay ?? true,
  };
}

/** Dev-only scene override, e.g. /app/dashboard?weather=storm — never used in production builds. */
export const PREVIEW_WEATHER: Record<string, Partial<WeatherSnapshot> & { weatherCode: number }> = {
  drizzle: { weatherCode: 53, precipitationMm: .3, windSpeedKmh: 8, windDirectionDeg: 250 },
  'rain-light': { weatherCode: 61, precipitationMm: .6, windSpeedKmh: 6, windDirectionDeg: 260 },
  rain: { weatherCode: 63, precipitationMm: 3, windSpeedKmh: 14, windDirectionDeg: 250 },
  'rain-heavy': { weatherCode: 65, precipitationMm: 9, windSpeedKmh: 26, windDirectionDeg: 240 },
  storm: { weatherCode: 95, precipitationMm: 12, windSpeedKmh: 34, windDirectionDeg: 235 },
  snow: { weatherCode: 73, precipitationMm: 1, windSpeedKmh: 10, windDirectionDeg: 280 },
  cloud: { weatherCode: 3, cloudCover: 85, windSpeedKmh: 12, windDirectionDeg: 270 },
  'cloud-light': { weatherCode: 1, cloudCover: 30, windSpeedKmh: 9, windDirectionDeg: 270 },
  fog: { weatherCode: 45, cloudCover: 100, windSpeedKmh: 4, windDirectionDeg: 270 },
  sun: { weatherCode: 0, cloudCover: 0, windSpeedKmh: 5, windDirectionDeg: 90 },
};

export function previewWeather(search: string): WeatherSnapshot | null {
  const key = new URLSearchParams(search).get('weather');
  const preset = key ? PREVIEW_WEATHER[key] : undefined;
  if (!preset) return null;
  return { temperatureC: 26, isDay: true, cloudCover: null, ...preset };
}
