import index from "../../data/translation/band-index.json";
import rubric from "../../data/translation/level-rubric.json";
import type { PracticeExercise } from "./schema";

export const practiceBands = Array.from({ length: 17 }, (_, position) => (1 + position * 0.5).toFixed(1));

export type BandExercise = PracticeExercise;

/** Per band: progress keys (id, or id:vN after a revision), topic counts and one example. */
export type BandSummary = {
  level: string;
  keys: string[];
  topics: number;
  topicCounts?: Record<string, number>;
  sample: { promptVi: string; answer: string };
};

export const CANONICAL_TOPICS = [
  "Giáo dục & Trường học",
  "Công nghệ & Khoa học",
  "Sức khỏe & Y tế",
  "Môi trường & Năng lượng",
  "Đô thị & Nhà ở",
  "Công việc & Kinh tế",
  "Xã hội & Chính sách",
  "Giao thông & Đi lại",
  "Văn hóa & Du lịch",
  "Ẩm thực & Dinh dưỡng",
  "Thể thao & Giải trí",
  "Gia đình & Đời sống",
] as const;

// The numbers identify practice levels. They are not official IELTS scores.
export const bandIndex = index as BandSummary[];
export const levelRubric = rubric;

export function reviewKey(item: Pick<BandExercise, "id" | "version">) {
  return item.version === 1 ? item.id : `${item.id}:v${item.version}`;
}

/** Static file of one band's exercises (written by scripts/build-translation-practice.py). */
export function bandFile(level: string) {
  return `practice-data/translation/band-${level.replace(".", "-")}.json`;
}

// Each band is a static JSON file fetched when the band is opened, so the page never
// downloads all 2,000+ exercises at once and the bundler does not have to chunk them.
const cache = new Map<string, Promise<BandExercise[]>>();

export function loadBand(level: string): Promise<BandExercise[]> {
  if (!practiceBands.includes(level)) return Promise.reject(new Error(`Unknown practice band ${level}`));
  let pending = cache.get(level);
  if (!pending) {
    pending = fetch(`/${bandFile(level)}`).then((response) => {
      if (!response.ok) throw new Error(`Band ${level} unavailable (${response.status})`);
      return response.json() as Promise<BandExercise[]>;
    });
    pending.catch(() => cache.delete(level)); // let a later attempt retry
    cache.set(level, pending);
  }
  return pending;
}
