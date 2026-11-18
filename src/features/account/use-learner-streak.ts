"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Streak } from "@/lib/account";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";

/** Events that mean the learner just did something that may extend today's streak. */
const activityEvents = ["learner-xp-updated", "learner-activity"];

/** The signed-in learner's saved streak. Null in demo mode or while loading. */
export function useLearnerStreak() {
  const pathname = usePathname();
  const [streak, setStreak] = useState<Streak | null>(null);
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    let timer = 0;
    const load = () => { void createClient().rpc("learner_streak").then(({ data }) => { if (active && data) setStreak(data as Streak); }); };
    // Activity is written by database triggers, so give them a moment before reading back.
    const reload = () => { window.clearTimeout(timer); timer = window.setTimeout(load, 600); };
    load();
    for (const name of activityEvents) window.addEventListener(name, reload);
    return () => {
      active = false;
      window.clearTimeout(timer);
      for (const name of activityEvents) window.removeEventListener(name, reload);
    };
  }, [pathname]);
  return streak;
}
