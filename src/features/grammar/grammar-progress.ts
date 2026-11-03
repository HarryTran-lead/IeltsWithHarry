"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import type { GrammarLessonProgress, GrammarProgress, GrammarResponse, GrammarReview } from "@/lib/grammar/types";

const STORAGE = "ieltswithharry-grammar-v1";
/** The table has no review column; the lesson schedule travels inside the responses JSON under this key. */
const REVIEW_KEY = "_review";
const emptyLesson = (): GrammarLessonProgress => ({ theorySeen: false, responses: {}, updatedAt: new Date().toISOString() });

function fromRow(row: { theory_seen: boolean; responses: Record<string, unknown> | null; updated_at: string }): GrammarLessonProgress {
  const { [REVIEW_KEY]: review, ...responses } = row.responses ?? {};
  return { theorySeen: row.theory_seen, responses: responses as Record<string, GrammarResponse>, updatedAt: row.updated_at, ...(review ? { review: review as GrammarReview } : {}) };
}

/** Grammar progress for the signed-in learner: a device copy plus account sync to `grammar_study_progress`. */
export function useGrammarProgress() {
  const [progress, setProgress] = useState<GrammarProgress>({});
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [storageKey, setStorageKey] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      let db: ReturnType<typeof createClient> | null = null;
      let key = `${STORAGE}:demo`;
      if (!demoMode) {
        try {
          db = createClient();
          const { data, error } = await db.auth.getUser();
          if (error || !data.user) throw error ?? new Error("No authenticated user");
          key = `${STORAGE}:${data.user.id}`;
        } catch {
          if (active) { setSyncError("Không xác định được tài khoản để tải tiến độ. Vui lòng đăng nhập lại."); setReady(true); }
          return;
        }
      }
      let local: GrammarProgress = {};
      try { local = JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { /* ignore damaged cache */ }
      if (db) {
        try {
          const { data, error } = await db.from("grammar_study_progress").select("lesson_code,theory_seen,responses,updated_at");
          if (error) throw error;
          for (const row of data ?? []) {
            const remote = fromRow(row);
            if (!local[row.lesson_code] || remote.updatedAt > local[row.lesson_code].updatedAt) local[row.lesson_code] = remote;
          }
        } catch { if (active) setSyncError("Chưa tải được tiến độ từ tài khoản. Tiến độ trên thiết bị này vẫn có thể sử dụng."); }
      }
      if (active) { setStorageKey(key); setProgress(local); setReady(true); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(progress));
    if (demoMode || !Object.keys(progress).length) return;
    const timer = window.setTimeout(async () => {
      try {
        const db = createClient();
        const rows = Object.entries(progress).map(([lesson_code, value]) => ({
          lesson_code, theory_seen: value.theorySeen, updated_at: value.updatedAt,
          responses: value.review ? { ...value.responses, [REVIEW_KEY]: value.review } : value.responses,
        }));
        const { error } = await db.from("grammar_study_progress").upsert(rows, { onConflict: "user_id,lesson_code" });
        if (error) throw error;
        setSyncError("");
      } catch { setSyncError("Chưa đồng bộ được với tài khoản. Bài làm vẫn được lưu trên thiết bị này."); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [progress, ready, storageKey]);

  const update = useCallback((code: string, edit: (value: GrammarLessonProgress) => GrammarLessonProgress) => {
    setProgress((current) => {
      const value = edit(current[code] ?? emptyLesson());
      return { ...current, [code]: { ...value, updatedAt: new Date().toISOString() } };
    });
  }, []);
  return { progress, ready, syncError, update };
}

export type GrammarUpdate = ReturnType<typeof useGrammarProgress>["update"];
