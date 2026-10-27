export const progressSkills = ["Reading", "Listening", "Writing", "Speaking"] as const;
export type ProgressSkill = (typeof progressSkills)[number];

export type ProgressDay = Record<ProgressSkill, number> & { day: string; other: number; minutes: number; active: boolean };
export type ProgressGoals = { overall: number | null; Reading: number | null; Listening: number | null; Writing: number | null; Speaking: number | null; examDate: string | null };
export type ProgressReport = { today: string; timezone: string; goals: ProgressGoals; days: ProgressDay[] };

/** One piece of learning. `counted` items are finished exercises; the rest only mark the day as active. */
export type ActivityItem = { at: string; skill: ProgressSkill | "other"; minutes: number; counted: boolean };

export const emptyGoals: ProgressGoals = { overall: null, Reading: null, Listening: null, Writing: null, Speaking: null, examDate: null };
export const bandOptions = Array.from({ length: 17 }, (_, index) => 1 + index * 0.5);

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (value: unknown): value is string => typeof value === "string" && dayPattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dayDiff(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** The calendar day of `at` in the learner's time zone, falling back to Vietnam time. */
export function localDay(at: string | Date, timeZone: string) {
  const date = typeof at === "string" ? new Date(at) : at;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}

/** Reads the skill from a lesson slug such as `starter-u01-reading-city-gardens`. */
export function skillFromSlug(slug: string): ProgressSkill | "other" {
  const match = /(?:^|-)(reading|listening|writing|speaking)(?:-|$)/.exec(slug.toLowerCase());
  return match ? progressSkills.find((skill) => skill.toLowerCase() === match[1])! : "other";
}

export function asProgressSkill(value: unknown): ProgressSkill | "other" {
  return progressSkills.includes(value as ProgressSkill) ? value as ProgressSkill : "other";
}

/** Minutes between starting and submitting a test, capped a little past its time limit so a forgotten tab does not count. */
export function attemptMinutes(startedAt: string, submittedAt: string | null, limitMinutes: number) {
  if (!submittedAt) return 0;
  const minutes = (Date.parse(submittedAt) - Date.parse(startedAt)) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(1, Math.round(Math.min(minutes, Math.max(1, limitMinutes) + 10)));
}

export function emptyDay(day: string): ProgressDay {
  return { day, Reading: 0, Listening: 0, Writing: 0, Speaking: 0, other: 0, minutes: 0, active: false };
}

/** Per-day counts from `from` to `to` (inclusive) in the learner's time zone. */
export function bucketActivity(items: ActivityItem[], from: string, to: string, timeZone: string, activeDays: string[] = []) {
  const days = new Map<string, ProgressDay>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, emptyDay(day));
  for (const item of items) {
    const row = days.get(localDay(item.at, timeZone));
    if (!row) continue;
    row.active = true;
    row.minutes += item.minutes;
    if (item.counted) row[item.skill] += 1;
  }
  for (const day of activeDays) { const row = days.get(day); if (row) row.active = true; }
  return [...days.values()];
}

export function dayTotal(day: ProgressDay) {
  return progressSkills.reduce((sum, skill) => sum + day[skill], day.other);
}

/** Monday-first weeks covering a `YYYY-MM` month, padded with the neighbouring days. */
export function monthWeeks(month: string) {
  const first = `${month}-01`;
  const start = addDays(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7));
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let monday = start; monday <= last; monday = addDays(monday, 7)) weeks.push(Array.from({ length: 7 }, (_, index) => addDays(monday, index)));
  return weeks;
}

export function weekOf(day: string) {
  const monday = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function addMonths(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}
