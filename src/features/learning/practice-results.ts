"use client";

import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { readBook2Summary } from "./book2-lesson-state";

/** Self-checked practice in a course-package lesson: answers that matched, answers checked, questions in all. */
export type PracticeResult = { correct: number; checked: number; total: number; mastered?: boolean; needsReview?: boolean };

const DEMO_KEY = "ieltswithharry-practice-results-v1";
const known = new Map<string, PracticeResult | null>();
const listeners = new Set<(slug: string, result: PracticeResult) => void>();

/** A result replaces the stored one only when it covers more questions, or the same ones with more right. */
export function isBetter(next: PracticeResult, previous: PracticeResult | null | undefined) {
  if (!previous || next.total !== previous.total) return next.checked > 0;
  return next.checked > previous.checked || (next.checked === previous.checked && next.correct > previous.correct);
}

function readDemo(): Record<string, PracticeResult> {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}") as Record<string, PracticeResult>; } catch { return {}; }
}

export async function loadPracticeResults(slugs: string[]): Promise<Record<string, PracticeResult>> {
  const found: Record<string, PracticeResult> = {};
  if (!slugs.length) return found;
  if (demoMode) {
    const saved = readDemo();
    for (const slug of slugs) if (saved[slug]) found[slug] = saved[slug];
  } else {
    const supabase = createClient();
    const book2Slugs = slugs.filter((slug) => slug.startsWith("b2-"));
    const [{ data, error }, drafts] = await Promise.all([
      supabase.from("package_practice_results").select("lesson_slug,correct,checked,total").in("lesson_slug", slugs),
      book2Slugs.length ? supabase.from("writing_drafts").select("lesson_slug,body").in("lesson_slug", book2Slugs) : Promise.resolve({ data: [] as { lesson_slug: string; body: string }[] }),
    ]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) found[row.lesson_slug] = { correct: row.correct, checked: row.checked, total: row.total };
    for (const row of drafts.data ?? []) {
      const summary = readBook2Summary(row.body);
      if (summary) found[row.lesson_slug] = { ...(found[row.lesson_slug] ?? { correct: 0, checked: 0, total: 0 }), ...summary };
    }
  }
  for (const slug of slugs) known.set(slug, found[slug] ?? null);
  return found;
}

/** Book 2 shows the current attempt, including regressions, so review cannot disappear behind an old best score. */
export async function savePracticeSnapshot(slug: string, result: PracticeResult) {
  known.set(slug, result);
  if (demoMode) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify({ ...readDemo(), [slug]: result })); } catch { /* storage may be blocked */ }
    listeners.forEach((listener) => listener(slug, result));
    return;
  }
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase.from("package_practice_results").upsert(
    { user_id: userData.user.id, lesson_slug: slug, correct: result.correct, checked: result.checked, total: result.total, updated_at: new Date().toISOString() },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) { known.delete(slug); throw new Error(error.message); }
  listeners.forEach((listener) => listener(slug, result));
}

/** Keeps the learner's best result for a lesson and tells open course books about it. */
export async function savePracticeResult(slug: string, result: PracticeResult) {
  const previous = known.has(slug) ? known.get(slug) : (await loadPracticeResults([slug]))[slug];
  if (!isBetter(result, previous)) return;
  known.set(slug, result);
  listeners.forEach((listener) => listener(slug, result));
  if (demoMode) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify({ ...readDemo(), [slug]: result })); } catch { /* storage may be blocked */ }
    return;
  }
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase.from("package_practice_results").upsert(
    { user_id: userData.user.id, lesson_slug: slug, ...result, updated_at: new Date().toISOString() },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) known.delete(slug);
}

export function subscribePracticeResults(listener: (slug: string, result: PracticeResult) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** "Mastered", "keep going" or "review" once enough questions are checked to judge. */
export function resultTone(result: PracticeResult | undefined) {
  if (!result || result.checked < Math.min(3, result.total)) return "";
  const ratio = result.correct / result.checked;
  return ratio >= 0.8 ? "is-strong" : ratio >= 0.5 ? "is-fair" : "is-weak";
}
