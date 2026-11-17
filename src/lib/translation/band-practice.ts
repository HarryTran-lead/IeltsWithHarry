import index from "../../data/translation/band-index.json";
import rubric from "../../data/translation/level-rubric.json";
import type { PracticeExercise } from "./schema";

export const practiceBands = Array.from({ length: 17 }, (_, position) => (1 + position * 0.5).toFixed(1));

export type BandExercise = PracticeExercise;

/** Per band: progress keys (id, or id:vN after a revision), topic count and one example. */
export type BandSummary = { level: string; keys: string[]; topics: number; sample: { promptVi: string; answer: string } };

// The numbers identify practice levels. They are not official IELTS scores.
export const bandIndex = index as BandSummary[];
export const levelRubric = rubric;

export function reviewKey(item: Pick<BandExercise, "id" | "version">) {
  return item.version === 1 ? item.id : `${item.id}:v${item.version}`;
}

// One chunk per band, so the page only downloads the band the learner opens.
const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  "1.0": () => import("../../data/translation/bands/band-1-0.json"),
  "1.5": () => import("../../data/translation/bands/band-1-5.json"),
  "2.0": () => import("../../data/translation/bands/band-2-0.json"),
  "2.5": () => import("../../data/translation/bands/band-2-5.json"),
  "3.0": () => import("../../data/translation/bands/band-3-0.json"),
  "3.5": () => import("../../data/translation/bands/band-3-5.json"),
  "4.0": () => import("../../data/translation/bands/band-4-0.json"),
  "4.5": () => import("../../data/translation/bands/band-4-5.json"),
  "5.0": () => import("../../data/translation/bands/band-5-0.json"),
  "5.5": () => import("../../data/translation/bands/band-5-5.json"),
  "6.0": () => import("../../data/translation/bands/band-6-0.json"),
  "6.5": () => import("../../data/translation/bands/band-6-5.json"),
  "7.0": () => import("../../data/translation/bands/band-7-0.json"),
  "7.5": () => import("../../data/translation/bands/band-7-5.json"),
  "8.0": () => import("../../data/translation/bands/band-8-0.json"),
  "8.5": () => import("../../data/translation/bands/band-8-5.json"),
  "9.0": () => import("../../data/translation/bands/band-9-0.json"),
};

export async function loadBand(level: string): Promise<BandExercise[]> {
  const load = loaders[level];
  if (!load) throw new Error(`Unknown practice band ${level}`);
  return (await load()).default as BandExercise[];
}
