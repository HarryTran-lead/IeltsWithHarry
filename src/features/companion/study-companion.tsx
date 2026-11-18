"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { Harry3D } from "@/components/companion/harry-3d";
import type { HarryMood } from "@/components/companion/harry-moods";
import type { Streak } from "@/lib/account";
import { companionEventName, type CompanionEvent } from "@/lib/companion-events";
import { companionLines, renderLine, specialDays, type CompanionAction, type CompanionChoice, type CompanionTrigger } from "./companion-lines";
import { localDay, resetStudySession, useStudyTime } from "./use-study-time";

/*
 * Harry, the floating study buddy. He watches a few learning signals (time
 * studied today, streak, today's activity kinds, Daily News, scores, page)
 * and now and then says something from companion-lines. A small rule table
 * decides priority and how often each moment may repeat, and the learner can
 * make him chattier, quieter, silent, or tuck him away.
 */

type Level = "chatty" | "normal" | "quiet" | "off";
type Priority = 1 | 2 | 3;
type Rule = { priority: Priority; perDay?: number; cooldownMin?: number };
type Memory = {
  day: string;
  lastVisitDay?: string;
  said: Partial<Record<CompanionTrigger, number>>;
  counts: Partial<Record<CompanionTrigger, number>>;
  recent: string[];
  lastSpoke: number;
  level: Level;
  tucked: boolean;
  /** Today's study goal in minutes, set by answering Harry. */
  goal?: number;
  /** Today's quiz results as ratios, oldest first. */
  scores?: number[];
};
type Message = { id: number; text: string; mood: HarryMood; action?: CompanionAction; choices?: CompanionChoice[] };
type Pending = { trigger: CompanionTrigger; values?: Record<string, string | number>; at: number };

const storageKey = "ieltswithharry-companion";
const levels: { id: Level; label: string; hint: string }[] = [
  { id: "chatty", label: "Hay trò chuyện", hint: "Mẹo, từ vựng, nhắc nhở thường xuyên" },
  { id: "normal", label: "Vừa phải", hint: "Khen, nhắc chuỗi, nhắc đọc báo" },
  { id: "quiet", label: "Ít nói", hint: "Chỉ khen khi xong bài và mốc quan trọng" },
  { id: "off", label: "Im lặng", hint: "Chỉ nói khi bạn bấm vào Harry" },
];

function rule(trigger: CompanionTrigger): Rule {
  if (trigger.startsWith("greet_") || trigger === "welcome_back" || trigger === "late_night") return { priority: 2, perDay: 1 };
  if (trigger.startsWith("day_")) return { priority: 2, perDay: 1 };
  if (["weekend", "monday", "friday", "sunday_evening", "early_bird", "check_in", "goal_ask", "busy_day"].includes(trigger)) return { priority: 1, perDay: 1 };
  if (trigger === "goal_half" || trigger === "goal_reached" || trigger === "streak_milestone") return { priority: 3, perDay: 1 };
  if (trigger === "tab_return") return { priority: 1, cooldownMin: 30 };
  if (trigger === "idle_long") return { priority: 1, cooldownMin: 60 };
  if (trigger.startsWith("study_")) return { priority: 3, perDay: 1 };
  if (trigger.startsWith("score_") || trigger === "break_start" || trigger === "break_over") return { priority: 3 };
  if (trigger === "did_generic") return { priority: 3, cooldownMin: 4 };
  if (trigger.startsWith("did_")) return { priority: 3, cooldownMin: 2 };
  if (trigger.startsWith("page_")) return { priority: 1, perDay: 1 };
  switch (trigger) {
    case "break_reminder": return { priority: 3, cooldownMin: 45 };
    case "streak_first": case "streak_kept": case "streak_risk_late": return { priority: 3, perDay: 1 };
    case "streak_strong": case "streak_restart": case "news_nudge": return { priority: 2, perDay: 1 };
    case "streak_risk": return { priority: 2, perDay: 2, cooldownMin: 120 };
    case "news_unread": return { priority: 2, perDay: 2, cooldownMin: 180 };
    case "idle": return { priority: 1, cooldownMin: 20 };
    case "score_hot_streak": case "score_tough": case "score_comeback": return { priority: 3 };
    default: return { priority: 1, cooldownMin: 15 };
  }
}

/* Minimum quiet time since Harry last spoke, per level and priority (ms). */
const gaps: Record<Level, Record<Priority, number> | null> = {
  chatty: { 3: 12_000, 2: 90_000, 1: 120_000 },
  normal: { 3: 20_000, 2: 180_000, 1: 300_000 },
  quiet: { 3: 120_000, 2: Infinity, 1: Infinity },
  off: null,
};
const ambientGapMin: Record<Level, number> = { chatty: 10, normal: 25, quiet: Infinity, off: Infinity };
const quietMilestones = new Set<CompanionTrigger>(["study_30", "study_60", "study_120"]);
const milestones = [120, 90, 60, 45, 30, 20, 10] as const;
const streakMilestones = new Set([3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 1000]);

const pageTriggers: [RegExp, CompanionTrigger][] = [
  [/^\/app\/reading/, "page_reading"],
  [/^\/app\/listening/, "page_listening"],
  [/^\/app\/writing/, "page_writing"],
  [/^\/app\/speaking/, "page_speaking"],
  [/^\/app\/vocabulary/, "page_vocabulary"],
  [/^\/app\/grammar/, "page_grammar"],
  [/^\/app\/news(\/|$)(?!learn)/, "page_news"],
  [/^\/app\/planner/, "page_planner"],
  [/^\/app\/progress/, "page_progress"],
  [/^\/app\/notebook/, "page_notebook"],
  [/^\/app\/learn/, "page_learn"],
  [/^\/app\/study-together/, "page_study_room"],
];

function freshMemory(previous?: Partial<Memory>): Memory {
  return { day: localDay(), said: {}, counts: {}, recent: previous?.recent ?? [], lastSpoke: 0, level: previous?.level ?? "normal", tucked: previous?.tucked ?? false, lastVisitDay: previous?.lastVisitDay };
}

function loadMemory(): Memory {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Memory | null;
    if (!saved) return freshMemory();
    return saved.day === localDay() ? { ...freshMemory(saved), ...saved } : freshMemory(saved);
  } catch {
    return freshMemory();
  }
}

function saveMemory(memory: Memory) {
  try { localStorage.setItem(storageKey, JSON.stringify(memory)); } catch { /* Harry forgets after this visit. */ }
}

/** "Đỗ Quang Thiện" → "Thiện"; "Mai Anh" or "Harry T" → first word. */
function callName(name?: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words.length >= 3 ? words[words.length - 1] : words[0];
}

function greetingFor(hour: number): CompanionTrigger {
  if (hour >= 5 && hour < 11) return "greet_morning";
  if (hour >= 11 && hour < 13) return "greet_noon";
  if (hour >= 13 && hour < 18) return "greet_afternoon";
  if (hour >= 18 && hour < 22) return "greet_evening";
  return hour < 5 ? "late_night" : "greet_night";
}

function todayKinds(streak: Streak | null) {
  if (!streak) return null;
  return new Set(streak.days.find((day) => day.day === streak.today)?.kinds ?? []);
}

/** "Gợi ý học gì": pick what today is still missing. */
function suggestion(streak: Streak | null, minutesToday: number): CompanionTrigger {
  const kinds = todayKinds(streak) ?? new Set<string>();
  if (minutesToday >= 90) return "suggest_rest";
  if (!kinds.has("news_read")) return "suggest_news";
  if (!kinds.has("word")) return "suggest_vocab";
  if (!kinds.has("lesson")) return "suggest_lesson";
  const options: CompanionTrigger[] = ["suggest_listening", "suggest_writing", "suggest_vocab"];
  return options[Math.floor(Math.random() * options.length)];
}

function quietPage() {
  return Boolean(document.querySelector(".bt-runner, [data-companion-quiet]"));
}

export function StudyCompanion({ streak, newsUnread = 0, name, hidden = false }: { streak: Streak | null; newsUnread?: number; name?: string; hidden?: boolean }) {
  const pathname = usePathname();
  const study = useStudyTime();
  const [ready, setReady] = useState(false);
  const [level, setLevelState] = useState<Level>("normal");
  const [tucked, setTucked] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [open, setOpen] = useState(false);
  const [restMood, setRestMood] = useState<HarryMood>("happy");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hop, setHop] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [badge, setBadge] = useState(false);

  const memory = useRef<Memory | null>(null);
  const pending = useRef<Pending[]>([]);
  const signals = useRef({ streak, newsUnread, name, pathname, study, hidden, pageSince: Date.now() });
  const lastKinds = useRef<Set<string> | null>(null);
  const lastStreak = useRef<Streak | null>(null);
  const lastSpecific = useRef(0);
  const hideTimer = useRef(0);
  const hovering = useRef(false);
  const openRef = useRef(false);
  const breakTimer = useRef(0);
  const idCounter = useRef(0);

  const remember = useCallback((change: (current: Memory) => void) => {
    const current = memory.current ?? loadMemory();
    if (current.day !== localDay()) Object.assign(current, freshMemory(current));
    change(current);
    memory.current = current;
    saveMemory(current);
  }, []);

  const close = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    openRef.current = false;
    setOpen(false);
    setRestMood(signals.current.study.idleSeconds > 300 ? "sleepy" : "happy");
  }, []);

  const scheduleHide = useCallback((text: string, waitsForReply = false) => {
    window.clearTimeout(hideTimer.current);
    // A question with reply buttons stays up longer so the learner can answer.
    const ms = waitsForReply ? 30_000 : Math.min(15_000, Math.max(6_500, 4_000 + text.length * 70));
    hideTimer.current = window.setTimeout(function hideLater() {
      if (hovering.current) { hideTimer.current = window.setTimeout(hideLater, 1_500); return; }
      close();
    }, ms);
  }, [close]);

  const lineValues = useCallback((values: Record<string, string | number | undefined> = {}) => {
    const { streak: currentStreak, name: learnerName, study: time } = signals.current;
    return { name: callName(learnerName), minutes: time.minutesToday, streak: currentStreak?.current, goal: memory.current?.goal, ...values };
  }, []);

  const show = useCallback((text: string, mood: HarryMood, action?: CompanionAction, choices?: CompanionChoice[]) => {
    idCounter.current += 1;
    setMessage({ id: idCounter.current, text, mood, action, choices });
    setHop((value) => value + 1);
    setBadge(false);
    openRef.current = true;
    setOpen(true);
    scheduleHide(text, Boolean(choices?.length));
  }, [scheduleHide]);

  /** Say a line for `trigger` right now (no rule checks). */
  const speak = useCallback((requested: CompanionTrigger, values: Record<string, string | number | undefined> = {}) => {
    const trigger = requested === "chat_suggest" ? suggestion(signals.current.streak, signals.current.study.minutesToday) : requested;
    const options = companionLines[trigger];
    if (!options?.length) return;
    const recent = memory.current?.recent ?? [];
    const fresh = options.filter((line) => !recent.includes(line.text));
    const line = (fresh.length ? fresh : options)[Math.floor(Math.random() * (fresh.length || options.length))];
    const text = renderLine(line.text, lineValues(values));
    show(text, line.mood ?? "happy", line.action, line.choices);
    remember((current) => {
      current.said[trigger] = Date.now();
      current.counts[trigger] = (current.counts[trigger] ?? 0) + 1;
      current.lastSpoke = Date.now();
      current.recent = [...current.recent.filter((item) => item !== line.text), line.text].slice(-40);
    });
  }, [lineValues, remember, show]);

  /** The learner tapped one of Harry's reply buttons. */
  const answer = useCallback((choice: CompanionChoice) => {
    if (choice.goal) remember((current) => { current.goal = choice.goal; current.counts.goal_ask = 1; });
    if (choice.say) {
      show(renderLine(choice.say, lineValues()), choice.mood ?? "happy", choice.action, choice.then);
      remember((current) => { current.lastSpoke = Date.now(); });
      return;
    }
    if (choice.next) speak(choice.next);
  }, [lineValues, remember, show, speak]);

  /** Whether a proactive trigger may speak now under the learner's level. */
  const allowed = useCallback((trigger: CompanionTrigger, now: number) => {
    const current = memory.current;
    if (!current) return false;
    const gap = gaps[current.level];
    if (!gap) return trigger === "break_over";
    const { priority, perDay, cooldownMin } = rule(trigger);
    if (current.level === "quiet" && trigger.startsWith("study_") && !quietMilestones.has(trigger)) return false;
    if (now - current.lastSpoke < gap[priority]) return false;
    if (perDay !== undefined && (current.counts[trigger] ?? 0) >= perDay) return false;
    const last = current.said[trigger];
    if (cooldownMin && last && now - last < cooldownMin * 60_000) return false;
    return true;
  }, []);

  const evaluate = useCallback(() => {
    if (!memory.current) return;
    if (memory.current.day !== localDay()) remember(() => undefined);
    const nowQuiet = signals.current.hidden || quietPage();
    setQuiet(nowQuiet);
    if (nowQuiet || openRef.current) return;
    const now = Date.now();
    const { streak: currentStreak, newsUnread: unread, pathname: path, study: time, pageSince } = signals.current;
    const current = memory.current;
    const hour = new Date().getHours();

    // 1. Things that just happened, most important first.
    pending.current = pending.current.filter((item) => now - item.at < 180_000);
    const queued = [...pending.current].sort((a, b) => rule(b.trigger).priority - rule(a.trigger).priority);
    for (const item of queued) {
      if (!allowed(item.trigger, now)) continue;
      // Tucked away: keep the message for when the learner opens Harry again.
      if (current.tucked) { setBadge(true); return; }
      pending.current = pending.current.filter((entry) => entry !== item);
      speak(item.trigger, item.values);
      return;
    }
    if (current.tucked) return;

    // 2. Conditions that hold right now.
    const candidates: [CompanionTrigger, Record<string, string | number>?][] = [];
    const greeted = (["greet_morning", "greet_noon", "greet_afternoon", "greet_evening", "greet_night", "late_night", "welcome_back"] as CompanionTrigger[]).some((key) => current.counts[key]);
    if (!greeted) {
      const away = current.lastVisitDay ? Math.round((new Date(localDay()).getTime() - new Date(current.lastVisitDay).getTime()) / 86_400_000) : 0;
      candidates.push([away >= 3 ? "welcome_back" : greetingFor(hour)]);
    }
    const date = new Date();
    const special = specialDays[`${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`];
    if (special) candidates.push([special]);
    const kinds = todayKinds(currentStreak);
    if (currentStreak && !currentStreak.activeToday) {
      if (currentStreak.current > 0 && hour >= 21) candidates.push(["streak_risk_late"]);
      else if (currentStreak.current > 0 && hour >= 18) candidates.push(["streak_risk"]);
      if (currentStreak.current === 0 && currentStreak.longest > 1) candidates.push(["streak_restart", { count: currentStreak.longest }]);
      if (currentStreak.current >= 7) candidates.push(["streak_strong"]);
    }
    const milestone = milestones.find((minutes) => time.minutesToday >= minutes);
    if (milestone) candidates.push([`study_${milestone}` as CompanionTrigger]);
    if (time.continuousMinutes >= 50) candidates.push(["break_reminder"]);
    const onNews = /^\/app\/news(\/|$)/.test(path) && !path.startsWith("/app/news/learn");
    if (!onNews && unread > 0) candidates.push(["news_unread", { count: unread }]);
    if (!onNews && kinds && !kinds.has("news_read") && (time.minutesToday >= 10 || hour >= 16)) candidates.push(["news_nudge"]);
    const day = date.getDay();
    if (day === 0 && hour >= 18) candidates.push(["sunday_evening"]);
    if (day === 0 || day === 6) candidates.push(["weekend"]);
    if (day === 1 && hour < 18) candidates.push(["monday"]);
    if (day === 5) candidates.push(["friday"]);
    if (hour >= 5 && hour < 7 && currentStreak?.activeToday) candidates.push(["early_bird"]);
    // Today's goal: ask once after the greeting, then cheer at half way and at the finish.
    if (current.goal) {
      if (time.minutesToday >= current.goal) candidates.push(["goal_reached", { goal: current.goal }]);
      else if (current.goal >= 20 && time.minutesToday >= current.goal / 2) candidates.push(["goal_half", { goal: current.goal }]);
    } else if (greeted && time.minutesToday < 30) candidates.push(["goal_ask"]);
    if (greeted) candidates.push(["check_in"]);
    const events = currentStreak?.days.find((entry) => entry.day === currentStreak.today)?.events ?? 0;
    if (events >= 5) candidates.push(["busy_day", { count: events }]);
    const page = pageTriggers.find(([pattern]) => pattern.test(path))?.[1];
    if (page && now - pageSince > 3_500) candidates.push([page]);
    if (time.idleSeconds >= 900 && document.visibilityState === "visible") candidates.push(["idle_long"]);
    else if (time.idleSeconds >= 240 && document.visibilityState === "visible") candidates.push(["idle"]);
    if (time.idleSeconds < 90 && now - current.lastSpoke > ambientGapMin[current.level] * 60_000) candidates.push([Math.random() < 0.5 ? "tip" : "word_of_moment"]);

    const pick = candidates
      .map((entry, index) => ({ entry, index, priority: rule(entry[0]).priority }))
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .find(({ entry }) => allowed(entry[0], now));
    if (!pick) return;
    const [trigger, values] = pick.entry;
    // Reaching a big milestone also counts the smaller ones as said.
    if (trigger.startsWith("study_")) remember((memo) => { for (const minutes of milestones) if (minutes < Number(trigger.slice(6))) memo.counts[`study_${minutes}` as CompanionTrigger] = 1; });
    speak(trigger, values);
  }, [allowed, remember, speak]);

  const queue = useCallback((trigger: CompanionTrigger, values?: Record<string, string | number>) => {
    pending.current.push({ trigger, values, at: Date.now() });
    window.setTimeout(evaluate, 400);
  }, [evaluate]);

  // Load memory once and greet a few seconds after the page settles.
  useEffect(() => {
    const loaded = loadMemory();
    memory.current = loaded;
    const frame = requestAnimationFrame(() => {
      setLevelState(loaded.level);
      setTucked(loaded.tucked);
      setReady(true);
    });
    const greet = window.setTimeout(() => {
      evaluate();
      remember((current) => { current.lastVisitDay = localDay(); });
    }, 3_500);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(greet); window.clearTimeout(hideTimer.current); window.clearTimeout(breakTimer.current); };
  }, [evaluate, remember]);

  // Keep the latest signals for callbacks; a new page restarts the page-tip clock.
  useEffect(() => {
    const pageChanged = signals.current.pathname !== pathname;
    signals.current = { streak, newsUnread, name, pathname, study, hidden, pageSince: pageChanged ? Date.now() : signals.current.pageSince };
  }, [streak, newsUnread, name, pathname, study, hidden]);

  // Re-check on every study tick (15 s) and shortly after a page change.
  useEffect(() => {
    const timer = window.setTimeout(evaluate, 300);
    return () => window.clearTimeout(timer);
  }, [study, evaluate]);
  useEffect(() => {
    const timer = window.setTimeout(evaluate, 4_000);
    return () => window.clearTimeout(timer);
  }, [pathname, evaluate]);

  // Streak changes tell us what the learner just finished today.
  useEffect(() => {
    if (!streak) return;
    const previous = lastStreak.current;
    const kinds = todayKinds(streak) ?? new Set<string>();
    const known = lastKinds.current;
    lastStreak.current = streak;
    lastKinds.current = kinds;
    if (!previous || !known) return;
    if (!previous.activeToday && streak.activeToday) {
      lastSpecific.current = Date.now();
      queue(streak.current <= 1 ? "streak_first" : streakMilestones.has(streak.current) ? "streak_milestone" : "streak_kept", { streak: streak.current });
    }
    const added = [...kinds].filter((kind) => !known.has(kind));
    if (added.length) {
      lastSpecific.current = Date.now();
      const trigger = `did_${added[0]}` as CompanionTrigger;
      queue(trigger in companionLines ? trigger : "did_generic");
    }
  }, [streak, queue]);

  // Activity events, scores and direct requests from other components.
  useEffect(() => {
    let timer = 0;
    const onActivity = () => {
      const at = Date.now();
      window.clearTimeout(timer);
      // Give the streak reload a moment to report something more specific.
      timer = window.setTimeout(() => { if (lastSpecific.current < at - 500) queue("did_generic"); }, 3_500);
    };
    const onCompanion = (event: Event) => {
      const detail = (event as CustomEvent<CompanionEvent>).detail;
      if (!detail) return;
      if (detail.kind === "say") {
        // `force` skips the timing rules: used by direct requests such as the preview page.
        if (detail.force) speak(detail.trigger, detail.values);
        else queue(detail.trigger, detail.values);
        return;
      }
      if (!detail.total) return;
      lastSpecific.current = Date.now();
      const ratio = detail.score / detail.total;
      const before = memory.current?.scores ?? [];
      remember((current) => { current.scores = [...(current.scores ?? []), ratio].slice(-10); });
      const lastTwo = before.slice(-2);
      let trigger: CompanionTrigger = ratio >= 1 ? "score_perfect" : ratio >= 0.7 ? "score_good" : ratio >= 0.5 ? "score_ok" : "score_low";
      if (ratio >= 0.9 && lastTwo.length === 2 && lastTwo.every((value) => value >= 0.9)) trigger = "score_hot_streak";
      else if (ratio < 0.5 && before.length && before[before.length - 1] < 0.5) trigger = "score_tough";
      else if (ratio >= 0.7 && before.length && before[before.length - 1] < 0.5) trigger = "score_comeback";
      queue(trigger, { count: detail.score, total: detail.total });
    };
    window.addEventListener("learner-activity", onActivity);
    window.addEventListener("learner-xp-updated", onActivity);
    window.addEventListener(companionEventName, onCompanion);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("learner-activity", onActivity);
      window.removeEventListener("learner-xp-updated", onActivity);
      window.removeEventListener(companionEventName, onCompanion);
    };
  }, [queue, speak, remember]);

  // Coming back to the tab after a while away.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) queue("tab_return");
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [queue]);

  function setLevel(next: Level) {
    setLevelState(next);
    remember((current) => { current.level = next; });
    setMenuOpen(false);
  }

  function setTuck(next: boolean) {
    setTucked(next);
    setMenuOpen(false);
    remember((current) => { current.tucked = next; });
    if (next) { close(); return; }
    const waiting = [...pending.current].sort((a, b) => rule(b.trigger).priority - rule(a.trigger).priority)[0];
    pending.current = pending.current.filter((entry) => entry !== waiting);
    if (waiting) speak(waiting.trigger, waiting.values);
    else speak("tap");
  }

  function runAction(action: CompanionAction) {
    if (action.kind === "break") {
      resetStudySession();
      speak("break_start");
      window.clearTimeout(breakTimer.current);
      breakTimer.current = window.setTimeout(() => queue("break_over"), 5 * 60_000);
      return;
    }
    close();
  }

  if (!ready || quiet) return null;

  if (tucked) {
    return (
      <button type="button" className={`companion-peek ${badge ? "has-badge" : ""}`} onClick={() => setTuck(false)} aria-label={badge ? "Harry có lời nhắn mới. Bấm để mở" : "Mở lại Harry"} title="Mở lại Harry">
        <Image src="/ieltswithharry-mascot.webp" alt="" width={56} height={56} />
      </button>
    );
  }

  const mood = open && message ? message.mood : restMood;
  return (
    <div className={`study-companion ${open ? "is-talking" : ""}`}>
      {open && message && (
        <div className="companion-bubble" key={message.id} onPointerEnter={() => { hovering.current = true; }} onPointerLeave={() => { hovering.current = false; }} onFocus={() => { hovering.current = true; }} onBlur={() => { hovering.current = false; }}>
          <p>{message.text}</p>
          {message.choices?.length ? (
            <div className="companion-choices">
              {message.choices.map((choice) => <button key={choice.label} type="button" onClick={() => answer(choice)}>{choice.label}</button>)}
            </div>
          ) : null}
          {message.action && (message.action.href
            ? <Link className="companion-action" href={message.action.href} onClick={close}>{message.action.label}</Link>
            : <button type="button" className="companion-action" onClick={() => runAction(message.action!)}>{message.action.label}</button>)}
          <button type="button" className="companion-close" onClick={close} aria-label="Đóng lời nhắn"><X size={14} /></button>
        </div>
      )}
      <div className="companion-live" role="status" aria-live="polite">{open && message ? `Harry: ${message.text}` : ""}</div>
      <button type="button" className="companion-body" onClick={() => { setMenuOpen(false); speak(Math.random() < 0.4 ? "chat_menu" : "tap"); }} aria-label="Harry, bạn đồng hành học tập. Bấm để trò chuyện">
        <span className="companion-name" aria-hidden="true">Harry</span>
        <Harry3D mood={mood} width={100} pulse={hop} />
      </button>
      <button type="button" className="companion-menu-toggle" onClick={() => { if (!menuOpen) close(); setMenuOpen(!menuOpen); }} aria-expanded={menuOpen} aria-label="Tùy chỉnh Harry"><MoreHorizontal size={15} /></button>
      {menuOpen && (
        <div className="companion-menu" role="menu" aria-label="Harry nói chuyện mức nào?">
          <strong>Harry nói chuyện…</strong>
          {levels.map((item) => (
            <button key={item.id} type="button" role="menuitemradio" aria-checked={level === item.id} className={level === item.id ? "active" : ""} onClick={() => setLevel(item.id)}>
              <span>{item.label}</span><small>{item.hint}</small>
            </button>
          ))}
          <button type="button" role="menuitem" className="companion-tuck" onClick={() => setTuck(true)}>Thu nhỏ Harry</button>
        </div>
      )}
    </div>
  );
}
