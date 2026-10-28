"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";

type Collection = "cefr" | "ielts";

export function useStudiedWords() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [count, setCount] = useState<number | null>(demoMode ? 0 : null);
  const pending = useRef(new Set<string>());
  const requestVersion = useRef(0);

  const refreshCount = useCallback(() => {
    if (!db) return;
    const version = ++requestVersion.current;
    void db.from("vocabulary_studied_words").select("source_id", { count: "exact", head: true }).then(({ count: total, error }) => {
      if (version === requestVersion.current && !error) setCount(total ?? 0);
    });
  }, [db]);

  useEffect(() => {
    refreshCount();
    return () => { requestVersion.current += 1; };
  }, [refreshCount]);

  const markStudied = useCallback((collection: Collection, sourceId: string) => {
    if (!db || !sourceId) return;
    const key = `${collection}:${sourceId}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    void db.from("vocabulary_studied_words").insert({ collection, source_id: sourceId }).then(({ error }) => {
      if (!error || error.code === "23505") refreshCount();
      if (error && error.code !== "23505") pending.current.delete(key);
    });
  }, [db, refreshCount]);

  return { studiedCount: count, markStudied };
}
