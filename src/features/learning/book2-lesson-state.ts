"use client";

import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";

export type Book2Step = "learn" | "practice" | "review";
export type Book2SavedState = {
  book2: 1;
  answers: Record<string, string>;
  checked: Record<string, boolean>;
  ratings: Record<string, number>;
  checklist: Record<string, boolean>;
  step: Book2Step;
  exerciseIndex: number;
  mastered: boolean;
  needsReview: boolean;
  updatedAt: number;
};

const emptyState = (): Book2SavedState => ({ book2: 1, answers: {}, checked: {}, ratings: {}, checklist: {}, step: "learn", exerciseIndex: 0, mastered: false, needsReview: false, updatedAt: 0 });
const storageKey = (slug: string) => `book2-state:${slug}`;

function parseState(value: string | null): Book2SavedState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Book2SavedState>;
    if (parsed.book2 !== 1 || !parsed.answers || !parsed.checked || !parsed.ratings) return null;
    return { ...emptyState(), ...parsed };
  } catch { return null; }
}

function legacyState(slug: string): Book2SavedState {
  const state = emptyState();
  try { state.answers = JSON.parse(localStorage.getItem(`book2-draft:${slug}`) ?? "{}"); } catch { /* old draft may be malformed */ }
  try { state.checked = JSON.parse(localStorage.getItem(`book2-checked:${slug}`) ?? "{}"); } catch { /* old checks may be malformed */ }
  return state;
}

/** The existing account draft store holds this course's JSON state until a dedicated migration is available. */
export async function loadBook2State(slug: string): Promise<Book2SavedState> {
  let cached: Book2SavedState | null = null;
  try { cached = parseState(localStorage.getItem(storageKey(slug))); } catch { /* storage may be disabled */ }
  const local = cached ?? legacyState(slug);
  if (!liveMode) return local;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("body").eq("lesson_slug", slug).maybeSingle();
  const remote = parseState(data?.body ?? null);
  const selected = remote && remote.updatedAt > local.updatedAt ? remote : local;
  if (selected === remote) {
    try { localStorage.setItem(storageKey(slug), JSON.stringify(remote)); } catch { /* remote remains available */ }
  }
  return selected;
}

export async function saveBook2State(slug: string, state: Book2SavedState) {
  const body = JSON.stringify(state);
  try { localStorage.setItem(storageKey(slug), body); } catch { /* account sync remains available */ }
  if (!liveMode) return false;
  if (body.length > 20000) throw new Error("Bản nháp quá dài để đồng bộ tài khoản.");
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("writing_drafts").upsert({ user_id: data.user.id, lesson_slug: slug, body, updated_at: new Date(state.updatedAt).toISOString() }, { onConflict: "user_id,lesson_slug" });
  if (error) throw new Error(error.message);
  return true;
}

export function readBook2Summary(value: string | null): Pick<Book2SavedState, "mastered" | "needsReview"> | null {
  const state = parseState(value);
  return state ? { mastered: state.mastered, needsReview: state.needsReview } : null;
}
