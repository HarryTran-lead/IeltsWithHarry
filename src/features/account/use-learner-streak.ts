"use client";

import { useEffect, useState } from "react";
import type { Streak } from "@/lib/account";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";

/** The signed-in learner's saved streak. Null in demo mode or while loading. */
export function useLearnerStreak() {
  const [streak, setStreak] = useState<Streak | null>(null);
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    void createClient().rpc("learner_streak").then(({ data }) => { if (active && data) setStreak(data as Streak); });
    return () => { active = false; };
  }, []);
  return streak;
}
