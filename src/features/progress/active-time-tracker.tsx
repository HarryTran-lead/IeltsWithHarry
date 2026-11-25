"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/** Overview pages are not study time; every other learner page is. */
const overviewRoute = /^\/app\/(dashboard|progress|profile|settings|planner|community)(\/|$)/;
const IDLE_MS = 60_000;
const FLUSH_SECONDS = 60;

/** True while a lesson's audio or video plays, so listening without touching the page still counts. */
function mediaPlaying() {
  return [...document.querySelectorAll("audio, video")].some((media) => !(media as HTMLMediaElement).paused);
}

/**
 * Real study time: a second counts while the tab is visible on a learning page and the learner
 * touched the page in the last minute (or media is playing). Sent in chunks of at most 90 seconds;
 * the database caps each call and each day and records a study day once five minutes are reached.
 */
export function ActiveTimeTracker() {
  const pathname = usePathname();
  const routeRef = useRef(pathname);
  useEffect(() => { routeRef.current = pathname; }, [pathname]);

  useEffect(() => {
    let lastInput = Date.now(), pending = 0, sending = false;
    const mark = () => { lastInput = Date.now(); };
    const flush = () => {
      if (sending || pending <= 0) return;
      const seconds = Math.min(pending, 90);
      sending = true;
      void createClient().rpc("record_active_seconds", { p_seconds: seconds })
        .then(({ error }) => { if (!error) pending -= seconds; })
        .then(() => { sending = false; }, () => { sending = false; });
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible" || overviewRoute.test(routeRef.current)) return;
      if (Date.now() - lastInput > IDLE_MS && !mediaPlaying()) return;
      pending += 1;
      if (pending >= FLUSH_SECONDS) flush();
    }, 1000);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const events = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(tick);
      events.forEach((name) => window.removeEventListener(name, mark));
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return null;
}
