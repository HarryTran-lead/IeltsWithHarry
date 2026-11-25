export const progressSkills = ["Reading", "Listening", "Writing", "Speaking"] as const;
export type ProgressSkill = (typeof progressSkills)[number];

/**
 * One local day. `active` is the single definition of a study day: at least one real learning event
 * (a finished exercise, test, quiz, dictation, saved word…) or five minutes of active study time.
 * Opening a page does not count. `minutes` is the larger of timed-test minutes and active study minutes.
 */
export type ProgressDay = Record<ProgressSkill, number> & { day: string; other: number; minutes: number; testMinutes: number; activeMinutes: number; active: boolean };
/** One thing the learner finished, for the per-day list. */
export type DayEntry = { at: string; day: string; kind: "test" | "lesson" | "practice" | "news" | "dictation"; skill: ProgressSkill | "other"; title: string; score: number | null; total: number | null; link: string | null };
export type ProgressGoals = { overall: number | null; Reading: number | null; Listening: number | null; Writing: number | null; Speaking: number | null; examDate: string | null };
export type ProgressReport = { today: string; timezone: string; goals: ProgressGoals; days: ProgressDay[]; entries?: DayEntry[] };

/** One piece of learning. `counted` items are finished exercises; the rest only mark the day as active. */
export type ActivityItem = { at: string; skill: ProgressSkill | "other"; minutes: number; counted: boolean };
/** Learning days recorded by the database (events > 0) and active study seconds per local day. */
export type DayMarks = { activeDays?: string[]; activeSeconds?: Record<string, number> };

export const emptyGoals: ProgressGoals = { overall: null, Reading: null, Listening: null, Writing: null, Speaking: null, examDate: null };
/** The overall target implied by four skill targets (IELTS rounding), or null while any is unset. */
export function derivedOverallGoal(goals: ProgressGoals) {
  const skills = progressSkills.map((skill) => goals[skill]);
  if (skills.some((value) => value === null)) return null;
  const mean = (skills as number[]).reduce((sum, value) => sum + value, 0) / 4;
  const whole = Math.floor(mean), fraction = mean - whole;
  return fraction < 0.25 ? whole : fraction < 0.75 ? whole + 0.5 : whole + 1;
}
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
  // Dictation results (Skill Lab lessons and sentences) are Listening practice.
  if (/^skill-lab(?:-dictation|-turn)?:/.test(slug)) return "Listening";
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
  return { day, Reading: 0, Listening: 0, Writing: 0, Speaking: 0, other: 0, minutes: 0, testMinutes: 0, activeMinutes: 0, active: false };
}

/** Five minutes of active study make a day count, the same rule the database uses for its event. */
export const ACTIVE_DAY_SECONDS = 300;

/**
 * Per-day counts from `from` to `to` (inclusive) in the learner's time zone.
 * Only counted items, database learning days and five active minutes mark a day as studied.
 */
export function bucketActivity(items: ActivityItem[], from: string, to: string, timeZone: string, marks: DayMarks | string[] = {}) {
  const { activeDays = [], activeSeconds = {} } = Array.isArray(marks) ? { activeDays: marks } : marks;
  const days = new Map<string, ProgressDay>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, emptyDay(day));
  for (const item of items) {
    const row = days.get(localDay(item.at, timeZone));
    if (!row) continue;
    row.testMinutes += item.minutes;
    if (item.counted) { row[item.skill] += 1; row.active = true; }
  }
  for (const day of activeDays) { const row = days.get(day); if (row) row.active = true; }
  for (const [day, seconds] of Object.entries(activeSeconds)) {
    const row = days.get(day);
    if (!row) continue;
    row.activeMinutes = Math.floor(seconds / 60);
    if (seconds >= ACTIVE_DAY_SECONDS) row.active = true;
  }
  for (const row of days.values()) row.minutes = Math.max(row.testMinutes, row.activeMinutes);
  return [...days.values()];
}

/** 0 = nothing, 1–4 = more study, from minutes when they were measured and finished items otherwise. */
export function dayIntensity(day: ProgressDay | undefined) {
  if (!day || !day.active) return 0;
  const byMinutes = day.minutes >= 60 ? 4 : day.minutes >= 30 ? 3 : day.minutes >= 15 ? 2 : day.minutes > 0 ? 1 : 0;
  const count = dayTotal(day);
  const byCount = count >= 7 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : 1;
  return Math.max(byMinutes, byCount);
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
