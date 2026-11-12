"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Volume2, VolumeX, X } from "lucide-react";
import type { Streak } from "@/lib/account";
import { streakWeek } from "@/lib/account";
import {
  celebrationFor, milestoneProgress, nextSeen, streakMilestones, tierFor,
  type Celebration, type SeenStreak,
} from "@/lib/streak-milestones";
import "./streak-celebration.css";

const seenKey = "ieltswithharry-streak-seen";
const soundKey = "ieltswithharry-streak-sound";
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/** Milestones drawn on the little road under the card. */
const roadStops = [3, 7, 14, 30, 50, 100, 200, 365];

function readSeen(): SeenStreak | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(seenKey) ?? "null") as SeenStreak | null;
    return value && typeof value.day === "string" && typeof value.count === "number" ? value : null;
  } catch { return null; }
}
function writeSeen(value: SeenStreak) {
  try { window.localStorage.setItem(seenKey, JSON.stringify(value)); } catch { /* storage blocked */ }
}
function soundOn() {
  try { return window.localStorage.getItem(soundKey) !== "off"; } catch { return true; }
}

/** A fake streak for `?streak-preview=N`, so the popup can be reviewed without real activity. */
function previewStreak(count: number): Streak {
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: Math.min(count, 120) }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return { day: date.toISOString().slice(0, 10), events: 1, kinds: ["lesson"] };
  }).reverse();
  return { current: count, longest: count, today, activeToday: true, totalDays: count, days };
}

/**
 * Full-screen "your streak grew" moment, shown once a day on the first learning
 * activity. Mount it once in the app shell and hand it the learner's streak.
 */
export function StreakCelebration({ streak }: { streak: Streak | null }) {
  const params = useSearchParams();
  const previewValue = Number(params.get("streak-preview"));
  const preview = process.env.NODE_ENV !== "production" && Number.isInteger(previewValue) && previewValue > 0 ? previewValue : 0;
  const [shown, setShown] = useState<{ celebration: Celebration; streak: Streak } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (preview) {
        const fake = previewStreak(preview);
        const celebration = celebrationFor(fake, null);
        if (celebration) setShown({ celebration, streak: fake });
        return;
      }
      if (!streak) return;
      const seen = readSeen();
      const celebration = celebrationFor(streak, seen);
      if (!celebration) {
        // Before today's first activity, still remember the past best so a later record is spotted.
        if (!streak.activeToday) writeSeen({ day: seen?.day ?? "", count: seen?.count ?? 0, pastBest: nextSeen(streak, seen).pastBest });
        return;
      }
      writeSeen(nextSeen(streak, seen));
      setShown({ celebration, streak });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [streak, preview]);

  if (!shown) return null;
  return createPortal(
    <CelebrationDialog key={`${shown.streak.today}-${shown.celebration.to}`} celebration={shown.celebration} streak={shown.streak} onClose={() => setShown(null)} />,
    document.body,
  );
}

function CelebrationDialog({ celebration, streak, onClose }: { celebration: Celebration; streak: Streak; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [lit, setLit] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const canvas = useRef<HTMLCanvasElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const big = celebration.kind === "milestone" || celebration.kind === "record" || celebration.tierUp;
  const tier = celebration.tier;
  const progress = milestoneProgress(celebration.to);
  const week = useMemo(() => streakWeek(streak.days, streak.today), [streak.days, streak.today]);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    button.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => setLit(true), 950);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); window.clearTimeout(timer); };
  }, [close]);

  // Confetti and chime land together with the number flip.
  useEffect(() => {
    if (!lit) return;
    if (sound) chime(big);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !canvas.current) return;
    return confetti(canvas.current, [tier.colors[0], tier.colors[1], "#ffc94a", "#12a1ab", "#f2665f", "#ffffff"], big ? 190 : 90);
  }, [lit, big, sound, tier.colors]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { window.localStorage.setItem(soundKey, next ? "on" : "off"); } catch { /* storage blocked */ }
  }

  const style = { "--flame-a": tier.colors[0], "--flame-b": tier.colors[1], "--flame-glow": tier.colors[2] } as CSSProperties;
  return (
    <div className={`streak-celebrate ${closing ? "is-closing" : ""} ${lit ? "is-lit" : ""} ${big ? "is-big" : ""} tier-${tier.id}`} style={style}
      role="dialog" aria-modal="true" aria-labelledby="streak-celebrate-title" aria-describedby="streak-celebrate-message"
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <canvas ref={canvas} className="streak-confetti" aria-hidden="true" />
      <div className="streak-card">
        <div className="streak-tools">
          <button type="button" onClick={toggleSound} aria-label={sound ? "Tắt âm thanh" : "Bật âm thanh"}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <button type="button" onClick={close} aria-label="Đóng"><X size={16} /></button>
        </div>

        <div className="streak-hero" aria-hidden="true">
          <span className="streak-rays" />
          <span className="streak-halo" />
          <FlameArt />
          <span className="streak-embers">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</span>
        </div>

        <div className="streak-count" aria-hidden="true"><Odometer from={celebration.from} to={celebration.to} rolled={lit} /></div>
        <p className="streak-unit">ngày liên tiếp</p>

        <h2 id="streak-celebrate-title" className="streak-title">{celebration.headline}</h2>
        <p id="streak-celebrate-message" className="streak-message">{celebration.message}</p>

        {(celebration.milestone || celebration.tierUp) && (
          <div className="streak-badges">
            {celebration.milestone && <span className="streak-badge"><b>🏅</b> Huy hiệu {celebration.milestone.badge}</span>}
            {celebration.tierUp && <span className="streak-badge tier"><b>✨</b> Lửa tiến hoá: {tier.name}</span>}
          </div>
        )}

        <ol className="streak-week-strip" aria-label="Tuần này">
          {week.map((cell, index) => {
            const today = cell.date === streak.today;
            const done = cell.events > 0 && (!today || lit);
            return (
              <li key={cell.date} className={`${done ? "done" : ""} ${today ? "today" : ""} ${cell.future ? "future" : ""}`}>
                <span>{done ? <MiniFlame /> : null}</span>
                <small>{weekdays[index]}</small>
              </li>
            );
          })}
        </ol>

        <div className="streak-next">
          <div className="streak-next-label">
            <span>Mốc tiếp theo: <b>{progress.next.days} ngày</b></span>
            <span>còn {progress.left} ngày</span>
          </div>
          <div className="streak-next-bar"><i style={{ width: `${(lit ? progress.ratio : Math.max(0, progress.ratio - 0.08)) * 100}%` }} /></div>
        </div>

        <ol className="streak-road" aria-label="Các mốc chuỗi">
          {roadStops.map((days) => {
            const reached = celebration.to >= days;
            const name = streakMilestones.find((item) => item.days === days)?.badge ?? `${days}`;
            return (
              <li key={days} className={`${reached ? "reached" : ""} ${celebration.to === days ? "now" : ""}`} style={{ "--stop": tierFor(days).colors[0] } as CSSProperties} title={name}>
                <span>{days}</span>
              </li>
            );
          })}
        </ol>

        <div className="streak-actions">
          <button ref={button} type="button" className="streak-continue" onClick={close}>Tiếp tục học</button>
          <Link href="/app/progress" className="streak-link" onClick={close}>Xem tiến độ</Link>
        </div>
        <p className="streak-longest">Kỷ lục của bạn: <b>{celebration.longest} ngày</b> · Tổng cộng {Math.max(streak.totalDays, celebration.to)} ngày học</p>
      </div>
    </div>
  );
}

/** Digits roll from `from` to `to` like a slot machine. */
function Odometer({ from, to, rolled }: { from: number; to: number; rolled: boolean }) {
  const target = String(to);
  const start = String(from).padStart(target.length, " ");
  return (
    <span className="odometer">
      {[...target].map((digit, index) => {
        const value = rolled ? Number(digit) : start[index] === " " ? 0 : Number(start[index]);
        const hidden = !rolled && start[index] === " ";
        return (
          <span key={index} className={`odo-digit ${hidden ? "is-hidden" : ""}`} style={{ "--d": value, "--delay": `${(target.length - index - 1) * 90}ms` } as CSSProperties}>
            <span className="odo-strip">{Array.from({ length: 10 }, (_, n) => <span key={n}>{n}</span>)}</span>
          </span>
        );
      })}
    </span>
  );
}

function FlameArt() {
  return (
    <svg className="streak-flame" viewBox="0 0 120 150" width="132" height="165" focusable="false">
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
      <g className="flame-outer">
        <path d="M60 6c6 22 34 36 34 76a34 34 0 0 1-68 0c0-19 9-29 15-38 3 12 9 16 12 16-3-19 0-36 7-54Z" fill="url(#streak-flame-outer)" />
      </g>
      <g className="flame-mid">
        <path d="M60 56c4 14 20 22 20 40a20 20 0 0 1-40 0c0-12 7-17 10-26 2 7 5 8 7 8-1-8 0-14 3-22Z" fill="url(#streak-flame-core)" />
      </g>
      <g className="flame-face">
        <circle cx="50" cy="104" r="4.2" fill="#3a1f0f" />
        <circle cx="70" cy="104" r="4.2" fill="#3a1f0f" />
        <circle cx="51.4" cy="102.6" r="1.4" fill="#fff" />
        <circle cx="71.4" cy="102.6" r="1.4" fill="#fff" />
        <path d="M53 113c4 5 10 5 14 0" stroke="#3a1f0f" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="43" cy="112" r="4" fill="#ff6b6b" opacity="0.45" />
        <circle cx="77" cy="112" r="4" fill="#ff6b6b" opacity="0.45" />
      </g>
    </svg>
  );
}

function MiniFlame() {
  return (
    <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true">
      <path d="M50 8c4 14 22 22 22 46a22 22 0 0 1-44 0c0-12 6-18 10-24 2 8 6 10 8 10-2-12 0-22 4-32Z" style={{ fill: "var(--flame-a)" }} />
      <path d="M50 46c2 8 12 12 12 22a12 12 0 0 1-24 0c0-8 6-10 8-16 1 4 3 4 4 4Z" style={{ fill: "var(--flame-b)" }} />
    </svg>
  );
}

/** A short rising arpeggio; bigger moments get a sparkle on top. */
function chime(big: boolean) {
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

/** Canvas confetti: two side cannons plus a top shower. Returns a cleanup. */
function confetti(canvas: HTMLCanvasElement, colors: string[], count: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const width = window.innerWidth, height = window.innerHeight;
  type Piece = { x: number; y: number; vx: number; vy: number; r: number; spin: number; w: number; h: number; color: string; shape: number; life: number };
  const pieces: Piece[] = [];
  const add = (x: number, y: number, angle: number, spread: number, speed: number, amount: number) => {
    for (let i = 0; i < amount; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.6);
      pieces.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.35,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 8, color: colors[i % colors.length], shape: Math.floor(Math.random() * 3), life: 1,
      });
    }
  };
  add(0, height * 0.85, -Math.PI / 3, 0.7, 17, Math.round(count * 0.35));
  add(width, height * 0.85, -Math.PI * 2 / 3, 0.7, 17, Math.round(count * 0.35));
  const shower = window.setTimeout(() => add(width / 2, -20, Math.PI / 2, 2.6, 5, Math.round(count * 0.3)), 260);

  let frame = 0;
  const step = () => {
    context.clearRect(0, 0, width, height);
    for (const p of pieces) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.spin;
      if (p.y > height * 0.7) p.life -= 0.012;
      context.save();
      context.globalAlpha = Math.max(0, p.life);
      context.translate(p.x, p.y);
      context.rotate(p.r);
      context.fillStyle = p.color;
      if (p.shape === 0) context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      else if (p.shape === 1) { context.beginPath(); context.arc(0, 0, p.w / 2.4, 0, Math.PI * 2); context.fill(); }
      else { context.beginPath(); context.moveTo(0, -p.w / 1.6); context.lineTo(p.w / 1.8, p.w / 2); context.lineTo(-p.w / 1.8, p.w / 2); context.closePath(); context.fill(); }
      context.restore();
    }
    for (let i = pieces.length - 1; i >= 0; i -= 1) if (pieces[i].life <= 0 || pieces[i].y > height + 40) pieces.splice(i, 1);
    if (pieces.length) frame = window.requestAnimationFrame(step);
  };
  frame = window.requestAnimationFrame(step);
  window.addEventListener("resize", resize);
  return () => { window.clearTimeout(shower); window.cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
}
