import { describe, expect, it } from 'vitest';
import { effectForWeather, previewWeather, sceneForWeather } from './weatherEffects';
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

describe('live weather scene', () => {
  it('slants rain with the live wind direction and speed', () => {
    const fromWest = sceneForWeather({ ...snapshot(63), windSpeedKmh: 30, windDirectionDeg: 270 });
    const fromEast = sceneForWeather({ ...snapshot(63), windSpeedKmh: 30, windDirectionDeg: 90 });
    const calm = sceneForWeather({ ...snapshot(63), windSpeedKmh: 0, windDirectionDeg: 270 });
    expect(fromWest.wind).toBeGreaterThan(.5);
    expect(fromEast.wind).toBeLessThan(-.5);
    expect(Math.abs(calm.wind)).toBeLessThan(.01);
  });

  it('lets the measured precipitation rate raise or lower the rain amount', () => {
    const drizzleRate = sceneForWeather({ ...snapshot(63), precipitationMm: .2 });
    const downpour = sceneForWeather({ ...snapshot(63), precipitationMm: 12 });
    expect(downpour.amount).toBeGreaterThan(drizzleRate.amount);
    expect(downpour.amount).toBeLessThanOrEqual(1);
  });

  it('marks drizzle, storms and snow for their own rendering', () => {
    expect(sceneForWeather(snapshot(53)).drizzle).toBe(true);
    expect(sceneForWeather(snapshot(95)).storm).toBe(true);
    expect(sceneForWeather(snapshot(75))).toMatchObject({ effect: 'snow' });
    expect(sceneForWeather(null).effect).toBe('none');
  });

  it('only builds preview weather for known preset names', () => {
    expect(previewWeather('?weather=storm')?.weatherCode).toBe(95);
    expect(previewWeather('?weather=unknown')).toBeNull();
    expect(previewWeather('')).toBeNull();
  });
});
