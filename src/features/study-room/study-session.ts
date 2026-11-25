/** Pomodoro session for the study room: focus rounds, breaks and a check-out, kept on this device. */

export type SessionPhase = "idle" | "focus" | "break" | "done";

export type SessionTimer = {
  phase: SessionPhase;
  round: number;
  focusMinutes: number;
  /** When the running phase ends (ms since epoch); null while idle, done or paused. */
  endsAt: number | null;
  /** Seconds left when paused; null while running. */
  pausedLeft: number | null;
  /** Focus seconds finished in this session, counted when a round ends or the session closes. */
  focusedSeconds: number;
};

export const focusOptions = [25, 50, 90] as const;
export const sessionRounds = 4;
export const goalSuggestions = ["2 bài Reading", "1 bài Writing Task 2", "40 từ vựng Academic", "Speaking Part 2", "1 đề Listening"] as const;

export function breakMinutesFor(focusMinutes: number) {
  return focusMinutes >= 90 ? 15 : focusMinutes >= 50 ? 10 : 5;
}

export function idleTimer(focusMinutes = 25): SessionTimer {
  return { phase: "idle", round: 1, focusMinutes, endsAt: null, pausedLeft: null, focusedSeconds: 0 };
}

export function startFocus(timer: SessionTimer, now: number): SessionTimer {
  return { ...timer, phase: "focus", round: 1, endsAt: now + timer.focusMinutes * 60_000, pausedLeft: null, focusedSeconds: 0 };
}

export function secondsLeft(timer: SessionTimer, now: number) {
  if (timer.pausedLeft !== null) return timer.pausedLeft;
  if (timer.endsAt === null) return timer.phase === "idle" ? timer.focusMinutes * 60 : 0;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function pauseTimer(timer: SessionTimer, now: number): SessionTimer {
  if (timer.endsAt === null) return timer;
  return { ...timer, endsAt: null, pausedLeft: secondsLeft(timer, now) };
}

export function resumeTimer(timer: SessionTimer, now: number): SessionTimer {
  if (timer.pausedLeft === null) return timer;
  return { ...timer, endsAt: now + timer.pausedLeft * 1000, pausedLeft: null };
}

function focusDone(timer: SessionTimer, now: number) {
  return timer.focusMinutes * 60 - secondsLeft(timer, now);
}

export function startBreak(timer: SessionTimer, now: number): SessionTimer {
  const focusedSeconds = timer.phase === "focus" ? timer.focusedSeconds + focusDone(timer, now) : timer.focusedSeconds;
  return { ...timer, phase: "break", endsAt: now + breakMinutesFor(timer.focusMinutes) * 60_000, pausedLeft: null, focusedSeconds };
}

export function nextRound(timer: SessionTimer, now: number): SessionTimer {
  if (timer.round >= sessionRounds) return finishSession(timer, now);
  return { ...timer, phase: "focus", round: timer.round + 1, endsAt: now + timer.focusMinutes * 60_000, pausedLeft: null };
}

export function finishSession(timer: SessionTimer, now: number): SessionTimer {
  const focusedSeconds = timer.phase === "focus" ? timer.focusedSeconds + focusDone(timer, now) : timer.focusedSeconds;
  return { ...timer, phase: "done", endsAt: null, pausedLeft: null, focusedSeconds };
}

/** Moves a running phase on when its time is up; returns the same object otherwise. */
export function advance(timer: SessionTimer, now: number): SessionTimer {
  if (timer.endsAt === null || timer.endsAt > now) return timer;
  if (timer.phase === "focus") return startBreak(timer, now);
  if (timer.phase === "break") return nextRound(timer, now);
  return timer;
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const rest = String(safe % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} giờ ${rest} phút` : `${Math.floor(minutes / 60)} giờ`;
}

export type BreakQuestion = { word: string; options: readonly string[]; answer: string; tip: string };

export const breakQuestions: readonly BreakQuestion[] = [
  { word: "mitigate", options: ["reduce", "increase", "ignore"], answer: "reduce", tip: "Mitigate the effects of… — hay dùng trong Writing Task 2 khi nói về giải pháp." },
  { word: "substantial", options: ["considerable", "tiny", "temporary"], answer: "considerable", tip: "A substantial increase — mô tả mức tăng lớn trong Writing Task 1." },
  { word: "fluctuate", options: ["rise and fall", "stay stable", "disappear"], answer: "rise and fall", tip: "Prices fluctuated between… — dùng cho số liệu lên xuống thất thường." },
  { word: "detrimental", options: ["harmful", "useful", "neutral"], answer: "harmful", tip: "Be detrimental to health — trang trọng hơn “bad for”." },
  { word: "alleviate", options: ["ease", "worsen", "delay"], answer: "ease", tip: "Alleviate poverty / traffic congestion — cụm quen thuộc trong Task 2." },
  { word: "plummet", options: ["fall sharply", "grow slowly", "level off"], answer: "fall sharply", tip: "Sales plummeted to… — mạnh hơn “decrease”." },
  { word: "prevalent", options: ["widespread", "rare", "outdated"], answer: "widespread", tip: "Increasingly prevalent among young people — hợp chủ đề xã hội." },
  { word: "advocate", options: ["support publicly", "oppose", "forget"], answer: "support publicly", tip: "Some people advocate banning… — mở đoạn nêu quan điểm." },
];

export function questionForRound(round: number) {
  return breakQuestions[(Math.max(1, round) - 1 + new Date().getDate()) % breakQuestions.length];
}

export type SavedSession = {
  endedAt: string;
  goal: string;
  focusedSeconds: number;
  rounds: number;
  outcome: "done" | "partial" | "not-done";
  focusRating: number;
};

const SESSIONS_KEY = "ieltswithharry-study-sessions";

export function loadSessions(): SavedSession[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SavedSession[]) : [];
  } catch { return []; }
}

export function saveSession(entry: SavedSession) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify([...loadSessions(), entry].slice(-200))); } catch { /* Kept for this visit only. */ }
}
