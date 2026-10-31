'use client';

import { useHeaderWeather } from './HeaderWeatherProvider';
import { isRainyWeather } from './weatherApi';
import type { DayPhase } from './types';
import styles from './headerWeather.module.css';

const SCENE_ASSETS: Record<DayPhase, string> = {
  earlyMorning: '/harry-header-skies/earlyMorning.png',
  lateMorning: '/harry-header-skies/lateMorning.png',
  midday: '/harry-header-skies/midday.png',
  lateAfternoon: '/harry-header-skies/lateAfternoon.png',
  sunset: '/harry-header-skies/sunset.png',
  night: '/harry-header-skies/night.png',
  lateNight: '/harry-header-skies/lateNight.png',
};

/** One decorative image within the existing header; controls remain HTML above it. */
export function HeaderSkyBackdrop() {
  const { mode, phase, hydrated, weather } = useHeaderWeather();
  if (!hydrated || mode === 'off') return null;

  const showRainClouds = mode === 'full' && weather !== null && isRainyWeather(weather.weatherCode);

  return <div
    className={`${styles.skyBackdrop} ${phase === 'night' || phase === 'lateNight' ? styles.nightSky : ''}`}
    style={{ backgroundImage: `url('${SCENE_ASSETS[phase]}')` }}
    aria-hidden="true"
  >
    {showRainClouds && <span className={styles.rainClouds} />}
  </div>;
}
