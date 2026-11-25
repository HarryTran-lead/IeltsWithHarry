"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock3, Expand, Pause, Pencil, Play, SkipForward, Square, X } from "lucide-react";
import { useStudyPresence } from "./study-presence";
import {
  advance, breakMinutesFor, finishSession, focusOptions, formatClock, formatDuration, goalSuggestions, idleTimer,
  nextRound, pauseTimer, questionForRound, resumeTimer, saveSession, secondsLeft, sessionRounds, startBreak, startFocus,
  type SavedSession, type SessionTimer,
} from "./study-session";

const DAILY_TARGET_SECONDS = 60 * 60;
const outcomes: { value: SavedSession["outcome"]; label: string }[] = [
  { value: "done", label: "Xong rồi" },
  { value: "partial", label: "Một phần" },
  { value: "not-done", label: "Chưa xong" },
];

/** A short chime when a focus round or a break ends; silent where audio is blocked. */
function chime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.65);
    oscillator.onended = () => void context.close();
  } catch { /* Audio is optional. */ }
}

/** The session timer lives with the room (not the dock), so it keeps running while the room is shown as a mini player. */
export function useStudySession() {
  const { sessionActive, setSessionActive } = useStudyPresence();
  const [timer, setTimer] = useState<SessionTimer>(() => idleTimer(25));
  const [now, setNow] = useState(0);
  const previousPhase = useRef(timer.phase);
  const baseTitle = useRef<string | null>(null);

  const running = timer.endsAt !== null;
  const paused = timer.pausedLeft !== null;
  const inRound = timer.phase === "focus" || timer.phase === "break";
  const left = secondsLeft(timer, now);
  const clock = formatClock(left);
  const phaseName = timer.phase === "break" ? "Giờ nghỉ" : "Tập trung";
  const phaseTotal = (timer.phase === "break" ? breakMinutesFor(timer.focusMinutes) : timer.focusMinutes) * 60;
  const progress = timer.phase === "done" ? 100 : inRound ? Math.min(100, Math.max(0, ((phaseTotal - left) / phaseTotal) * 100)) : 0;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      setTimer((previous) => advance(previous, time));
    };
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 250);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [running]);

  // One pause for everything: pausing the study time (here or in the mini player) also pauses the round.
  useEffect(() => {
    const time = Date.now();
    const frame = window.requestAnimationFrame(() => {
      setNow(time);
      setTimer((previous) => {
        if (!sessionActive && previous.endsAt !== null) return pauseTimer(previous, time);
        if (sessionActive && previous.pausedLeft !== null) return resumeTimer(previous, time);
        return previous;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sessionActive]);

  useEffect(() => {
    const before = previousPhase.current;
    previousPhase.current = timer.phase;
    if (before !== timer.phase && (before === "focus" || before === "break")) chime();
  }, [timer.phase, timer.round]);

  useEffect(() => {
    if (!running) {
      if (baseTitle.current !== null) { document.title = baseTitle.current; baseTitle.current = null; }
      return;
    }
    if (baseTitle.current === null) baseTitle.current = document.title;
    document.title = `${clock} · ${phaseName} – Cùng học`;
  }, [running, clock, phaseName]);

  useEffect(() => () => { if (baseTitle.current !== null) document.title = baseTitle.current; }, []);

  function change(next: (timer: SessionTimer, now: number) => SessionTimer) {
    const time = Date.now();
    setNow(time);
    setTimer((previous) => next(previous, time));
    if (!sessionActive) setSessionActive(true);
  }

  return {
    timer, left, clock, phaseName, progress, running, paused, inRound,
    start: () => change(startFocus),
    takeBreak: () => change(startBreak),
    nextRound: () => change(nextRound),
    finish: () => { const time = Date.now(); setNow(time); setTimer((previous) => finishSession(previous, time)); },
    reset: () => setTimer((previous) => idleTimer(previous.focusMinutes)),
    setFocusMinutes: (minutes: number) => setTimer(idleTimer(minutes)),
    togglePause: () => setSessionActive(!sessionActive),
  };
}

export type StudySession = ReturnType<typeof useStudySession>;

/** Today's study time, shown in the room heading. */
export function StudyTodayChip() {
  const { studySeconds, sessionActive, setSessionActive } = useStudyPresence();
  const percent = Math.min(100, Math.round((studySeconds / DAILY_TARGET_SECONDS) * 100));
  return <div className={`study-today-chip ${sessionActive ? "on" : ""}`}>
    <Clock3 size={17} />
    <div className="study-today-copy">
      <span><strong>{formatDuration(studySeconds)}</strong> hôm nay</span>
      <span className="study-today-bar" role="progressbar" aria-label="Tiến độ mục tiêu 60 phút hôm nay" aria-valuemin={0} aria-valuemax={60} aria-valuenow={Math.min(60, Math.floor(studySeconds / 60))}><i style={{ width: `${percent}%` }} /></span>
    </div>
    <button type="button" onClick={() => setSessionActive(!sessionActive)} aria-label={sessionActive ? "Dừng tính giờ học" : "Tiếp tục tính giờ học"} title={sessionActive ? "Dừng tính giờ" : "Tiếp tục tính giờ"}>
      {sessionActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
    </button>
  </div>;
}

/** The session bar under the video, plus the break challenge and check-out floating over the video. */
export function StudySessionDock({ session }: { session: StudySession }) {
  const { goal, setGoal, learners, sessionActive } = useStudyPresence();
  const { timer, clock, phaseName, progress, paused, inRound } = session;
  const [draft, setDraft] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [quizClosed, setQuizClosed] = useState(false);
  const [outcome, setOutcome] = useState<SavedSession["outcome"] | null>(null);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const exitFocusButton = useRef<HTMLButtonElement | null>(null);
  const question = questionForRound(timer.round);
  const others = learners.filter((item) => !item.self && item.active).length;
  const isPaused = paused || (inRound && !sessionActive);
  const tone = timer.phase === "break" ? "break" : isPaused ? "paused" : inRound ? "focus" : timer.phase;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setAnswer(null); setQuizClosed(false); });
    return () => window.cancelAnimationFrame(frame);
  }, [timer.phase, timer.round]);

  useEffect(() => { if (focusMode) exitFocusButton.current?.focus(); }, [focusMode]);

  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setGoal(draft);
    setEditingGoal(false);
  }

  function save() {
    if (!outcome) return;
    saveSession({ endedAt: new Date().toISOString(), goal, focusedSeconds: timer.focusedSeconds, rounds: timer.round, outcome, focusRating: rating });
    setSaved(true);
  }

  function newSession() {
    session.reset();
    setOutcome(null);
    setRating(0);
    setSaved(false);
  }

  const pauseButton = <button type="button" className="study-dock-button light" onClick={session.togglePause}>
    {isPaused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}{isPaused ? "Tiếp tục" : "Tạm dừng"}
  </button>;

  return <>
    {timer.phase === "break" && !quizClosed && <div className="study-float-card" role="region" aria-label="Thử thách giờ nghỉ">
      <button type="button" className="study-float-close" onClick={() => setQuizClosed(true)} aria-label="Ẩn thử thách"><X size={15} /></button>
      <span className="study-float-label">Thử thách giờ nghỉ</span>
      <strong>“{question.word}” gần nghĩa nhất với?</strong>
      <div className="study-float-options">
        {question.options.map((option) => {
          const state = answer === null ? "" : option === question.answer ? "right" : option === answer ? "wrong" : "";
          return <button key={option} type="button" className={state} disabled={answer !== null} onClick={() => setAnswer(option)}>{option}</button>;
        })}
      </div>
      {answer !== null && <p role="status">{answer === question.answer ? "Chính xác! " : `Đáp án: ${question.answer}. `}{question.tip}</p>}
    </div>}

    {timer.phase === "done" && <div className="study-float-card" role="region" aria-label="Tổng kết phiên học">
      <span className="study-float-label">Phiên học kết thúc</span>
      <strong>{formatDuration(timer.focusedSeconds)} tập trung · {timer.round} vòng</strong>
      {saved ? <>
        <p className="study-float-saved"><Check size={16} /> Đã lưu. Giữ nhịp này nhé!</p>
        <button type="button" className="study-dock-button primary" onClick={newSession}>Bắt đầu phiên mới</button>
      </> : <>
        <span className="study-float-question">Bạn đã xong “{goal || "mục tiêu"}” chưa?</span>
        <div className="study-float-options">{outcomes.map((item) => <button key={item.value} type="button" aria-pressed={outcome === item.value} className={outcome === item.value ? "selected" : ""} onClick={() => setOutcome(item.value)}>{item.label}</button>)}</div>
        <span className="study-float-question">Mức tập trung</span>
        <div className="study-float-options rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`Mức ${value} trên 5`} aria-pressed={rating === value} className={rating === value ? "selected" : ""} onClick={() => setRating(value)}>{value}</button>)}</div>
        <div className="study-float-actions">
          <button type="button" className="study-dock-button primary" disabled={!outcome} onClick={save}>Lưu phiên học</button>
          <button type="button" className="study-dock-button ghost" onClick={newSession}>Bỏ qua</button>
        </div>
      </>}
    </div>}

    <section className={`study-dock ${tone}`} aria-label="Phiên học của bạn">
      <span className="study-dock-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>

      <div className="study-dock-clock">
        <span className="study-dock-phase"><i />{inRound ? (isPaused ? "Tạm dừng" : phaseName) : timer.phase === "done" ? "Hoàn thành" : "Sẵn sàng"}</span>
        <strong role="timer" aria-label={`Đồng hồ ${clock}`}>{timer.phase === "done" ? formatClock(timer.focusedSeconds) : clock}</strong>
        <span className="study-dock-rounds" aria-label={`Vòng ${timer.round} trên ${sessionRounds}`}>
          {Array.from({ length: sessionRounds }, (_, index) => <i key={index} className={index + 1 < timer.round || timer.phase === "done" ? "done" : index + 1 === timer.round && inRound ? "now" : ""} />)}
        </span>
      </div>

      <div className="study-dock-goal">
        <span className="study-dock-label">Mục tiêu hôm nay</span>
        {!goal || editingGoal
          ? <form onSubmit={saveGoal} className="study-dock-goal-form">
            <label htmlFor="study-goal" className="sr-only">Mục tiêu hôm nay</label>
            <input id="study-goal" list="study-goal-ideas" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} placeholder="Ví dụ: 2 bài Reading" autoComplete="off" />
            <datalist id="study-goal-ideas">{goalSuggestions.map((item) => <option key={item} value={item} />)}</datalist>
            <button type="submit" disabled={!draft.trim()} aria-label="Lưu mục tiêu"><Check size={16} /></button>
          </form>
          : <button type="button" className="study-dock-goal-text" onClick={() => { setDraft(goal); setEditingGoal(true); }} title="Đổi mục tiêu">
            <strong>{goal}</strong><Pencil size={13} aria-hidden="true" />
          </button>}
      </div>

      <div className="study-dock-actions">
        {timer.phase === "idle" && <>
          <label className="study-dock-select"><span className="sr-only">Độ dài mỗi vòng</span>
            <select value={timer.focusMinutes} onChange={(event) => session.setFocusMinutes(Number(event.target.value))}>
              {focusOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút × {sessionRounds}</option>)}
            </select>
          </label>
          <button type="button" className="study-dock-button primary" onClick={session.start}><Play size={15} fill="currentColor" /> Bắt đầu</button>
        </>}
        {timer.phase === "focus" && <>
          {pauseButton}
          <button type="button" className="study-dock-button ghost" onClick={session.takeBreak}>Nghỉ</button>
        </>}
        {timer.phase === "break" && <>
          <button type="button" className="study-dock-button primary" onClick={session.nextRound}><SkipForward size={15} /> {timer.round >= sessionRounds ? "Hoàn thành" : "Vòng tiếp"}</button>
          {pauseButton}
        </>}
        {inRound && <button type="button" className="study-dock-icon" onClick={session.finish} aria-label="Kết thúc phiên" title="Kết thúc phiên"><Square size={14} /></button>}
        <button type="button" className="study-dock-icon" onClick={() => setFocusMode(true)} aria-label="Chế độ tập trung" title="Chế độ tập trung"><Expand size={16} /></button>
      </div>
    </section>

    {focusMode && createPortal(<div className="study-focus-mode" role="dialog" aria-modal="true" aria-label="Chế độ tập trung" onKeyDown={(event) => { if (event.key === "Escape") setFocusMode(false); }}>
      <span className="study-focus-mode-label">{inRound ? `${isPaused ? "Tạm dừng" : phaseName} · Vòng ${timer.round}/${sessionRounds}` : "Chế độ tập trung"}</span>
      <div className="study-focus-mode-clock">{clock}</div>
      <p>{goal ? `Mục tiêu: ${goal}` : "Hãy đặt một mục tiêu nhỏ cho hôm nay."}</p>
      <small>{others > 0 ? `${others} người đang học cùng bạn` : "Bạn đang giữ phòng hôm nay"}</small>
      <div className="study-focus-mode-actions">
        {inRound ? pauseButton : timer.phase === "idle" ? <button type="button" className="study-dock-button primary" onClick={session.start}><Play size={15} fill="currentColor" /> Bắt đầu</button> : null}
        <button type="button" className="study-dock-button ghost" ref={exitFocusButton} onClick={() => setFocusMode(false)}><X size={15} /> Thoát (Esc)</button>
      </div>
    </div>, document.body)}
  </>;
}
