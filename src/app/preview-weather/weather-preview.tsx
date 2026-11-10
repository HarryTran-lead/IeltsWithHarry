'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { HeaderSkyBackdrop, HeaderWeatherEffects, HeaderWeatherProvider, HeaderWeatherWidget, useHeaderWeather, type DayPhase } from '@/components/header-weather';
import { PREVIEW_WEATHER, previewWeather, sceneForWeather } from '@/components/header-weather/weatherEffects';
import { WeatherRenderer } from '@/components/header-weather/weatherRenderer';
import weatherStyles from '@/components/header-weather/headerWeather.module.css';

function Frame() {
  const { mode, phase } = useHeaderWeather();
  return <div className={`app-frame ${mode !== 'off' ? weatherStyles.skyFrame : ''}`} data-sky-phase={mode !== 'off' ? phase : undefined}>
    <header className={`topbar ${mode !== 'off' ? weatherStyles.headerSurface : ''}`}>
      <HeaderSkyBackdrop />
      <span className="brand"><span>Ielts<b>WithHarry</b></span></span>
      <div className="header-search"><input aria-label="Search" placeholder="Search lessons, topics or skills..." /></div>
      <div className="header-actions"><HeaderWeatherWidget /></div>
    </header>
    <aside className="sidebar" style={{ padding: 16 }}>
      <strong>Weather preview</strong>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6, marginTop: 12 }}>
        {Object.keys(PREVIEW_WEATHER).map((key) => <li key={key}><Link href={`?weather=${key}`} prefetch={false} onClick={(event) => { event.preventDefault(); window.location.search = `?weather=${key}`; }}>{key}</Link></li>)}
      </ul>
    </aside>
    <main className="main-area">
      <div className="page-enter" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {Array.from({ length: 9 }, (_, index) => <section key={index} className="card" style={{ minHeight: 170, padding: 20 }}>
          <h3>Card {index + 1}</h3><p>Nội dung mẫu để xem hiệu ứng thời tiết đè lên giao diện học.</p>
        </section>)}
      </div>
      <HeaderWeatherEffects />
    </main>
  </div>;
}

type Steppable = { step(dt: number): void; draw(): void };

/** `await __weatherBench('storm', 1200, 480)` — ms per simulated frame, independent of rAF throttling. */
function benchmark(key: string, width = 1200, height = 480, frames = 240) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px`;
  document.body.append(canvas);
  const renderer = new WeatherRenderer(canvas, 'page');
  renderer.resize();
  renderer.setScene(sceneForWeather(previewWeather(`?weather=${key}`)), 'strong');
  const internal = renderer as unknown as Steppable;
  for (let i = 0; i < 120; i += 1) internal.step(1 / 60);
  const start = performance.now();
  for (let i = 0; i < frames; i += 1) { internal.step(1 / 60); internal.draw(); }
  const perFrame = (performance.now() - start) / frames;
  renderer.destroy();
  canvas.remove();
  return Number(perFrame.toFixed(3));
}

export function WeatherPreview({ phase }: { phase: DayPhase | null }) {
  useEffect(() => { (window as unknown as { __weatherBench: typeof benchmark }).__weatherBench = benchmark; }, []);
  return <HeaderWeatherProvider previewPhase={phase}><Frame /></HeaderWeatherProvider>;
}
