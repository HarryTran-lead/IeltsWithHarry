'use client';

import { useEffect, useReducer, useRef, type CSSProperties } from 'react';
import { useHeaderWeather } from './HeaderWeatherProvider';
import { HeaderSkyWeather } from './HeaderWeatherEffects';
import { initialScene, sceneReducer } from './sceneTransition';
import { nextPhase } from './time';
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

/**
 * Where the sun or moon is painted in each 2172×160 scene, as fractions of the image (x from the left,
 * y from the top). The header crops the image around this point so the sun/moon always shows in the bar.
 */
const SCENE_FOCUS: Record<DayPhase, { x: number; y: number }> = {
  earlyMorning: { x: .556, y: .86 },
  lateMorning: { x: .57, y: .34 },
  midday: { x: .587, y: .41 },
  lateAfternoon: { x: .563, y: .86 },
  sunset: { x: .556, y: .86 },
  night: { x: .627, y: .26 },
  lateNight: { x: .72, y: .14 },
};

function sceneStyle(phase: DayPhase): CSSProperties {
  const focus = SCENE_FOCUS[phase];
  return {
    backgroundImage: `url('${SCENE_ASSETS[phase]}')`,
    '--sky-focus-x': focus.x,
    '--sky-focus-y': focus.y,
  } as CSSProperties;
}

function nightClass(phase: DayPhase) {
  return phase === 'night' || phase === 'lateNight' ? styles.nightSky : '';
}

/** Load the current scene, keep just its successor warm, and crossfade when the phase changes. */
export function HeaderSkyBackdrop() {
  const { mode, phase, hydrated, weather } = useHeaderWeather();
  const enabled = hydrated && mode !== 'off';
  const [scene, dispatch] = useReducer(sceneReducer, initialScene);
  const preloadedNext = useRef<HTMLImageElement | null>(null);
  const currentPhase = scene.current;

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'reset' });
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) dispatch({ type: 'loaded', phase }); };
    image.onerror = () => { if (active) dispatch({ type: 'failed', phase }); };
    image.src = SCENE_ASSETS[phase];
    if (image.complete && image.naturalWidth > 0) dispatch({ type: 'loaded', phase });
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [enabled, phase]);

  useEffect(() => {
    if (!enabled || !currentPhase) return;
    const image = new Image();
    image.src = SCENE_ASSETS[nextPhase(currentPhase)];
    preloadedNext.current = image;
    return () => { if (preloadedNext.current === image) preloadedNext.current = null; };
  }, [enabled, currentPhase]);

  useEffect(() => {
    if (!scene.incoming) return;
    const incoming = scene.incoming;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setTimeout(() => dispatch({ type: 'finish', phase: incoming }), 0);
      return () => window.clearTimeout(timer);
    }
    const frame = window.requestAnimationFrame(() => dispatch({ type: 'show', phase: incoming }));
    return () => window.cancelAnimationFrame(frame);
  }, [scene.incoming]);

  useEffect(() => {
    if (!scene.incoming || !scene.fading) return;
    const incoming = scene.incoming;
    const timer = window.setTimeout(() => dispatch({ type: 'finish', phase: incoming }), 1800);
    return () => window.clearTimeout(timer);
  }, [scene.incoming, scene.fading]);

  if (!enabled) return null;

  const showRainClouds = mode === 'full' && weather !== null && isRainyWeather(weather.weatherCode);

  return <>
    <div className={styles.skyBackdrop} aria-hidden="true">
      {scene.current && <span className={`${styles.skyScene} ${nightClass(scene.current)}`} style={sceneStyle(scene.current)} />}
      {scene.incoming && <span className={`${styles.skyScene} ${styles.skySceneNext} ${scene.fading ? styles.skySceneVisible : ''} ${nightClass(scene.incoming)}`} style={sceneStyle(scene.incoming)} />}
      {showRainClouds && <span className={styles.rainClouds} />}
    </div>
    {/* Outside the clipped, masked backdrop so the weather can hang below the header and fade out. */}
    <HeaderSkyWeather className={styles.skyWeather} />
  </>;
}
