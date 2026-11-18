"use client";

import { useEffect, useState } from "react";

/*
 * Counts how long the learner actually studies today on this device: time
 * only counts while the tab is visible and they touched the page in the last
 * 90 seconds (or audio/video is playing, for Listening). A pause longer than
 * 10 minutes starts a new continuous session, used for break reminders.
 */

const TICK_MS = 15_000;
const ACTIVE_WINDOW_MS = 90_000;
const SESSION_GAP_MS = 10 * 60_000;
const keyPrefix = "ieltswithharry-study-seconds:";

export type StudyTime = { minutesToday: number; continuousMinutes: number; idleSeconds: number };

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readSeconds(day: string) {
  try { return Number(localStorage.getItem(keyPrefix + day)) || 0; } catch { return 0; }
}

function writeSeconds(day: string, seconds: number) {
  try { localStorage.setItem(keyPrefix + day, String(seconds)); } catch { /* Counting continues for this visit. */ }
}

function mediaPlaying() {
  return [...document.querySelectorAll("audio, video")].some((node) => {
    const media = node as HTMLMediaElement;
    return !media.paused && !media.ended;
  });
}

/** Restart the continuous-session clock, e.g. when the learner takes a break. */
export function resetStudySession() {
  window.dispatchEvent(new Event("study-session-reset"));
}

export function useStudyTime(): StudyTime {
  const [state, setState] = useState<StudyTime>({ minutesToday: 0, continuousMinutes: 0, idleSeconds: 0 });

  useEffect(() => {
    let lastInput = Date.now();
    let lastActive = Date.now();
    let sessionSeconds = 0;
    const markInput = () => { lastInput = Date.now(); };
    const resetSession = () => { sessionSeconds = 0; };
    const inputs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of inputs) window.addEventListener(name, markInput, { passive: true, capture: true });
    window.addEventListener("study-session-reset", resetSession);

    const tick = (count: boolean) => {
      const now = Date.now();
      const day = localDay();
      let seconds = readSeconds(day);
      const active = document.visibilityState === "visible" && (now - lastInput < ACTIVE_WINDOW_MS || mediaPlaying());
      if (count && active) {
        if (now - lastActive > SESSION_GAP_MS) sessionSeconds = 0;
        seconds += TICK_MS / 1000;
        sessionSeconds += TICK_MS / 1000;
        lastActive = now;
        writeSeconds(day, seconds);
      }
      setState({ minutesToday: Math.floor(seconds / 60), continuousMinutes: Math.floor(sessionSeconds / 60), idleSeconds: Math.floor((now - lastInput) / 1000) });
    };
    const first = window.setTimeout(() => tick(false), 0);
    const timer = window.setInterval(() => tick(true), TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      for (const name of inputs) window.removeEventListener(name, markInput, { capture: true });
      window.removeEventListener("study-session-reset", resetSession);
    };
  }, []);

  return state;
}
