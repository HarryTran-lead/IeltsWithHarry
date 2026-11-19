"use client";
/*
 * A learner's work in the R01–R16 course: one writing_drafts row per practice item (slug t2-course:<module>:<id>),
 * so a long timed essay never pushes other answers past the row size limit. The browser keeps a copy of each
 * attempt and the list of references the learner opened before writing.
 */
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { COURSE_API, attemptDone, courseDraftSlug, parseCourseAttempt, type CourseAnswer, type CourseAttempt } from "@/lib/writing-task2/course-types";
import {
  FINAL_API, finalDraftSlug, mistakeSlug, parseFinalAttempt, parseMistake,
  type FinalAttempt, type FinalBundle, type FinalPrompt, type FinalReview, type MistakeEntry,
} from "@/lib/writing-task2/final-types";

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

/* ───────────── Final assessment and mistake log (R16) ───────────── */

const finalLocal = (paperId: string) => `writing-task2-final:${paperId}`;
const mistakeLocal = (id: string) => `writing-task2-mistake:${id}`;

function scanLocal<T>(prefix: string, parse: (value: string | null) => T | null) {
  const found: Record<string, T> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (!key.startsWith(prefix)) continue;
      const value = parse(localStorage.getItem(key));
      if (value) found[key.slice(prefix.length)] = value;
    }
  } catch { /* storage blocked */ }
  return found;
}

async function upsertDraft(slug: string, body: string, updatedAt: string) {
  if (!liveMode) return false;
  if (body.length > 20000) throw new Error("Bài làm quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert({ user_id: data.user.id, lesson_slug: slug, body, updated_at: updatedAt }, { onConflict: "user_id,lesson_slug" });
  if (error) throw new Error("Chưa lưu được vào tài khoản. Bài vẫn được giữ trên trình duyệt này.");
  return true;
}

export async function loadFinalAttempts(): Promise<Record<string, FinalAttempt>> {
  const found = scanLocal("writing-task2-final:", parseFinalAttempt);
  if (!liveMode) return found;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").like("lesson_slug", "t2-final:%");
  for (const row of data ?? []) {
    const id = row.lesson_slug.slice("t2-final:".length);
    const remote = parseFinalAttempt(row.body);
    if (remote && remote.updatedAt >= (found[id]?.updatedAt ?? -1)) found[id] = remote;
  }
  return found;
}

export async function saveFinalAttempt(paperId: string, attempt: FinalAttempt) {
  try { localStorage.setItem(finalLocal(paperId), JSON.stringify(attempt)); } catch { /* the account copy still saves */ }
  return upsertDraft(finalDraftSlug(paperId), JSON.stringify(attempt), new Date(attempt.updatedAt).toISOString());
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Không kết nối được máy chủ.");
  return data as T;
}

export const fetchFinalBundle = async (): Promise<FinalBundle> => {
  const response = await fetch(FINAL_API, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Bài thi cuối khoá đang được cập nhật.");
  return data as FinalBundle;
};
export const startFinal = (paperId: string) => postJson<{ prompt: FinalPrompt; startedAt: string }>(`${FINAL_API}/${paperId}/start`);
export const reviewFinal = (paperId: string, essay: string) => postJson<{ review: FinalReview }>(`${FINAL_API}/${paperId}/review`, liveMode ? {} : { essay }).then((data) => data.review);

export async function loadMistakes(): Promise<MistakeEntry[]> {
  const found = scanLocal("writing-task2-mistake:", parseMistake);
  if (liveMode) {
    const supabase = createClient();
    const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").like("lesson_slug", "t2-mistake:%");
    for (const row of data ?? []) { const entry = parseMistake(row.body); if (entry) found[entry.id] = entry; }
  }
  return Object.values(found).sort((a, b) => a.next_review_at.localeCompare(b.next_review_at));
}

export async function saveMistake(entry: MistakeEntry) {
  try { localStorage.setItem(mistakeLocal(entry.id), JSON.stringify(entry)); } catch { /* the account copy still saves */ }
  return upsertDraft(mistakeSlug(entry.id), JSON.stringify(entry), new Date().toISOString());
}

export async function removeMistake(id: string) {
  try { localStorage.removeItem(mistakeLocal(id)); } catch { /* nothing cached */ }
  if (!liveMode) return;
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("writing_drafts").delete().eq("user_id", data.user.id).eq("lesson_slug", mistakeSlug(id));
}
