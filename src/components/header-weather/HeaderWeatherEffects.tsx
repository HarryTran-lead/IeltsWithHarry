'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useHeaderWeather } from './HeaderWeatherProvider';
import { sceneForWeather, type WeatherScene } from './weatherEffects';
import { WeatherRenderer, type RenderVariant } from './weatherRenderer';
import type { HeaderEffectStrength } from './types';
import styles from './weatherEffects.module.css';

function WeatherCanvas({ variant, scene, strength, className }: {
  variant: RenderVariant;
  scene: WeatherScene;
  strength: HeaderEffectStrength;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WeatherRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WeatherRenderer;
    try {
      renderer = new WeatherRenderer(canvas, variant);
    } catch {
      return;
    }
    rendererRef.current = renderer;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let onScreen = true;
    const sync = () => {
      if (document.hidden || motion.matches || !onScreen) {
        renderer.stop();
        renderer.drawStatic();
      } else {
        renderer.start();
      }
    };
    const resize = () => renderer.resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(canvas);
    else window.addEventListener('resize', resize);
    // Stop animating once the overlay scrolls out of view.
    const visibility = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { onScreen = entry?.isIntersecting ?? true; sync(); })
      : null;
    visibility?.observe(canvas);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      visibility?.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [variant]);

  useEffect(() => {
    rendererRef.current?.setScene(scene, strength);
  }, [scene, strength]);

  return <canvas ref={canvasRef} className={className ?? styles.canvas} aria-hidden="true" />;
}

function useWeatherScene() {
  const { hydrated, mode, strength, weather } = useHeaderWeather();
  const scene = useMemo(() => sceneForWeather(weather), [weather]);
  return { enabled: hydrated && mode === 'full' && scene.effect !== 'none', scene, strength };
}

/** Realistic weather drawn over the top of learner pages; the live API decides the scene. */
export function HeaderWeatherEffects() {
  const { enabled, scene, strength } = useWeatherScene();
  if (!enabled) return null;
  return <div className={styles.effect} data-effect={scene.effect} aria-hidden="true">
    <WeatherCanvas variant="page" scene={scene} strength={strength} />
  </div>;
}

/** The same weather, falling through the illustrated header sky (rendered inside the sky backdrop). */
export function HeaderSkyWeather({ className }: { className?: string }) {
  const { enabled, scene, strength } = useWeatherScene();
  if (!enabled || scene.effect === 'sun') return null;
  return <WeatherCanvas variant="sky" scene={scene} strength={strength} className={className} />;
}
