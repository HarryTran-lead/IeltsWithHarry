'use client';

import { useEffect, useRef } from 'react';
import { useHeaderWeather } from './HeaderWeatherProvider';
import { effectForWeather, type WeatherIntensity } from './weatherEffects';
import styles from './weatherEffects.module.css';

type Drop = { x: number; y: number; length: number; velocity: number; wind: number };

const rain = {
  light: { count: 125, speed: 210, opacity: .68, thickness: 1.5, length: 13 },
  medium: { count: 260, speed: 330, opacity: .85, thickness: 1.8, length: 19 },
  strong: { count: 460, speed: 480, opacity: 1, thickness: 2.2, length: 26 },
};

function RainCanvas({ intensity }: { intensity: WeatherIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const config = rain[intensity];
    let drops: Drop[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = 0;

    function draw(delta: number) {
      context!.clearRect(0, 0, width, height);
      for (const drop of drops) {
        if (delta > 0) {
          drop.y += drop.velocity * delta;
          drop.x += drop.wind * delta * .23;
          if (drop.y > height + drop.length) {
            drop.y = -drop.length;
            drop.x = Math.random() * width;
          }
          if (drop.x > width + 35) drop.x = -20;
        }
        const x2 = drop.x - drop.length * .28;
        const y2 = drop.y + drop.length;
        context!.beginPath();
        context!.strokeStyle = `rgba(32,87,120,${config.opacity * .35})`;
        context!.lineWidth = config.thickness + 1.2;
        context!.moveTo(drop.x, drop.y);
        context!.lineTo(x2, y2);
        context!.stroke();
        context!.beginPath();
        context!.strokeStyle = `rgba(243,253,255,${config.opacity * .98})`;
        context!.lineWidth = config.thickness;
        context!.moveTo(drop.x, drop.y);
        context!.lineTo(x2, y2);
        context!.stroke();
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.max(1, Math.round(width * pixelRatio));
      canvas!.height = Math.max(1, Math.round(height * pixelRatio));
      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const count = Math.max(1, Math.round(config.count * width / 1450));
      drops = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        length: config.length * (.65 + Math.random() * .75),
        velocity: config.speed * (.65 + Math.random() * .7),
        wind: config.speed * (.18 + Math.random() * .32),
      }));
      draw(0);
    }

    function tick(time: number) {
      const delta = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 0;
      lastTime = time;
      draw(delta);
      frame = window.requestAnimationFrame(tick);
    }

    function syncAnimation() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (document.hidden || motion.matches) draw(0);
      else frame = window.requestAnimationFrame(tick);
    }

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    else window.addEventListener('resize', resize);
    motion.addEventListener('change', syncAnimation);
    document.addEventListener('visibilitychange', syncAnimation);
    resize();
    syncAnimation();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      motion.removeEventListener('change', syncAnimation);
      document.removeEventListener('visibilitychange', syncAnimation);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className={styles.rainCanvas} aria-hidden="true" />;
}

/** Decorative overlay at the top of the learner dashboard; the live API decides its scene. */
export function HeaderWeatherEffects() {
  const { hydrated, mode, weather } = useHeaderWeather();
  if (!hydrated || mode !== 'full') return null;
  const { effect, intensity } = effectForWeather(weather);
  if (effect === 'none') return null;

  return <div className={styles.effect} data-effect={effect} data-intensity={intensity} aria-hidden="true">
    {effect === 'rain' && <div className={styles.rainLayer}>
      <span className={`${styles.rainCloud} ${styles.rainCloudOne}`} />
      <span className={`${styles.rainCloud} ${styles.rainCloudTwo}`} />
      <RainCanvas intensity={intensity} />
    </div>}
    {effect === 'cloud' && <div className={styles.cloudLayer}>
      <span className={`${styles.cloud} ${styles.cloudOne}`} />
      <span className={`${styles.cloud} ${styles.cloudTwo}`} />
      <span className={`${styles.cloud} ${styles.cloudThree}`} />
    </div>}
    {effect === 'fog' && <div className={styles.fogLayer}>
      <span className={`${styles.mist} ${styles.mistOne}`} />
      <span className={`${styles.mist} ${styles.mistTwo}`} />
      <span className={`${styles.mist} ${styles.mistThree}`} />
    </div>}
    {effect === 'sun' && <div className={styles.sunLayer}>
      <span className={styles.sunHalo} />
      <span className={`${styles.sunBeam} ${styles.beamOne}`} />
      <span className={`${styles.sunBeam} ${styles.beamTwo}`} />
      <span className={`${styles.sunBeam} ${styles.beamThree}`} />
      <span className={`${styles.sunBeam} ${styles.beamFour}`} />
      <span className={`${styles.spark} ${styles.sparkOne}`} />
      <span className={`${styles.spark} ${styles.sparkTwo}`} />
      <span className={`${styles.spark} ${styles.sparkThree}`} />
    </div>}
  </div>;
}
