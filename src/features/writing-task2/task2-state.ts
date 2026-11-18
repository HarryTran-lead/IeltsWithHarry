"use client";
/*
 * A learner's Writing Task 2 work per lesson. Like Book 2, it uses the existing account draft store
 * (writing_drafts, one JSON row per lesson) until a dedicated table exists; the browser keeps a copy
 * so typing is never lost offline. The reveal route reads the same row to check a save happened.
 */
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { TASK2_API, parseTask2State, task2DraftSlug, type Task2Reveal, type Task2State } from "@/lib/writing-task2/types";

export const emptyTask2State = (): Task2State => ({ t2: 1, answers: {}, saved: {}, peeked: {}, choices: {}, fills: {}, essay: "", checklist: {}, updatedAt: 0 });
const storageKey = (lessonId: string) => `writing-task2-state:${lessonId}`;

function readLocal(lessonId: string) {
  try { return parseTask2State(localStorage.getItem(storageKey(lessonId))); } catch { return null; }
}

export function cacheTask2State(lessonId: string, state: Task2State) {
  try { localStorage.setItem(storageKey(lessonId), JSON.stringify(state)); } catch { /* the account copy may still sync */ }
}

/** The newer of the browser copy and the account copy. */
export async function loadTask2State(lessonId: string): Promise<Task2State> {
  const local = readLocal(lessonId) ?? emptyTask2State();
  if (!liveMode) return local;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("body").eq("lesson_slug", task2DraftSlug(lessonId)).maybeSingle();
  const remote = parseTask2State(data?.body);
  if (remote && remote.updatedAt > local.updatedAt) { cacheTask2State(lessonId, remote); return remote; }
  return local;
}

/** Saves to the browser, then to the account. Returns false when there is no account to sync to. */
export async function saveTask2State(lessonId: string, state: Task2State) {
  cacheTask2State(lessonId, state);
  if (!liveMode) return false;
  const body = JSON.stringify(state);
  if (body.length > 20000) throw new Error("Bài làm quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert(
    { user_id: data.user.id, lesson_slug: task2DraftSlug(lessonId), body, updated_at: new Date(state.updatedAt).toISOString() },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) throw new Error("Chưa lưu được vào tài khoản. Bài vẫn được giữ trên trình duyệt này.");
  return true;
}

/** Every lesson's saved state in one read, for the roadmap. */
export async function loadAllTask2States(lessonIds: string[]): Promise<Record<string, Task2State>> {
  const found: Record<string, Task2State> = {};
  for (const id of lessonIds) { const local = readLocal(id); if (local) found[id] = local; }
  if (!liveMode || !lessonIds.length) return found;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").in("lesson_slug", lessonIds.map(task2DraftSlug));
  for (const row of data ?? []) {
    const id = row.lesson_slug.slice(task2DraftSlug("").length);
    const remote = parseTask2State(row.body);
    if (remote && remote.updatedAt > (found[id]?.updatedAt ?? -1)) found[id] = remote;
  }
  return found;
}

/** Reference answers for saved work, or, with `peek`, before the learner has written anything. */
export async function revealTask2(lessonId: string, targets: string[], state: Task2State, peek = false): Promise<Task2Reveal> {
  const texts = liveMode || peek ? undefined : Object.fromEntries(targets.map((key) => [key, key === "essay" ? state.essay : state.answers[key] ?? ""]));
  const response = await fetch(`${TASK2_API}/${lessonId}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets, texts, ...(peek && { peek: true }) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không mở được đáp án.");
  return body as Task2Reveal;
}
