import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { createClient } from "@/lib/supabase/server";
import {
  addDays, asProgressSkill, attemptMinutes, bucketActivity, dayDiff, isDay, localDay, skillFromSlug,
  type ActivityItem, type ProgressGoals, type ProgressReport,
} from "@/lib/study-progress";
export const runtime = "nodejs";

type Linked<T> = T | T[] | null;
const one = <T,>(value: Linked<T>) => (Array.isArray(value) ? value[0] ?? null : value);
const band = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Daily study counts for the dashboard: question-bank tests, lesson exercises, course practice and page visits. */
export async function GET(request: Request) {
  try {
    const user = await viewer(), db = await createClient(), url = new URL(request.url);
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("timezone,target_band,target_reading,target_listening,target_writing,target_speaking,exam_date").eq("id", user.id).single();
    if (profileError || !profile) throw new Error(profileError?.message || "Profile unavailable");
    const timezone = profile.timezone || "Asia/Ho_Chi_Minh", today = localDay(new Date(), timezone);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!isDay(from) || !isDay(to) || from > to || dayDiff(from, to) > 62) throw new Error("Choose a range of up to 62 days");
    // A day boundary in any time zone lies within a day of UTC midnight.
    const since = `${addDays(from, -1)}T00:00:00Z`, until = `${addDays(to, 2)}T00:00:00Z`;

    const [bank, exercises, practice, visits, streakDays] = await Promise.all([
      bankClient().from("ielts_attempts").select("started_at,submitted_at,state,ielts_exams(skill,duration_minutes)")
        .eq("user_id", user.id).gte("started_at", `${addDays(from, -2)}T00:00:00Z`).lt("started_at", until).limit(500),
      db.from("exercise_attempts").select("lesson_slug,submitted_at").gte("submitted_at", since).lt("submitted_at", until).limit(500),
      db.from("package_practice_results").select("lesson_slug,updated_at").gte("updated_at", since).lt("updated_at", until).limit(500),
      db.from("study_visits").select("visited_at").gte("visited_at", since).lt("visited_at", until).limit(500),
      db.from("learner_activity_days").select("day").gte("day", from).lte("day", to),
    ]);
    const failure = bank.error || exercises.error || practice.error || visits.error || streakDays.error;
    if (failure) throw new Error(failure.message);

    const slugs = [...new Set([...(exercises.data ?? []), ...(practice.data ?? [])].map((row) => row.lesson_slug))];
    const { data: lessons } = slugs.length ? await db.from("lessons").select("slug,skill").in("slug", slugs) : { data: [] };
    const lessonSkill = new Map((lessons ?? []).map((row) => [row.slug as string, asProgressSkill(row.skill)]));
    const skillOf = (slug: string) => lessonSkill.get(slug) ?? skillFromSlug(slug);

    const items: ActivityItem[] = [];
    for (const row of bank.data ?? []) {
      const exam = one(row.ielts_exams as Linked<{ skill: string; duration_minutes: number }>);
      const done = row.state !== "in_progress" && row.submitted_at;
      items.push({ at: done ? row.submitted_at! : row.started_at, skill: asProgressSkill(exam?.skill), counted: Boolean(done), minutes: attemptMinutes(row.started_at, row.submitted_at, exam?.duration_minutes ?? 20) });
    }
    const exerciseDays = new Set<string>();
    for (const row of exercises.data ?? []) {
      exerciseDays.add(`${row.lesson_slug}@${localDay(row.submitted_at, timezone)}`);
      items.push({ at: row.submitted_at, skill: skillOf(row.lesson_slug), counted: true, minutes: 0 });
    }
    // Course practice keeps only its latest result per lesson; skip it when the same lesson was already graded that day.
    for (const row of practice.data ?? []) {
      if (exerciseDays.has(`${row.lesson_slug}@${localDay(row.updated_at, timezone)}`)) continue;
      items.push({ at: row.updated_at, skill: skillOf(row.lesson_slug), counted: true, minutes: 0 });
    }
    for (const row of visits.data ?? []) items.push({ at: row.visited_at, skill: "other", counted: false, minutes: 0 });

    const goals: ProgressGoals = {
      overall: band(profile.target_band), Reading: band(profile.target_reading), Listening: band(profile.target_listening),
      Writing: band(profile.target_writing), Speaking: band(profile.target_speaking), examDate: profile.exam_date,
    };
    const report: ProgressReport = { today, timezone, goals, days: bucketActivity(items, from, to, timezone, (streakDays.data ?? []).map((row) => row.day as string)) };
    return Response.json(report);
  } catch (error) { return requestError(error); }
}

const bandSchema = z.number().min(1).max(9).multipleOf(0.5).nullable();
const goalsSchema = z.object({ overall: bandSchema, Reading: bandSchema, Listening: bandSchema, Writing: bandSchema, Speaking: bandSchema, examDate: z.iso.date().nullable() });
export async function POST(request: Request) {
  try {
    const user = await viewer(), goals = goalsSchema.parse(await request.json());
    const { error } = await (await createClient()).from("profiles").update({
      target_band: goals.overall, target_reading: goals.Reading, target_listening: goals.Listening, target_writing: goals.Writing,
      target_speaking: goals.Speaking, exam_date: goals.examDate, updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) { return requestError(error); }
}
