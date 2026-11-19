"use client";
/*
 * A learner's Speaking Lab progress per unit. Like Writing Task 2 Lab it uses the existing account draft store
 * (writing_drafts, one JSON row per unit) until a dedicated table exists. Recordings never leave the browser:
 * they are kept in IndexedDB (speaking-recordings.ts), so only timings, transcripts, notes and ticks sync.
 */
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { getLocalRecording, putLocalRecording } from "@/lib/speaking-recordings";
import { SPEAKING_API, emptySpeakingState, parseSpeakingState, speakingDraftSlug, type SpeakingRelease, type SpeakingState } from "@/lib/speaking-lab/types";

const storageKey = (unitId: string) => `speaking-lab-state:${unitId}`;

function readLocal(unitId: string) {
  try { return parseSpeakingState(localStorage.getItem(storageKey(unitId))); } catch { return null; }
}

export function cacheSpeakingState(unitId: string, state: SpeakingState) {
  try { localStorage.setItem(storageKey(unitId), JSON.stringify(state)); } catch { /* the account copy may still sync */ }
}

/** The newer of the browser copy and the account copy. */
export async function loadSpeakingState(unitId: string): Promise<SpeakingState> {
  const local = readLocal(unitId) ?? emptySpeakingState();
  if (!liveMode) return local;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("body").eq("lesson_slug", speakingDraftSlug(unitId)).maybeSingle();
  const remote = parseSpeakingState(data?.body);
  if (remote && remote.updatedAt > local.updatedAt) { cacheSpeakingState(unitId, remote); return remote; }
  return local;
}

/** Saves to the browser, then to the account. Returns false when there is no account to sync to. */
export async function saveSpeakingState(unitId: string, state: SpeakingState) {
  cacheSpeakingState(unitId, state);
  if (!liveMode) return false;
  const body = JSON.stringify(state);
  if (body.length > 20000) throw new Error("Ghi chú quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert(
    { user_id: data.user.id, lesson_slug: speakingDraftSlug(unitId), body, updated_at: new Date(state.updatedAt).toISOString() },
    { onConflict: "user_id,lesson_slug" },
  );
  if (error) throw new Error("Chưa lưu được vào tài khoản. Tiến độ vẫn được giữ trên trình duyệt này.");
  return true;
}

/** Every unit's saved progress in one read, for the map. */
export async function loadAllSpeakingStates(unitIds: string[]): Promise<Record<string, SpeakingState>> {
  const found: Record<string, SpeakingState> = {};
  for (const id of unitIds) { const local = readLocal(id); if (local) found[id] = local; }
  if (!liveMode || !unitIds.length) return found;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("lesson_slug,body").in("lesson_slug", unitIds.map(speakingDraftSlug));
  for (const row of data ?? []) {
    const id = row.lesson_slug.slice(speakingDraftSlug("").length);
    const remote = parseSpeakingState(row.body);
    if (remote && remote.updatedAt > (found[id]?.updatedAt ?? -1)) found[id] = remote;
  }
  return found;
}

/** What the server will show for this unit now. Live mode proves progress with the saved row, not this copy. */
export async function releaseSpeaking(unitId: string, state: SpeakingState): Promise<SpeakingRelease> {
  const response = await fetch(`${SPEAKING_API}/${encodeURIComponent(unitId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify(liveMode ? {} : { state }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được bài học.");
  return (body as { release: SpeakingRelease }).release;
}

const recordingSession = (unitId: string) => `spk-lab:${unitId}`;

export async function keepRecording(unitId: string, taskIndex: number, url: string) {
  const blob = await fetch(url).then((response) => response.blob());
  await putLocalRecording(recordingSession(unitId), taskIndex, blob);
}

export async function recordingUrl(unitId: string, taskIndex: number): Promise<string | null> {
  const blob = await getLocalRecording(recordingSession(unitId), taskIndex).catch(() => undefined);
  return blob ? URL.createObjectURL(blob) : null;
}
