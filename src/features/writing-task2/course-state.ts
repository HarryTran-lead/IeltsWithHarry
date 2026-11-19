"use client";
/*
 * A learner's work in the R01–R16 course: one writing_drafts row per practice item (slug t2-course:<module>:<id>),
 * so a long timed essay never pushes other answers past the row size limit. The browser keeps a copy of each
 * attempt and the list of references the learner opened before writing.
 */
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { COURSE_API, attemptDone, courseDraftSlug, parseCourseAttempt, type CourseAnswer, type CourseAttempt } from "@/lib/writing-task2/course-types";

const localKey = (moduleId: string, id: string) => `writing-task2-course:${moduleId}:${id}`;
const peekKey = (moduleId: string) => `writing-task2-course-peek:${moduleId}`;
const slugPrefix = "t2-course:";

function localAttempts(moduleId?: string) {
  const found: Record<string, Record<string, CourseAttempt>> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      const match = /^writing-task2-course:([^:]+):(.+)$/.exec(key);
      if (!match || (moduleId && match[1] !== moduleId)) continue;
      const attempt = parseCourseAttempt(localStorage.getItem(key));
      if (attempt) (found[match[1]] ??= {})[match[2]] = attempt;
    }
  } catch { /* storage blocked; the account copy may still load */ }
  return found;
}

/** Every saved attempt in one milestone, the newer of the browser and account copies. */
export async function loadCourseAttempts(moduleId: string): Promise<Record<string, CourseAttempt>> {
  const found = localAttempts(moduleId)[moduleId] ?? {};
  if (!liveMode) return found;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").like("lesson_slug", `${slugPrefix}${moduleId}:%`);
  for (const row of data ?? []) {
    const id = row.lesson_slug.slice(`${slugPrefix}${moduleId}:`.length);
    const remote = parseCourseAttempt(row.body);
    if (remote && (!found[id] || remote.savedAt > found[id].savedAt)) found[id] = remote;
  }
  return found;
}

export async function saveCourseAttempt(moduleId: string, id: string, attempt: CourseAttempt) {
  try { localStorage.setItem(localKey(moduleId, id), JSON.stringify(attempt)); } catch { /* the account copy below still saves */ }
  if (!liveMode) return false;
  const body = JSON.stringify(attempt);
  if (body.length > 20000) throw new Error("Bài làm quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert(
    { user_id: data.user.id, lesson_slug: courseDraftSlug(moduleId, id), body, updated_at: attempt.savedAt },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) throw new Error("Chưa lưu được vào tài khoản. Bài vẫn được giữ trên trình duyệt này.");
  return true;
}

/** How many practice items each milestone has a saved attempt for, read from slugs only. */
export async function loadCourseProgress(): Promise<Record<string, number>> {
  const ids: Record<string, Set<string>> = {};
  for (const [moduleId, attempts] of Object.entries(localAttempts())) for (const [id, attempt] of Object.entries(attempts)) if (attemptDone(attempt)) (ids[moduleId] ??= new Set()).add(id);
  if (liveMode) {
    const supabase = createClient();
    const { data } = await supabase.from("writing_drafts").select("lesson_slug").like("lesson_slug", `${slugPrefix}%`);
    for (const row of data ?? []) {
      const [, moduleId, ...rest] = row.lesson_slug.split(":");
      if (moduleId && rest.length) (ids[moduleId] ??= new Set()).add(rest.join(":"));
    }
  }
  return Object.fromEntries(Object.entries(ids).map(([moduleId, set]) => [moduleId, set.size]));
}

export function readPeeks(moduleId: string): string[] {
  try { const parsed = JSON.parse(localStorage.getItem(peekKey(moduleId)) ?? "[]"); return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []; } catch { return []; }
}
export function addPeek(moduleId: string, id: string) {
  const next = [...new Set([...readPeeks(moduleId), id])];
  try { localStorage.setItem(peekKey(moduleId), JSON.stringify(next)); } catch { /* only the marker is lost */ }
  return next;
}

export async function revealCourse(moduleId: string, id: string, attempt?: CourseAttempt): Promise<CourseAnswer> {
  const response = await fetch(`${COURSE_API}/${moduleId}/reveal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...(attempt && !liveMode && { text: attempt.text, choice: attempt.choice }) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không mở được gợi ý.");
  return (body as { answer: CourseAnswer }).answer;
}
