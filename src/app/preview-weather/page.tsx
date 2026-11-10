import { notFound } from 'next/navigation';
import { weatherPreviewAllowed } from '@/components/header-weather/weatherEffects';
import { WeatherPreview } from './weather-preview';
import type { DayPhase } from '@/components/header-weather';

const PHASES: DayPhase[] = ['earlyMorning', 'lateMorning', 'midday', 'lateAfternoon', 'sunset', 'night', 'lateNight'];

/** Dev / Vercel-preview fixture: /preview-weather?weather=storm&phase=night renders the learner header + page weather. */
export default async function PreviewWeatherPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!weatherPreviewAllowed()) notFound();
  const { phase } = await searchParams;
  const previewPhase = PHASES.find((item) => item === phase) ?? null;
  return <WeatherPreview phase={previewPhase} />;
}
