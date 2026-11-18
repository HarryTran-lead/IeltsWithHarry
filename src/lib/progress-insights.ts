import { roundBand } from "@/lib/ielts-bank/band";
import { addDays, dayTotal, progressSkills, weekOf, type ProgressDay, type ProgressSkill } from "@/lib/study-progress";

/** One submitted question-bank test, with its band when it can be scored. */
export type InsightAttempt = {
  id: string; title: string; skill: ProgressSkill; format: string; score: number | null; total: number | null;
  band: number | null; partial: boolean; part: string | null; minutes: number; submittedAt: string;
};
/** Answers per question type across recent Reading/Listening tests. */
export type TypeStat = { skill: "Reading" | "Listening"; type: string; correct: number; total: number };
export type ProgressInsights = { attempts: InsightAttempt[]; questionTypes: TypeStat[] };

export type SkillSummary = {
  skill: ProgressSkill; attempts: number; current: number | null; best: number | null; previous: number | null;
  trend: { at: string; band: number; title: string }[];
};

/** Current band = mean of the latest three scored tests, rounded the IELTS way; `previous` is the three before that. */
export function skillSummaries(attempts: InsightAttempt[]): SkillSummary[] {
  return progressSkills.map((skill) => {
    const mine = attempts.filter((item) => item.skill === skill);
    const scored = mine.filter((item) => item.band !== null).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const bands = scored.map((item) => item.band!);
    const mean = (list: number[]) => (list.length ? roundBand(list.reduce((sum, value) => sum + value, 0) / list.length) : null);
    return {
      skill, attempts: mine.length,
      current: mean(bands.slice(-3)), previous: bands.length > 3 ? mean(bands.slice(-6, -3)) : null,
      best: bands.length ? Math.max(...bands) : null,
      trend: scored.slice(-12).map((item) => ({ at: item.submittedAt, band: item.band!, title: item.title })),
    };
  });
}

/** Overall estimate from the skills that have a band; null until at least one does. */
export function overallBand(summaries: SkillSummary[]) {
  const bands = summaries.map((item) => item.current).filter((value): value is number => value !== null);
  return bands.length ? { band: roundBand(bands.reduce((sum, value) => sum + value, 0) / bands.length), skills: bands.length } : null;
}

export type WeekRow = Record<ProgressSkill, number> & { start: string; end: string; other: number; minutes: number; activeDays: number; total: number };

/** Monday-first weeks ending with the week of `today`. */
export function weeklyRows(days: ProgressDay[], today: string, weeks = 12): WeekRow[] {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const lastMonday = weekOf(today)[0];
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(lastMonday, (index - weeks + 1) * 7);
    const row: WeekRow = { start, end: addDays(start, 6), Reading: 0, Listening: 0, Writing: 0, Speaking: 0, other: 0, minutes: 0, activeDays: 0, total: 0 };
    for (let offset = 0; offset < 7; offset += 1) {
      const day = byDay.get(addDays(start, offset));
      if (!day || day.day > today) continue;
      progressSkills.forEach((skill) => { row[skill] += day[skill]; });
      row.other += day.other; row.minutes += day.minutes; row.total += dayTotal(day);
      if (day.active) row.activeDays += 1;
    }
    return row;
  });
}

/** Totals for the `length` days ending today and the same span before it, for "vs. previous period" deltas. */
export function periodTotals(days: ProgressDay[], today: string, length = 28) {
  const sum = (from: string, to: string) => days.filter((day) => day.day >= from && day.day <= to).reduce((acc, day) => ({
    exercises: acc.exercises + dayTotal(day), minutes: acc.minutes + day.minutes, activeDays: acc.activeDays + (day.active ? 1 : 0),
  }), { exercises: 0, minutes: 0, activeDays: 0 });
  const start = addDays(today, -(length - 1));
  return { current: sum(start, today), previous: sum(addDays(start, -length), addDays(start, -1)), length };
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}
