"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Expand, Pause, Pencil, Play, SkipForward, Square, X } from "lucide-react";
import { useStudyPresence } from "./study-presence";
import {
  advance, breakMinutesFor, finishSession, focusOptions, formatClock, formatDuration, goalSuggestions, idleTimer,
  nextRound, questionForRound, saveSession, secondsLeft, sessionRounds, startBreak, startFocus,
  pauseTimer, resumeTimer, type SavedSession, type SessionTimer,
} from "./study-session";

const DAILY_TARGET_SECONDS = 60 * 60;
const outcomes: { value: SavedSession["outcome"]; label: string }[] = [
  { value: "done", label: "Xong rồi" },
  { value: "partial", label: "Xong một phần" },
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

function GoalEditor({ goal, onSave, onCancel }: { goal: string; onSave: (goal: string) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState(goal);
  return <form className="study-goal-editor" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) onSave(draft); }}>
    <label htmlFor="study-goal">Hôm nay bạn muốn làm gì?</label>
    <div className="study-goal-chips" role="group" aria-label="Gợi ý mục tiêu">
      {goalSuggestions.map((item) => <button key={item} type="button" aria-pressed={draft === item} className={draft === item ? "selected" : ""} onClick={() => setDraft(item)}>{item}</button>)}
    </div>
    <div className="study-goal-input">
      <input id="study-goal" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} placeholder="Hoặc tự viết mục tiêu, ví dụ: ôn 30 từ chủ đề Environment" autoComplete="off" />
      <button type="submit" disabled={!draft.trim()}>Lưu</button>
      {onCancel && <button type="button" className="ghost" onClick={onCancel}>Hủy</button>}
    </div>
    <small>Mọi người trong phòng sẽ thấy mục tiêu này để cổ vũ bạn.</small>
  </form>;
}

export function StudySessionCard() {
  const { sessionActive, setSessionActive, studySeconds, goal, setGoal, learners } = useStudyPresence();
  const [timer, setTimer] = useState<SessionTimer>(() => idleTimer(25));
  const [now, setNow] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SavedSession["outcome"] | null>(null);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const previousPhase = useRef(timer.phase);
  const baseTitle = useRef<string | null>(null);
  const exitFocusButton = useRef<HTMLButtonElement | null>(null);

  const running = timer.endsAt !== null;
  const inRound = timer.phase === "focus" || timer.phase === "break";
  const paused = timer.pausedLeft !== null;
  const left = secondsLeft(timer, now);
  const clock = formatClock(left);
  const phaseName = timer.phase === "break" ? "Giờ nghỉ" : "Tập trung";
  const others = learners.filter((item) => !item.self && item.active).length;

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
    if (before === timer.phase) return;
    if (before === "focus" || before === "break") chime();
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

  useEffect(() => {
    if (focusMode) exitFocusButton.current?.focus();
  }, [focusMode]);

  function start() {
    const time = Date.now();
    setNow(time);
    setTimer((previous) => startFocus(previous, time));
    setAnswer(null);
    setOutcome(null);
    setRating(0);
    setSaved(false);
    setSessionActive(true);
  }

  function act(change: (timer: SessionTimer, now: number) => SessionTimer) {
    const time = Date.now();
    setNow(time);
    setTimer((previous) => change(previous, time));
    setAnswer(null);
    if (!sessionActive) setSessionActive(true);
  }

  function finish() {
    const time = Date.now();
    setNow(time);
    setTimer((previous) => finishSession(previous, time));
    setFocusMode(false);
  }

  function save() {
    if (!outcome) return;
    saveSession({ endedAt: new Date().toISOString(), goal, focusedSeconds: timer.focusedSeconds, rounds: timer.round, outcome, focusRating: rating });
    setSaved(true);
  }

  function newSession() {
    setTimer((previous) => idleTimer(previous.focusMinutes));
    setOutcome(null);
    setRating(0);
    setSaved(false);
  }

  const question = questionForRound(timer.round);
  const todayPercent = Math.min(100, Math.round((studySeconds / DAILY_TARGET_SECONDS) * 100));
  const pauseButton = <button type="button" className="study-session-primary" onClick={() => setSessionActive(!sessionActive)}>
    {paused || !sessionActive ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}{paused || !sessionActive ? "Tiếp tục" : "Tạm dừng"}
  </button>;

  return <section className="study-session-card" aria-label="Phiên học của bạn">
    <div className="study-session-main">
      {timer.phase === "idle" && <>
        {!goal || editingGoal
          ? <GoalEditor goal={goal} onSave={(value) => { setGoal(value); setEditingGoal(false); }} onCancel={goal ? () => setEditingGoal(false) : undefined} />
          : <div className="study-goal-line"><span>Mục tiêu hôm nay</span><strong>{goal}</strong><button type="button" onClick={() => setEditingGoal(true)} aria-label="Đổi mục tiêu"><Pencil size={14} /> Đổi</button></div>}
        <div className="study-session-setup">
          <label>Mỗi vòng
            <select value={timer.focusMinutes} onChange={(event) => setTimer(idleTimer(Number(event.target.value)))}>
              {focusOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}
            </select>
          </label>
          <span>{sessionRounds} vòng · nghỉ {breakMinutesFor(timer.focusMinutes)} phút giữa các vòng</span>
          <button type="button" className="study-session-primary large" onClick={start}><Play size={17} fill="currentColor" /> Bắt đầu phiên</button>
        </div>
      </>}

      {inRound && <>
        <div className="study-session-status">
          <span className={`study-session-chip ${paused ? "paused" : timer.phase}`}><i />{paused ? "Đang tạm dừng" : phaseName} · Vòng {timer.round}/{sessionRounds}</span>
        </div>
        <div className="study-session-clock" role="timer" aria-label={`Còn ${Math.floor(left / 60)} phút ${left % 60} giây`}>{clock}</div>
        {editingGoal
          ? <GoalEditor goal={goal} onSave={(value) => { setGoal(value); setEditingGoal(false); }} onCancel={() => setEditingGoal(false)} />
          : <div className="study-goal-line compact"><span>Mục tiêu</span><strong>{goal || "Chưa đặt mục tiêu"}</strong><button type="button" onClick={() => setEditingGoal(true)} aria-label="Đổi mục tiêu"><Pencil size={14} /> Đổi</button></div>}
        {timer.phase === "break" && <div className="study-break-quiz">
          <span className="study-break-label">THỬ THÁCH GIỜ NGHỈ</span>
          <strong>“{question.word}” gần nghĩa nhất với?</strong>
          <div className="study-break-options">
            {question.options.map((option) => {
              const state = answer === null ? "" : option === question.answer ? "right" : option === answer ? "wrong" : "";
              return <button key={option} type="button" className={state} disabled={answer !== null} onClick={() => setAnswer(option)}>{option}</button>;
            })}
          </div>
          {answer !== null && <p role="status">{answer === question.answer ? "Chính xác! " : `Đáp án: ${question.answer}. `}{question.tip}</p>}
        </div>}
        <div className="study-session-actions">
          {timer.phase === "focus" ? <>
            {pauseButton}
            <button type="button" onClick={() => act(startBreak)}>Nghỉ sớm</button>
          </> : <>
            <button type="button" className="study-session-primary" onClick={() => act(nextRound)}><SkipForward size={16} /> {timer.round >= sessionRounds ? "Hoàn thành" : "Vào vòng tiếp"}</button>
            {pauseButton}
          </>}
          <button type="button" onClick={finish}><Square size={14} /> Kết thúc phiên</button>
        </div>
      </>}

      {timer.phase === "done" && <div className="study-checkout">
        <span className="study-break-label">PHIÊN HỌC KẾT THÚC</span>
        <h2>{formatDuration(timer.focusedSeconds)} tập trung · {timer.round} vòng</h2>
        {saved ? <>
          <p className="study-checkout-saved"><Check size={16} /> Đã lưu phiên học. Giữ nhịp này nhé!</p>
          <button type="button" className="study-session-primary" onClick={newSession}>Bắt đầu phiên mới</button>
        </> : <>
          <fieldset>
            <legend>Bạn đã xong “{goal || "mục tiêu"}” chưa?</legend>
            <div className="study-goal-chips">{outcomes.map((item) => <button key={item.value} type="button" aria-pressed={outcome === item.value} className={outcome === item.value ? "selected" : ""} onClick={() => setOutcome(item.value)}>{item.label}</button>)}</div>
          </fieldset>
          <fieldset>
            <legend>Phiên này bạn tập trung thế nào?</legend>
            <div className="study-rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`Mức ${value} trên 5`} aria-pressed={rating === value} className={rating === value ? "selected" : ""} onClick={() => setRating(value)}>{value}</button>)}</div>
          </fieldset>
          <div className="study-session-actions">
            <button type="button" className="study-session-primary" disabled={!outcome} onClick={save}>Lưu phiên học</button>
            <button type="button" onClick={newSession}>Bỏ qua</button>
          </div>
        </>}
      </div>}
    </div>

    <aside className="study-session-today" aria-label="Thời gian học hôm nay">
      <span>Hôm nay</span>
      <strong>{formatDuration(studySeconds)}</strong>
      <div className="study-today-bar" role="progressbar" aria-valuemin={0} aria-valuemax={60} aria-valuenow={Math.min(60, Math.floor(studySeconds / 60))} aria-label="Tiến độ mục tiêu 60 phút hôm nay"><i style={{ width: `${todayPercent}%` }} /></div>
      <small>Mục tiêu 60 phút · {sessionActive ? "đang tính giờ" : "đã dừng tính giờ"}</small>
      {timer.phase === "idle" && <button type="button" className="study-today-toggle" onClick={() => setSessionActive(!sessionActive)}>{sessionActive ? <Pause size={14} /> : <Play size={14} />}{sessionActive ? "Dừng tính giờ" : "Tiếp tục tính giờ"}</button>}
      <button type="button" className="study-focus-mode-button" onClick={() => setFocusMode(true)}><Expand size={15} /> Chế độ tập trung</button>
    </aside>

    {focusMode && createPortal(<div className="study-focus-mode" role="dialog" aria-modal="true" aria-label="Chế độ tập trung" onKeyDown={(event) => { if (event.key === "Escape") setFocusMode(false); }}>
      <span className="study-focus-mode-label">{inRound ? `${paused ? "Đang tạm dừng" : phaseName} · Vòng ${timer.round}/${sessionRounds}` : "Chế độ tập trung"}</span>
      <div className="study-focus-mode-clock">{inRound ? clock : formatClock(studySeconds)}</div>
      <p>{goal ? `Mục tiêu: ${goal}` : "Hãy đặt một mục tiêu nhỏ cho hôm nay."}</p>
      <small>{others > 0 ? `${others} người đang học cùng bạn` : "Bạn đang giữ phòng hôm nay"}</small>
      <div className="study-session-actions">
        {inRound ? pauseButton : <button type="button" className="study-session-primary" onClick={start}><Play size={16} fill="currentColor" /> Bắt đầu phiên</button>}
        <button type="button" ref={exitFocusButton} onClick={() => setFocusMode(false)}><X size={15} /> Thoát (Esc)</button>
      </div>
    </div>, document.body)}
  </section>;
}
