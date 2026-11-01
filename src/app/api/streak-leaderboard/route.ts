import { addDays } from "@/lib/study-progress";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { topStreaks, type StreakDay, type StreakProfile } from "@/lib/streak-leaderboard";

export const runtime = "nodejs";

/** Return public-facing leaderboard fields only; profiles and activity remain protected by RLS. */
export async function GET() {
  try {
    const user = await viewer();
    const db = bankClient();
    const now = new Date();
    const todayUtc = now.toISOString().slice(0, 10);
    const recentIds = new Set<string>();
    const pageSize = 1000;

    // Only learners active around their current local day can have a current streak.
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from("learner_activity_days").select("user_id")
        .gte("day", addDays(todayUtc, -2)).lte("day", addDays(todayUtc, 1))
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) recentIds.add(row.user_id);
      if ((data?.length ?? 0) < pageSize) break;
    }
    if (recentIds.size === 0) return Response.json({ leaders: [] }, { headers: { "Cache-Control": "no-store" } });

    const ids = [...recentIds];
    const profiles: StreakProfile[] = [];
    const excluded = new Set<string>();
    const activity: StreakDay[] = [];
    // Keep PostgREST filters bounded if the community grows beyond a single page.
    for (let start = 0; start < ids.length; start += 200) {
      const batch = ids.slice(start, start + 200);
      const [people, controls] = await Promise.all([
        db.from("profiles").select("id,display_name,timezone").in("id", batch),
        db.from("account_controls").select("user_id,suspended_until").in("user_id", batch).gt("suspended_until", now.toISOString()),
      ]);
      const error = people.error || controls.error;
      if (error) throw new Error(error.message);
      profiles.push(...(people.data ?? []));
      for (const row of controls.data ?? []) excluded.add(row.user_id);
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: daysError } = await db.from("learner_activity_days").select("user_id,day")
          .in("user_id", batch).order("day", { ascending: false }).order("user_id")
          .range(offset, offset + pageSize - 1);
        if (daysError) throw new Error(daysError.message);
        activity.push(...(data ?? []));
        if ((data?.length ?? 0) < pageSize) break;
      }
    }

    const leaders = topStreaks(profiles, activity, now, excluded).map(({ id, display_name, days }) => ({
      name: display_name, days, isYou: id === user.id,
    }));
    return Response.json({ leaders }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestError(error); }
}
