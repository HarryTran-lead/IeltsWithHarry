import { describe, expect, it } from "vitest";
import { advance, finishSession, formatClock, formatDuration, idleTimer, nextRound, pauseTimer, resumeTimer, secondsLeft, sessionRounds, startBreak, startFocus, type SessionTimer } from "./study-session";

describe("study session timer", () => {
  it("counts down from timestamps and survives pause and resume", () => {
    const started = startFocus(idleTimer(25), 0);
    expect(secondsLeft(started, 60_000)).toBe(24 * 60);
    const paused = pauseTimer(started, 60_000);
    expect(secondsLeft(paused, 10 * 60_000)).toBe(24 * 60);
    const resumed = resumeTimer(paused, 10 * 60_000);
    expect(secondsLeft(resumed, 11 * 60_000)).toBe(23 * 60);
  });

  it("moves from focus to a break, then to the next round", () => {
    const focus = startFocus(idleTimer(25), 0);
    const onBreak = advance(focus, 25 * 60_000);
    expect(onBreak.phase).toBe("break");
    expect(onBreak.focusedSeconds).toBe(25 * 60);
    expect(secondsLeft(onBreak, 25 * 60_000)).toBe(5 * 60);
    const next = advance(onBreak, 30 * 60_000);
    expect(next.phase).toBe("focus");
    expect(next.round).toBe(2);
  });

  it("counts only the focus actually done when ending early", () => {
    const focus = startFocus(idleTimer(50), 0);
    const early = startBreak(focus, 20 * 60_000);
    expect(early.focusedSeconds).toBe(20 * 60);
    const done = finishSession(nextRound(early, 30 * 60_000), 40 * 60_000);
    expect(done.phase).toBe("done");
    expect(done.focusedSeconds).toBe(30 * 60);
  });

  it("finishes after the last round's break", () => {
    const lastBreak: SessionTimer = { ...startFocus(idleTimer(25), 0), round: sessionRounds, phase: "break", endsAt: 1 };
    expect(advance(lastBreak, 2).phase).toBe("done");
  });

  it("formats clocks and durations", () => {
    expect(formatClock(1122)).toBe("18:42");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatDuration(100 * 60)).toBe("1 giờ 40 phút");
    expect(formatDuration(48 * 60)).toBe("48 phút");
  });
});
