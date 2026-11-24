import type { Skill, StudyTask } from "@/lib/demo-data";
import { lessonInfo } from "./links";

/*
 * Pure planner rules shared by the Planner page, the Dashboard card and the tests.
 * Days are plain `YYYY-MM-DD` strings in the learner's local calendar; arithmetic runs on UTC
 * midnights so a day never shifts with the browser's time zone or daylight saving.
 */

const DAY_MS = 86_400_000;
const toUTC = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDay(day: string, offset: number) {
  return fromUTC(toUTC(day) + offset * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday, the order Vietnamese calendars use (T2 … CN). */
export function weekdayOf(day: string) {
  const js = new Date(toUTC(day)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function mondayOf(day: string) {
  return addDay(day, 1 - weekdayOf(day));
}

/** Monday to Sunday of the week holding `day`. */
export function weekOfDay(day: string) {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, index) => addDay(monday, index));
}

export const weekdayShort = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const weekdayLong = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"] as const;

export function shortDate(day: string) {
  return `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;
}

/** "Hôm nay", "Ngày mai", "Hôm qua", otherwise "Thứ Năm, 26/11". */
export function dayLabel(day: string, today: string) {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  if (diff === -1) return "Hôm qua";
  return `${weekdayLong[weekdayOf(day) - 1]}, ${shortDate(day)}`;
}

/** The weekday name alone, for "Thêm việc cho Thứ Năm". */
export function weekdayName(day: string, today: string) {
  const diff = daysBetween(today, day);
  if (diff === 0) return "hôm nay";
  if (diff === 1) return "ngày mai";
  return weekdayLong[weekdayOf(day) - 1];
}

/** First day of the month `offset` months away from the month holding `day`. */
export function addMonths(day: string, offset: number) {
  const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** "Tháng 11/2026". */
export function monthLabel(day: string) {
  return `Tháng ${Number(day.slice(5, 7))}/${day.slice(0, 4)}`;
}

/** Monday-first weeks covering the whole month of `day`: 4 to 6 rows of 7 days, edges spilling into the next months. */
export function monthGrid(day: string) {
  const first = `${day.slice(0, 7)}-01`;
  const last = addDay(addMonths(day, 1), -1);
  const start = mondayOf(first);
  const days = daysBetween(start, addDay(mondayOf(last), 6)) + 1;
  return Array.from({ length: days }, (_, index) => addDay(start, index));
}

export function weekRangeLabel(day: string) {
  const week = weekOfDay(day);
  return `${shortDate(week[0])} – ${shortDate(week[6])}`;
}

/** Planned minutes: the task's own length, else the usual length of the work it links to, else 20. */
export function minutesOf(task: Pick<StudyTask, "duration" | "lesson">) {
  return task.duration ?? lessonInfo(task.lesson)?.minutes ?? 20;
}

/** Open tasks dated before today, oldest first. */
export function overdueTasks(tasks: StudyTask[], today: string) {
  return tasks.filter((task) => !task.completed && task.date < today).sort(byDayOrder);
}

export function lateDays(task: Pick<StudyTask, "date">, today: string) {
  return Math.max(0, daysBetween(task.date, today));
}

/** One day's tasks: open ones in the learner's order, finished ones after them. */
export function tasksForDay(tasks: StudyTask[], day: string) {
  return tasks.filter((task) => task.date === day).sort((a, b) => Number(a.completed) - Number(b.completed) || byDayOrder(a, b));
}

/** Date, then the learner's own order, then time, then title, so ties never flicker between renders. */
export function byDayOrder(a: StudyTask, b: StudyTask) {
  return a.date.localeCompare(b.date)
    || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || (a.time || "99").localeCompare(b.time || "99")
    || a.title.localeCompare(b.title);
}

export type PlannerSummary = {
  today: { done: number; total: number; minutes: number; doneMinutes: number };
  week: { done: number; total: number; minutes: number };
  overdue: number;
};

export function plannerSummary(tasks: StudyTask[], today: string): PlannerSummary {
  const week = new Set(weekOfDay(today));
  const todays = tasks.filter((task) => task.date === today);
  const weeks = tasks.filter((task) => week.has(task.date));
  const sum = (list: StudyTask[]) => list.reduce((total, task) => total + minutesOf(task), 0);
  return {
    today: { done: todays.filter((task) => task.completed).length, total: todays.length, minutes: sum(todays), doneMinutes: sum(todays.filter((task) => task.completed)) },
    week: { done: weeks.filter((task) => task.completed).length, total: weeks.length, minutes: sum(weeks) },
    overdue: overdueTasks(tasks, today).length,
  };
}

/** Per-day counts for the week strip. */
export function dayCounts(tasks: StudyTask[], days: string[]) {
  return new Map(days.map((day) => {
    const list = tasks.filter((task) => task.date === day);
    return [day, { total: list.length, done: list.filter((task) => task.completed).length }] as const;
  }));
}

/** An open task for the same linked work on that day already exists (so a second "Đặt lịch" is not needed). */
export function findPlanned(tasks: StudyTask[], lesson: string | undefined, day: string) {
  if (!lesson) return undefined;
  return tasks.find((task) => task.lesson === lesson && task.date === day && !task.completed);
}

const skillWords: [Skill, RegExp][] = [
  ["Reading", /(reading|passage|đọc|tfng|true\/false|heading)/i],
  ["Listening", /(listening|section|nghe|dictation|chép chính tả)/i],
  ["Writing", /(writing|task ?[12]|essay|viết|bài luận)/i],
  ["Speaking", /(speaking|part ?[123]|cue card|nói|topic)/i],
  ["Vocabulary", /(vocab|vocabulary|từ vựng|collocation|word)/i],
  ["Grammar", /(grammar|ngữ pháp|tense|thì)/i],
  ["Review", /(^ôn|\sôn|review|sổ lỗi)/i],
];

/** Best guess of a free-text task's skill, so a quick-added task does not land in the wrong colour. */
export function inferSkill(title: string): Skill {
  return skillWords.find(([, pattern]) => pattern.test(title))?.[0] ?? "Personal";
}

/** Dates of a repeating task: the chosen weekdays from `start` for `weeks` weeks, at most 60. */
export function seriesDates(start: string, weekdays: number[], weeks: number) {
  const wanted = new Set(weekdays.filter((day) => day >= 1 && day <= 7));
  if (!wanted.size) return [start];
  const end = addDay(start, Math.max(1, Math.min(12, weeks)) * 7 - 1);
  const dates: string[] = [];
  for (let day = start; day <= end && dates.length < 60; day = addDay(day, 1)) {
    if (wanted.has(weekdayOf(day))) dates.push(day);
  }
  return dates.length ? dates : [start];
}

/** "~1 giờ 10 phút", "~25 phút". */
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}
