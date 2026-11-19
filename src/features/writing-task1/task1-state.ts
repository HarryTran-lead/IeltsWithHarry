"use client";
/*
 * A learner's Writing Task 1 work per lesson. Like the Task 2 Lab, it uses the existing account draft store
 * (writing_drafts, one JSON row per lesson); the browser keeps a copy so typing is never lost offline.
 * The reveal route reads the same row to check a save happened.
 */
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { TASK1_API, parseTask1State, task1DraftSlug, type Task1CheckResult, type Task1Model, type Task1Reveal, type Task1State } from "@/lib/writing-task1/types";

export const emptyTask1State = (): Task1State => ({ t1: 1, choices: {}, results: {}, answers: {}, saved: {}, essay: "", checklist: {}, updatedAt: 0 });
const storageKey = (lessonId: string) => `writing-task1-state:${lessonId}`;

function readLocal(lessonId: string) {
  try { return parseTask1State(localStorage.getItem(storageKey(lessonId))); } catch { return null; }
}

export function cacheTask1State(lessonId: string, state: Task1State) {
  try { localStorage.setItem(storageKey(lessonId), JSON.stringify(state)); } catch { /* the account copy may still sync */ }
}

/** The newer of the browser copy and the account copy. */
export async function loadTask1State(lessonId: string): Promise<Task1State> {
  const local = readLocal(lessonId) ?? emptyTask1State();
  if (!liveMode) return local;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("body").eq("lesson_slug", task1DraftSlug(lessonId)).maybeSingle();
  const remote = parseTask1State(data?.body);
  if (remote && remote.updatedAt > local.updatedAt) { cacheTask1State(lessonId, remote); return remote; }
  return local;
}

/** Saves to the browser, then to the account. Returns false when there is no account to sync to. */
export async function saveTask1State(lessonId: string, state: Task1State) {
  cacheTask1State(lessonId, state);
  if (!liveMode) return false;
  const body = JSON.stringify(state);
  if (body.length > 24000) throw new Error("Bài làm quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert(
    { user_id: data.user.id, lesson_slug: task1DraftSlug(lessonId), body, updated_at: new Date(state.updatedAt).toISOString() },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) throw new Error("Chưa lưu được vào tài khoản. Bài vẫn được giữ trên trình duyệt này.");
  return true;
}

/** Every lesson's saved state in one read, for the roadmap. */
export async function loadAllTask1States(lessonIds: string[]): Promise<Record<string, Task1State>> {
  const found: Record<string, Task1State> = {};
  for (const id of lessonIds) { const local = readLocal(id); if (local) found[id] = local; }
  if (!liveMode || !lessonIds.length) return found;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").in("lesson_slug", lessonIds.map(task1DraftSlug));
  for (const row of data ?? []) {
    const id = row.lesson_slug.slice(task1DraftSlug("").length);
    const remote = parseTask1State(row.body);
    if (remote && remote.updatedAt > (found[id]?.updatedAt ?? -1)) found[id] = remote;
  }
  return found;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không kết nối được máy chủ.");
  return body as T;
}

export const checkTask1 = (lessonId: string, choices: Record<string, string>) =>
  postJson<{ results: Record<string, Task1CheckResult> }>(`${TASK1_API}/${lessonId}/check`, { choices }).then((body) => body.results);

/** The model to study before writing (foundation lessons only; the route refuses the others). */
export async function learnTask1(lessonId: string): Promise<Task1Model | null> {
  const response = await fetch(`${TASK1_API}/${lessonId}/learn`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được bài mẫu.");
  return (body as { model: Task1Model | null }).model;
}

export function revealTask1(lessonId: string, targets: string[], state: Task1State): Promise<Task1Reveal> {
  const texts = liveMode ? undefined : Object.fromEntries(targets.map((key) => [key, key === "essay" ? state.essay : state.answers[key] ?? ""]));
  return postJson<Task1Reveal>(`${TASK1_API}/${lessonId}/reveal`, { targets, texts });
}
