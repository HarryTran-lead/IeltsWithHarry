import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { createClient } from "@/lib/supabase/server";
import {
  addDays, asProgressSkill, derivedOverallGoal, attemptMinutes, bucketActivity, dayDiff, isDay, localDay, skillFromSlug,
  type ActivityItem, type DayEntry, type ProgressGoals, type ProgressReport,
} from "@/lib/study-progress";
import { hasAnswer } from "@/lib/progress-insights";
export const runtime = "nodejs";

type Linked<T> = T | T[] | null;
const one = <T,>(value: Linked<T>) => (Array.isArray(value) ? value[0] ?? null : value);
const band = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/**
 * Daily study counts and the list of finished work: question-bank tests, lesson exercises, course practice,
 * dictation and Daily News quizzes. A day counts as studied only through real learning (see `ProgressDay`):
 * page visits are not learning and are no longer read here.
 */
export async function GET(request: Request) {
  try {
    const user = await viewer(), db = await createClient(), url = new URL(request.url);
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("timezone,target_band,target_reading,target_listening,target_writing,target_speaking,exam_date").eq("id", user.id).single();
    if (profileError || !profile) throw new Error(profileError?.message || "Profile unavailable");
    const timezone = profile.timezone || "Asia/Ho_Chi_Minh", today = localDay(new Date(), timezone);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!isDay(from) || !isDay(to) || from > to || dayDiff(from, to) > 92) throw new Error("Choose a range of up to 92 days");
    // A day boundary in any time zone lies within a day of UTC midnight.
    const since = `${addDays(from, -1)}T00:00:00Z`, until = `${addDays(to, 2)}T00:00:00Z`;

    // Every read is filtered to the viewer: RLS lets admins read all learners, which must not leak into their own progress.
    const [bank, exercises, practice, learningDays, activeTime, voaDictation, clipDictation, newsAuto, newsReading] = await Promise.all([
      bankClient().from("ielts_attempts").select("id,started_at,submitted_at,state,score,total,answers,ielts_exams(title,skill,duration_minutes)")
        .eq("user_id", user.id).gte("started_at", `${addDays(from, -2)}T00:00:00Z`).lt("started_at", until).limit(1500),
      db.from("exercise_attempts").select("lesson_slug,submitted_at,score,total").eq("user_id", user.id).gte("submitted_at", since).lt("submitted_at", until).limit(1500),
      db.from("package_practice_results").select("lesson_slug,updated_at").eq("user_id", user.id).gte("updated_at", since).lt("updated_at", until).limit(1500),
      db.from("learner_activity_days").select("day").eq("user_id", user.id).gt("events", 0).gte("day", from).lte("day", to),
      db.from("learner_active_time").select("day,seconds").eq("user_id", user.id).gte("day", from).lte("day", to),
      db.from("voa_dictation_attempts").select("created_at").eq("user_id", user.id).gte("created_at", since).lt("created_at", until).limit(1000),
      db.from("dictation_clip_attempts").select("created_at").eq("user_id", user.id).gte("created_at", since).lt("created_at", until).limit(1000),
      db.from("news_auto_attempts").select("submitted_at,score,total,news_articles(id,title)").eq("user_id", user.id).gte("submitted_at", since).lt("submitted_at", until).limit(1000),
      db.from("news_reading_attempts").select("submitted_at,score,total,news_learning_articles(slug,title)").eq("user_id", user.id).gte("submitted_at", since).lt("submitted_at", until).limit(1000),
    ]);
    const failure = bank.error || exercises.error || practice.error || learningDays.error;
    if (failure) throw new Error(failure.message);

    const slugs = [...new Set([...(exercises.data ?? []), ...(practice.data ?? [])].map((row) => row.lesson_slug))];
    const { data: lessons } = slugs.length ? await db.from("lessons").select("slug,skill,title").in("slug", slugs) : { data: [] };
    const lessonInfo = new Map((lessons ?? []).map((row) => [row.slug as string, { skill: asProgressSkill(row.skill), title: (row.title as string | null) ?? null }]));
    const skillOf = (slug: string) => lessonInfo.get(slug)?.skill ?? skillFromSlug(slug);
    const titleOf = (slug: string) => slug.startsWith("translation-writing-band-")
      ? `Luyện diễn đạt · Band ${slug.slice("translation-writing-band-".length)}`
      : lessonInfo.get(slug)?.title ?? slug.replace(/^skill-lab(?:-dictation)?:/, "").replace(/[-_]+/g, " ");

    const items: ActivityItem[] = [], entries: DayEntry[] = [];
    const entry = (at: string, rest: Omit<DayEntry, "at" | "day">) => entries.push({ at, day: localDay(at, timezone), ...rest });
    for (const row of bank.data ?? []) {
      const exam = one(row.ielts_exams as Linked<{ title: string; skill: string; duration_minutes: number }>);
      // Only a submitted test with at least one answer is learning; an untouched or blank one is not.
      const done = row.state !== "in_progress" && row.submitted_at && hasAnswer(row.answers);
      if (!done) continue;
      const skill = asProgressSkill(exam?.skill);
      items.push({ at: row.submitted_at!, skill, counted: true, minutes: attemptMinutes(row.started_at, row.submitted_at, exam?.duration_minutes ?? 20) });
      entry(row.submitted_at!, { kind: "test", skill, title: exam?.title ?? "Đề IELTS", score: row.score, total: row.total, link: `/app/question-bank/result/${row.id}` });
    }
    const exerciseDays = new Set<string>();
    for (const row of exercises.data ?? []) {
      exerciseDays.add(`${row.lesson_slug}@${localDay(row.submitted_at, timezone)}`);
      items.push({ at: row.submitted_at, skill: skillOf(row.lesson_slug), counted: true, minutes: 0 });
      entry(row.submitted_at, { kind: "lesson", skill: skillOf(row.lesson_slug), title: titleOf(row.lesson_slug), score: row.score ?? null, total: row.total ?? null, link: `/app/lesson/${row.lesson_slug}` });
    }
    // Course practice keeps only its latest result per lesson; skip it when the same lesson was already graded that day.
    for (const row of practice.data ?? []) {
      // One row per sentence/exercise: the session summary row already counts the day's practice.
      if (row.lesson_slug.startsWith("skill-lab-turn:") || row.lesson_slug.startsWith("translation-item:")) continue;
      const key = `${row.lesson_slug}@${localDay(row.updated_at, timezone)}`;
      if (exerciseDays.has(key)) continue;
      exerciseDays.add(key);
      items.push({ at: row.updated_at, skill: skillOf(row.lesson_slug), counted: true, minutes: 0 });
      entry(row.updated_at, {
        kind: "practice",
        skill: skillOf(row.lesson_slug),
        title: titleOf(row.lesson_slug),
        score: null,
        total: null,
        link: row.lesson_slug.startsWith("translation-writing-band-") ? "/app/practice/translation" : null,
      });
    }
    // VOA and Quick dictation keep one row per checked sentence; count one practice per day for each bank.
    // Their tables may be missing on an older database, so a failed read only drops these items.
    for (const [label, rows] of [["VOA dictation", voaDictation.error ? [] : voaDictation.data ?? []], ["Quick dictation", clipDictation.error ? [] : clipDictation.data ?? []]] as const) {
      const perDay = new Map<string, { at: string; count: number }>();
      for (const row of rows) {
        const day = localDay(row.created_at, timezone), seen = perDay.get(day);
        if (seen) { seen.count += 1; continue; }
        perDay.set(day, { at: row.created_at, count: 1 });
        items.push({ at: row.created_at, skill: "Listening", counted: true, minutes: 0 });
      }
      for (const { at, count } of perDay.values()) entry(at, { kind: "dictation", skill: "Listening", title: `${label} · ${count} câu`, score: null, total: null, link: "/app/dictation" });
    }
    // Daily News quizzes are reading practice outside the IELTS band, so they count under "Khác".
    for (const row of newsAuto.error ? [] : newsAuto.data ?? []) {
      const article = one(row.news_articles as Linked<{ id: string; title: string }>);
      items.push({ at: row.submitted_at, skill: "other", counted: true, minutes: 0 });
      entry(row.submitted_at, { kind: "news", skill: "other", title: article?.title ?? "Quiz Daily News", score: row.score, total: row.total, link: article ? `/app/news/${article.id}` : "/app/news" });
    }
    for (const row of newsReading.error ? [] : newsReading.data ?? []) {
      const article = one(row.news_learning_articles as Linked<{ slug: string; title: string }>);
      items.push({ at: row.submitted_at, skill: "other", counted: true, minutes: 0 });
      entry(row.submitted_at, { kind: "news", skill: "other", title: article?.title ?? "Quiz Daily News", score: row.score, total: row.total, link: article ? `/app/news/learn/${article.slug}` : "/app/news" });
    }

    const goals: ProgressGoals = {
      overall: band(profile.target_band), Reading: band(profile.target_reading), Listening: band(profile.target_listening),
      Writing: band(profile.target_writing), Speaking: band(profile.target_speaking), examDate: profile.exam_date,
    };
    // The active-time table arrives with a migration; until then days fall back to finished work.
    const activeSeconds = Object.fromEntries((activeTime.error ? [] : activeTime.data ?? []).map((row) => [row.day as string, Number(row.seconds) || 0]));
    const days = bucketActivity(items, from, to, timezone, { activeDays: (learningDays.data ?? []).map((row) => row.day as string), activeSeconds });
    entries.sort((a, b) => b.at.localeCompare(a.at));
    const report: ProgressReport = { today, timezone, goals, days, entries: entries.filter((item) => item.day >= from && item.day <= to) };
    return Response.json(report);
  } catch (error) { return requestError(error); }
}

const bandSchema = z.number().min(1).max(9).multipleOf(0.5).nullable();
const goalsSchema = z.object({ overall: bandSchema, Reading: bandSchema, Listening: bandSchema, Writing: bandSchema, Speaking: bandSchema, examDate: z.iso.date().nullable() });
export async function POST(request: Request) {
  try {
    const user = await viewer(), parsed = goalsSchema.parse(await request.json());
    // A planned exam date is today or later (one day of slack for time zones west of UTC).
    if (parsed.examDate && parsed.examDate < addDays(new Date().toISOString().slice(0, 10), -1)) throw new Error("Ngày thi phải từ hôm nay trở đi");
    // With all four skill targets set, the overall target follows them.
    const goals = { ...parsed, overall: derivedOverallGoal(parsed) ?? parsed.overall };
    const { error } = await (await createClient()).from("profiles").update({
      target_band: goals.overall, target_reading: goals.Reading, target_listening: goals.Listening, target_writing: goals.Writing,
      target_speaking: goals.Speaking, exam_date: goals.examDate, updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, goals });
  } catch (error) { return requestError(error); }
}
