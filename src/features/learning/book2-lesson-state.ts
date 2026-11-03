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

export function cacheBook2State(slug: string, state: Book2SavedState) {
  try { localStorage.setItem(storageKey(slug), JSON.stringify(state)); } catch { /* remote sync may still work */ }
}

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
const isEmpty = (state: Book2SavedState) => !Object.keys(state.answers).length && !Object.keys(state.checked).length;

/**
 * A lesson split from an older one (Unit 6 Speaking L04 into L04A–C) starts from the older lesson's answers,
 * which are keyed by the same question IDs; its position and step start fresh.
 */
function fromLegacy(state: Book2SavedState | null): Book2SavedState | null {
  return state && !isEmpty(state) ? { ...state, step: "learn", exerciseIndex: 0, mastered: false, needsReview: false, updatedAt: 0 } : null;
}

export async function loadBook2State(slug: string, legacySlug?: string): Promise<Book2SavedState> {
  let cached: Book2SavedState | null = null;
  try { cached = parseState(localStorage.getItem(storageKey(slug))); } catch { /* storage may be disabled */ }
  let local = cached ?? legacyState(slug);
  if (legacySlug && isEmpty(local)) {
    try { local = fromLegacy(parseState(localStorage.getItem(storageKey(legacySlug)))) ?? local; } catch { /* storage may be disabled */ }
  }
  if (!liveMode) return local;
  const supabase = createClient();
  const { data } = await supabase.from("writing_drafts").select("body").eq("lesson_slug", slug).maybeSingle();
  let remote = parseState(data?.body ?? null);
  if (!remote && legacySlug && isEmpty(local)) {
    const legacy = await supabase.from("writing_drafts").select("body").eq("lesson_slug", legacySlug).maybeSingle();
    remote = fromLegacy(parseState(legacy.data?.body ?? null));
    if (remote) remote.updatedAt = 1;
  }
  const selected = remote && remote.updatedAt > local.updatedAt ? remote : local;
  if (selected === remote) {
    try { localStorage.setItem(storageKey(slug), JSON.stringify(remote)); } catch { /* remote remains available */ }
  }
  return selected;
}

export async function saveBook2State(slug: string, state: Book2SavedState) {
  const body = JSON.stringify(state);
  cacheBook2State(slug, state);
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
