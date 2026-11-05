import { describe, expect, it } from 'vitest';
import { effectForWeather } from './weatherEffects';
import type { WeatherSnapshot } from './types';

const snapshot = (weatherCode: number, isDay = true): WeatherSnapshot => ({
  temperatureC: 25, weatherCode, isDay, cloudCover: null,
});

describe('live weather effect mapping', () => {
  it('maps API weather codes and severity to the visual scene', () => {
    expect(effectForWeather(snapshot(0))).toEqual({ effect: 'sun', intensity: 'medium' });
    expect(effectForWeather(snapshot(3))).toEqual({ effect: 'cloud', intensity: 'strong' });
    expect(effectForWeather(snapshot(45)).effect).toBe('fog');
    expect(effectForWeather(snapshot(51))).toEqual({ effect: 'rain', intensity: 'light' });
    expect(effectForWeather(snapshot(63))).toEqual({ effect: 'rain', intensity: 'medium' });
    expect(effectForWeather(snapshot(82))).toEqual({ effect: 'rain', intensity: 'strong' });
    expect(effectForWeather(snapshot(95))).toEqual({ effect: 'rain', intensity: 'strong' });
  });

  it('does not show sunshine at night or invent effects without weather data', () => {
    expect(effectForWeather(snapshot(0, false)).effect).toBe('none');
    expect(effectForWeather(null).effect).toBe('none');
    expect(effectForWeather(snapshot(-1)).effect).toBe('none');
  });
});
