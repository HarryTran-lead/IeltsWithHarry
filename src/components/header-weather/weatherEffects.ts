import type { WeatherSnapshot } from './types';

export type WeatherEffect = 'rain' | 'cloud' | 'fog' | 'sun' | 'none';
export type WeatherIntensity = 'light' | 'medium' | 'strong';

export function effectForWeather(weather: WeatherSnapshot | null): { effect: WeatherEffect; intensity: WeatherIntensity } {
  if (!weather) return { effect: 'none', intensity: 'light' };
  const code = weather.weatherCode;
  if ([45, 48].includes(code)) return { effect: 'fog', intensity: 'medium' };
  if ([51, 56, 61, 66, 80].includes(code)) return { effect: 'rain', intensity: 'light' };
  if ([53, 57, 63, 67, 81].includes(code)) return { effect: 'rain', intensity: 'medium' };
  if ([55, 65, 82, 95, 96, 99].includes(code)) return { effect: 'rain', intensity: 'strong' };
  if (code >= 1 && code <= 3) return { effect: 'cloud', intensity: code === 3 ? 'strong' : code === 2 ? 'medium' : 'light' };
  if (code === 0 && weather.isDay) return { effect: 'sun', intensity: 'medium' };
  return { effect: 'none', intensity: 'light' };
}
