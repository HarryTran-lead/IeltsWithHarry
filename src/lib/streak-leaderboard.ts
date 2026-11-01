import { addDays, localDay } from "./study-progress";

export type StreakProfile = { id: string; display_name: string; timezone: string };
export type StreakDay = { user_id: string; day: string };

/** Match learner_streak: today's run survives through tomorrow if today is still empty. */
export function currentStreak(days: ReadonlySet<string>, today: string) {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function topStreaks(profiles: StreakProfile[], activity: StreakDay[], now: Date, excluded: ReadonlySet<string> = new Set()) {
  const daysByUser = new Map<string, Set<string>>();
  for (const row of activity) {
    const days = daysByUser.get(row.user_id) ?? new Set<string>();
    days.add(row.day);
    daysByUser.set(row.user_id, days);
  }
  return profiles.flatMap((profile) => {
    if (excluded.has(profile.id)) return [];
    const days = currentStreak(daysByUser.get(profile.id) ?? new Set(), localDay(now, profile.timezone));
    return days > 0 ? [{ ...profile, days }] : [];
  }).sort((a, b) => b.days - a.days || a.display_name.localeCompare(b.display_name, "vi") || a.id.localeCompare(b.id)).slice(0, 5);
}
