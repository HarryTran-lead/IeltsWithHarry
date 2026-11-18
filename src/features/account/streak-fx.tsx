"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X } from "lucide-react";
import type { StreakDay } from "@/lib/account";
import { streakWeek } from "@/lib/account";
import type { StreakTier } from "@/lib/streak-milestones";
import "./streak-celebration.css";

const soundKey = "ieltswithharry-streak-sound";
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function readSound() {
  try { return window.localStorage.getItem(soundKey) !== "off"; } catch { return true; }
}

/**
 * Overlay + card shared by the streak popups: portal, Escape, backdrop click,
 * scroll lock and a short exit animation before `onClose`.
 */
export function StreakShell({ tier, className, labelledBy, describedBy, onClose, sound, onToggleSound, children }: {
  tier: StreakTier; className: string; labelledBy: string; describedBy: string; onClose: () => void;
  sound?: boolean; onToggleSound?: () => void; children: (close: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 320);
  }, [onClose]);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); };
  }, [close]);

  const style = { "--flame-a": tier.colors[0], "--flame-b": tier.colors[1], "--flame-glow": tier.colors[2] } as CSSProperties;
  return createPortal(
    <div className={`streak-celebrate ${className} tier-${tier.id} ${closing ? "is-closing" : ""}`} style={style}
      role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="streak-backdrop" aria-hidden="true" />
      <div className="streak-card" ref={card}>
        <div className="streak-tools">
          {onToggleSound ? <button type="button" onClick={onToggleSound} aria-label={sound ? "Tắt âm thanh" : "Bật âm thanh"}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button> : <span />}
          <button type="button" onClick={close} aria-label="Đóng"><X size={16} /></button>
        </div>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}

/** Flame mascot. `dim` starts it grey; the colour layer fades in on top when ignited. */
export function FlameArt({ dim = false }: { dim?: boolean }) {
  return (
    <span className={`streak-flame ${dim ? "is-dim" : ""}`}>
      <span className="flame-sway">
        <svg className="flame-layer flame-grey" viewBox="0 0 120 150" focusable="false" aria-hidden="true">
          <path d="M60 6c6 22 34 36 34 76a34 34 0 0 1-68 0c0-19 9-29 15-38 3 12 9 16 12 16-3-19 0-36 7-54Z" fill="#b9c2cf" />
          <path d="M60 56c4 14 20 22 20 40a20 20 0 0 1-40 0c0-12 7-17 10-26 2 7 5 8 7 8-1-8 0-14 3-22Z" fill="#dde3ea" />
          <FlameFace sleepy />
        </svg>
        <svg className="flame-layer flame-color" viewBox="0 0 120 150" focusable="false" aria-hidden="true">
          <defs>
            <linearGradient id="streak-flame-outer" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" style={{ stopColor: "var(--flame-a)" }} />
              <stop offset="1" style={{ stopColor: "var(--flame-b)" }} />
            </linearGradient>
            <radialGradient id="streak-flame-core" cx="0.5" cy="0.75" r="0.6">
              <stop offset="0" style={{ stopColor: "#fffbe8" }} />
              <stop offset="0.55" style={{ stopColor: "var(--flame-b)" }} />
              <stop offset="1" style={{ stopColor: "var(--flame-b)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <path d="M60 6c6 22 34 36 34 76a34 34 0 0 1-68 0c0-19 9-29 15-38 3 12 9 16 12 16-3-19 0-36 7-54Z" fill="url(#streak-flame-outer)" />
          <path d="M60 56c4 14 20 22 20 40a20 20 0 0 1-40 0c0-12 7-17 10-26 2 7 5 8 7 8-1-8 0-14 3-22Z" fill="url(#streak-flame-core)" />
          <FlameFace />
        </svg>
      </span>
    </span>
  );
}

function FlameFace({ sleepy = false }: { sleepy?: boolean }) {
  if (sleepy) {
    return (
      <g>
        <path d="M45 104q5 3 10 0M65 104q5 3 10 0" stroke="#5d6f8c" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M54 116q6-3 12 0" stroke="#5d6f8c" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
    );
  }
  return (
    <g className="flame-face">
      <circle cx="50" cy="104" r="4.2" fill="#3a1f0f" />
      <circle cx="70" cy="104" r="4.2" fill="#3a1f0f" />
      <circle cx="51.4" cy="102.6" r="1.4" fill="#fff" />
      <circle cx="71.4" cy="102.6" r="1.4" fill="#fff" />
      <path d="M53 113c4 5 10 5 14 0" stroke="#3a1f0f" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="43" cy="112" r="4" fill="#ff6b6b" opacity="0.45" />
      <circle cx="77" cy="112" r="4" fill="#ff6b6b" opacity="0.45" />
    </g>
  );
}

export function MiniFlame() {
  return (
    <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true">
      <path d="M50 8c4 14 22 22 22 46a22 22 0 0 1-44 0c0-12 6-18 10-24 2 8 6 10 8 10-2-12 0-22 4-32Z" style={{ fill: "var(--flame-a)" }} />
      <path d="M50 46c2 8 12 12 12 22a12 12 0 0 1-24 0c0-8 6-10 8-16 1 4 3 4 4 4Z" style={{ fill: "var(--flame-b)" }} />
    </svg>
  );
}

/**
 * Mon–Sun strip. Cells pop in one after another; `todayLit` makes today ignite
 * (celebration) instead of waiting with a dashed pulse (reminder).
 */
export function WeekStrip({ days, today, todayLit }: { days: StreakDay[]; today: string; todayLit: boolean }) {
  const week = streakWeek(days, today);
  return (
    <ol className="streak-week-strip" aria-label="Tuần này">
      {week.map((cell, index) => {
        const isToday = cell.date === today;
        const done = isToday ? todayLit : cell.events > 0;
        return (
          <li key={cell.date} style={{ "--i": index } as CSSProperties}
            className={`${done ? "done" : ""} ${isToday ? "today" : ""} ${cell.future ? "future" : ""} ${isToday && !todayLit ? "waiting" : ""}`}>
            <span>{done ? <MiniFlame /> : null}</span>
            <small>{weekdays[index]}</small>
          </li>
        );
      })}
    </ol>
  );
}

/** A short rising arpeggio; bigger moments get a sparkle on top. */
export function chime(big: boolean) {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [587.33, 739.99, 880];
    notes.forEach((frequency, index) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      const at = audio.currentTime + index * 0.09;
      osc.type = index === notes.length - 1 ? "sine" : "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.09, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.55);
    });
    window.setTimeout(() => void audio.close(), 1600);
  } catch { /* audio unavailable */ }
}

/**
 * Canvas confetti: a burst from the flame plus two side cannons. Paper pieces
 * flutter (their width oscillates) and fade near the bottom. Returns a cleanup.
 */
export function confetti(canvas: HTMLCanvasElement, origin: { x: number; y: number }, colors: string[], count: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  let width = 0, height = 0;
  const resize = () => {
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  };
  resize();
  type Piece = { x: number; y: number; vx: number; vy: number; r: number; spin: number; w: number; h: number; color: string; round: boolean; wobble: number; life: number };
  const pieces: Piece[] = [];
  const add = (x: number, y: number, angle: number, spread: number, speed: number, amount: number) => {
    for (let i = 0; i < amount; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.5 + Math.random() * 0.7);
      pieces.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
        w: 7 + Math.random() * 6, h: 5 + Math.random() * 7, color: colors[i % colors.length], round: Math.random() < 0.25,
        wobble: Math.random() * Math.PI * 2, life: 1,
      });
    }
  };
  add(origin.x, origin.y, -Math.PI / 2, Math.PI * 1.3, 15, Math.round(count * 0.4));
  add(-10, height * 0.8, -Math.PI / 3.2, 0.6, 19, Math.round(count * 0.3));
  add(width + 10, height * 0.8, -Math.PI + Math.PI / 3.2, 0.6, 19, Math.round(count * 0.3));

  let frame = 0, last = performance.now();
  const step = (now: number) => {
    // Scale by elapsed time so slow frames do not slow the fall.
    const dt = Math.min(2.5, (now - last) / 16.67);
    last = now;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      const p = pieces[i];
      p.vy += 0.3 * dt;
      p.vx *= Math.pow(0.985, dt); p.vy *= Math.pow(0.985, dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.spin * dt; p.wobble += 0.12 * dt;
      if (p.y > height * 0.65) p.life -= 0.016 * dt;
      if (p.life <= 0 || p.y > height + 30) { pieces.splice(i, 1); continue; }
      const cos = Math.cos(p.r), sin = Math.sin(p.r);
      context.setTransform(cos * ratio, sin * ratio, -sin * ratio, cos * ratio, p.x * ratio, p.y * ratio);
      context.globalAlpha = Math.min(1, p.life);
      context.fillStyle = p.color;
      if (p.round) { context.beginPath(); context.arc(0, 0, p.w / 2.6, 0, Math.PI * 2); context.fill(); }
      else context.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.wobble)) + 1, p.h);
    }
    if (pieces.length) frame = window.requestAnimationFrame(step);
    else context.clearRect(0, 0, canvas.width, canvas.height);
  };
  frame = window.requestAnimationFrame(step);
  window.addEventListener("resize", resize);
  return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
}
