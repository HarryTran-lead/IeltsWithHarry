import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialScene, sceneReducer } from './sceneTransition';
import { MODE_KEY, readMode, saveMode } from './storage';
import { nextPhase, PHASE_SEQUENCE, phaseAt } from './time';
import { isRainyWeather } from './weatherApi';

describe('header scenes', () => {
  it.each([
    [5, 'earlyMorning'], [7, 'lateMorning'], [11, 'midday'],
    [14, 'lateAfternoon'], [17, 'sunset'], [19, 'night'], [22, 'lateNight'],
  ] as const)('selects %s:00 as %s', (hour, phase) => {
    expect(phaseAt(new Date(`2026-10-31T${String(hour).padStart(2, '0')}:00:00Z`), 'UTC')).toBe(phase);
  });

  it('returns the successor of each of the seven scenes', () => {
    expect(new Set(PHASE_SEQUENCE).size).toBe(7);
    expect(PHASE_SEQUENCE.map(nextPhase)).toEqual([...PHASE_SEQUENCE.slice(1), PHASE_SEQUENCE[0]]);
  });

  it('keeps the old scene until the new image has faded in', () => {
    const current = sceneReducer(initialScene, { type: 'loaded', phase: 'sunset' });
    const prepared = sceneReducer(current, { type: 'loaded', phase: 'night' });
    expect(prepared).toEqual({ current: 'sunset', incoming: 'night', fading: false });
    const fading = sceneReducer(prepared, { type: 'show', phase: 'night' });
    expect(fading).toEqual({ current: 'sunset', incoming: 'night', fading: true });
    expect(sceneReducer(fading, { type: 'finish', phase: 'night' })).toEqual({ current: 'night', incoming: null, fading: false });
    expect(sceneReducer(fading, { type: 'finish', phase: 'lateNight' })).toEqual(fading);
    expect(sceneReducer(current, { type: 'failed', phase: 'night' })).toEqual(initialScene);
  });

  it('uses weather effects for drizzle, rain and storms only', () => {
    expect([51, 61, 80, 95].every(isRainyWeather)).toBe(true);
    expect([0, 3, 45, 71, -1].some(isRainyWeather)).toBe(false);
  });
});

describe('header mode persistence', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['full', 'sky', 'off'] as const)('restores %s after reading saved settings again', (mode) => {
    saveMode(mode);
    expect(readMode()).toBe(mode);
  });

  it('defaults safely when no valid mode was saved', () => {
    expect(readMode()).toBe('full');
    values.set(MODE_KEY, 'broken');
    expect(readMode()).toBe('full');
  });
});
