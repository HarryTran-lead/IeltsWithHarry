'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useHeaderWeather } from './HeaderWeatherProvider';
import { sceneForWeather } from './weatherEffects';
import { WeatherRenderer } from './weatherRenderer';

/**
 * Live weather drawn as one layer from the top of the header to a little below it, where a CSS mask
 * fades it out (see `.skyWeather`). The renderer reads the header height from the canvas's parent.
 */
export function HeaderSkyWeather({ className }: { className?: string }) {
  const { hydrated, mode, strength, weather } = useHeaderWeather();
  const scene = useMemo(() => sceneForWeather(weather), [weather]);
  const enabled = hydrated && mode === 'full' && scene.effect !== 'none';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WeatherRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;
    let renderer: WeatherRenderer;
    try {
      renderer = new WeatherRenderer(canvas);
    } catch {
      return;
    }
    rendererRef.current = renderer;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (document.hidden || motion.matches) {
        renderer.stop();
        renderer.drawStatic();
      } else {
        renderer.start();
      }
    };
    const resize = () => renderer.resize();
    // Watch the header too: its height decides where the sky ends and the faded tail begins.
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) {
      resizeObserver.observe(canvas);
      if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled]);

  useEffect(() => {
    rendererRef.current?.setScene(scene, strength);
  }, [enabled, scene, strength]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className={className} data-effect={scene.effect} aria-hidden="true" />;
}
