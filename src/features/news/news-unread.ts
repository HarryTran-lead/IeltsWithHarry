"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const SEEN_KEY = "ieltswithharry-news-seen";
const POLL_MS = 3 * 60 * 1000;
// Archive imports can add old stories; only recent ones count as "new".
const RECENT_MS = 3 * 24 * 3600 * 1000;

// The last-seen time before the current visit to Daily News, so cards can keep their "Mới" label while the learner browses.
let baseline: string | null = null;

function readSeen() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function startOfToday() {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  return day.toISOString();
}

/** When the learner last opened Daily News; a first visit counts from the start of today. */
export function newsSeenBefore() {
  return baseline ?? readSeen() ?? startOfToday();
}

/** Readable stories added to the catalog since `since`. */
export async function countNewsSince(db: ReturnType<typeof createClient>, since: string) {
  const recent = new Date(Date.now() - RECENT_MS).toISOString();
  const { count, error } = await db.from("news_archive_catalog").select("id", { count: "exact", head: true })
    .eq("publication_status", "published").eq("sensitive", false).eq("readable", true)
    .gt("fetched_at", since).gte("published_at", recent);
  if (error) throw error;
  return count ?? 0;
}

function isDailyNews(pathname: string) {
  return pathname === "/app/news" || (pathname.startsWith("/app/news/") && !pathname.startsWith("/app/news/learn"));
}

/**
 * Number of new Daily News stories for the sidebar badge. Opening Daily News
 * resets it to zero; afterwards it checks again every few minutes and when
 * the tab regains focus.
 */
export function useNewsUnread(pathname: string, enabled: boolean) {
  const [count, setCount] = useState(0);
  const onNews = isDailyNews(pathname);

  useEffect(() => {
    if (!enabled) return;
    if (onNews) {
      baseline ??= newsSeenBefore();
      try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* The badge resets for this visit only. */ }
      const frame = requestAnimationFrame(() => setCount(0));
      return () => cancelAnimationFrame(frame);
    }
    baseline = null;
    let db: ReturnType<typeof createClient>;
    try { db = createClient(); } catch { return; }
    let active = true;
    async function check() {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await countNewsSince(db, newsSeenBefore());
        if (active) setCount(next);
      } catch { /* Keep the last known count when offline. */ }
    }
    void check();
    const timer = window.setInterval(check, POLL_MS);
    const onStorage = (event: StorageEvent) => { if (event.key === SEEN_KEY) void check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, onNews]);

  return onNews ? 0 : count;
}
