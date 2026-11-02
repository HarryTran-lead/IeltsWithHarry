"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { nextWordReview, type ReviewGrade, type WordReview } from "@/lib/news/review";
import { useNotebook, type NotebookEntry } from "@/features/notebook/notebook-store";

const REVIEW_COLUMNS = "notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state";
export type StudyWord = { headword: string; meaning: string; example: string; pos: string; topic: string };

/** FSRS schedules for the learner's word notebook. Words met in a study session are saved and scheduled here,
 * so everything learned comes back for review instead of only words saved by hand. */
export function useWordSrs() {
  const { addEntry, ready, entries } = useNotebook();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [reviews, setReviews] = useState<Map<string, WordReview>>(new Map());
  const [loaded, setLoaded] = useState(demoMode);
  const latest = useRef(reviews);
  useEffect(() => { latest.current = reviews; }, [reviews]);

  useEffect(() => {
    if (!db) return;
    let alive = true;
    void db.from("user_word_reviews").select(REVIEW_COLUMNS).limit(1000).then(({ data }) => {
      if (!alive) return;
      setReviews(new Map(((data ?? []) as WordReview[]).map((row) => [row.notebook_entry_id, row])));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [db]);

  const grade = useCallback(async (entry: NotebookEntry, value: ReviewGrade) => {
    const before = latest.current.get(entry.id);
    const next: WordReview = { notebook_entry_id: entry.id, ...nextWordReview(before, value, new Date()) };
    if (db) {
      const result = await db.rpc("save_word_fsrs_review", { p_entry: entry.id, p_grade: value, p_state: next.fsrs_state, p_request: crypto.randomUUID(), p_previous_reviewed_at: before?.last_reviewed_at ?? null });
      if (result.error) throw result.error;
      if (result.data === false) return false;
      // The server stamps last_reviewed_at itself; keep its value so the next grade passes the concurrency check.
      const stored = await db.from("user_word_reviews").select(REVIEW_COLUMNS).eq("notebook_entry_id", entry.id).maybeSingle();
      if (stored.data) Object.assign(next, stored.data);
    }
    setReviews((current) => new Map(current).set(entry.id, next));
    return true;
  }, [db]);

  /** The notebook entry for a studied word, created on first use. */
  const ensureEntry = useCallback(async (word: StudyWord) => {
    const meaning = word.meaning.trim().slice(0, 200);
    if (!ready || !meaning) return undefined;
    return addEntry({ kind: "word", title: word.headword.slice(0, 100), body: "", meaningVi: meaning, example: word.example.slice(0, 500),
      partOfSpeech: word.pos.slice(0, 50), topic: word.topic.slice(0, 100) }, "/app/vocabulary/study");
  }, [addEntry, ready]);

  /** Saves a studied word to the notebook (once) and gives it its first FSRS grade. Words already scheduled keep their history. */
  const learn = useCallback(async (word: StudyWord, value: ReviewGrade) => {
    const entry = await ensureEntry(word);
    if (!entry || latest.current.has(entry.id)) return;
    await grade(entry, value);
  }, [ensureEntry, grade]);

  const entryFor = useCallback((headword: string) => {
    const key = headword.trim().replace(/\s+/g, " ").toLowerCase();
    return entries.find((entry) => entry.kind === "word" && entry.title.trim().replace(/\s+/g, " ").toLowerCase() === key);
  }, [entries]);

  return { reviews, loaded, grade, learn, ensureEntry, entryFor };
}
