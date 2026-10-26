"use client";

import Link from "next/link";
import { useRef } from "react";
import { Check, Lock } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { HarryMascot } from "@/components/illustrations/harry";
import type { Stage } from "@/lib/demo-data";
import "./stage-map.css";

export type StageState = "done" | "current" | "available" | "future";
export type StageStop = { stage: Stage; state: StageState; total: number; explored: number };

// Scene coordinates (viewBox 1000 × 460): the road climbs from the lake to the summit.
const W = 1000;
const H = 460;
const points: [number, number][] = [[80, 340], [220, 235], [355, 330], [495, 215], [630, 305], [762, 226], [914, 96]];
const look: { icon: StickerName; color: string }[] = [
  { icon: "abc", color: "#12a1ab" },
  { icon: "bubble", color: "#4c8fe0" },
  { icon: "pencil", color: "#2fb67f" },
  { icon: "book", color: "#e9a923" },
  { icon: "chart", color: "#f0705f" },
  { icon: "rocket", color: "#8f72ea" },
  { icon: "star", color: "#334a7a" },
];
const trees: [number, number, number][] = [[150, 285, 1], [300, 292, 0.8], [430, 262, 0.9], [575, 360, 1.1], [700, 238, 0.8], [265, 398, 1], [470, 405, 0.9], [610, 196, 0.7], [395, 196, 0.7], [720, 355, 1], [840, 300, 0.9], [60, 255, 0.8], [520, 300, 0.8]];

/** Smooth road segment between stop i and i + 1 (Catmull-Rom as cubic Béziers). */
function segment(i: number) {
  const p = (k: number) => points[Math.max(0, Math.min(points.length - 1, k))];
  const [x0, y0] = p(i - 1), [x1, y1] = p(i), [x2, y2] = p(i + 1), [x3, y3] = p(i + 2);
  const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
  const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
  return `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`;
}
const road = points.slice(0, -1).map((_, i) => segment(i));

function statusText(stop: StageStop) {
  if (stop.state === "future") return "Sắp mở";
  if (stop.total === 0) return stop.state === "done" ? "Đã hoàn thành" : stop.state === "current" ? "Chặng hiện tại" : "Mở để xem";
  if (stop.state === "done") return `Xong ${stop.total} bài`;
  return `${stop.explored}/${stop.total} bài`;
}

/**
 * The seven stages as a tilted diorama: a road winds from the lake up to the
 * Mastery summit, each stage is a raised pad, and Harry stands on the current
 * one. The board leans toward the pointer; small containers get a vertical trail.
 */
export function StageMap({ stops }: { stops: StageStop[] }) {
  const board = useRef<HTMLDivElement>(null);
  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    const element = board.current;
    if (!element || event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--ry", `${((event.clientX - rect.left) / rect.width - 0.5) * 5}deg`);
    element.style.setProperty("--rx", `${12 - ((event.clientY - rect.top) / rect.height - 0.5) * 4}deg`);
  }
  function reset() {
    board.current?.style.removeProperty("--rx");
    board.current?.style.removeProperty("--ry");
  }
  const reached = stops.reduce((last, stop, index) => stop.state === "done" || stop.state === "current" ? index : last, 0);
  return <div className="smap-wrap">
    <div className="smap" ref={board} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="smap-board">
        <div className="smap-surface">
        <svg className="smap-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="smap-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6efe2" /><stop offset="1" stopColor="#c2e6d2" /></linearGradient>
            <linearGradient id="smap-land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe6c9" /><stop offset="1" stopColor="#9fd4ae" /></linearGradient>
            <linearGradient id="smap-lake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9fdcf0" /><stop offset="1" stopColor="#5fb9db" /></linearGradient>
            <linearGradient id="smap-rock-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b6c4d6" /><stop offset="1" stopColor="#8fa3bb" /></linearGradient>
            <linearGradient id="smap-rock-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8396b0" /><stop offset="1" stopColor="#6a7f9c" /></linearGradient>
          </defs>
          <circle cx="110" cy="78" r="34" fill="#ffe08a" opacity="0.9" />
          <circle cx="110" cy="78" r="52" fill="#ffe08a" opacity="0.25" />
          <path d="M0 230 C120 170 220 215 330 185 S560 150 680 195 S860 150 1000 175 L1000 460 L0 460Z" fill="url(#smap-far)" />
          <path d="M770 360 L914 56 L1000 240 L1000 360Z" fill="url(#smap-rock-d)" />
          <path d="M770 360 L914 56 L940 360Z" fill="url(#smap-rock-l)" />
          <path d="M883 121 L914 56 L946 124 L929 114 L914 128 L898 112Z" fill="#fff" />
          <path d="M0 280 C140 250 260 300 400 268 S640 240 760 285 S900 330 1000 300 L1000 460 L0 460Z" fill="url(#smap-land)" />
          <ellipse cx="170" cy="414" rx="118" ry="28" fill="url(#smap-lake)" />
          <ellipse cx="150" cy="408" rx="40" ry="6" fill="#fff" opacity="0.45" />
          {trees.map(([x, y, s], i) => <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse cx="0" cy="2" rx="10" ry="3" fill="#2f6b4a" opacity="0.18" />
            <rect x="-1.8" y="-6" width="3.6" height="8" rx="1" fill="#8a6a45" />
            <path d="M0 -30 L11 -6 L-11 -6Z" fill={i % 3 ? "#3fae74" : "#2f9a63"} />
            <path d="M0 -38 L8 -20 L-8 -20Z" fill={i % 3 ? "#52bf85" : "#3fae74"} />
          </g>)}
          <g className="smap-road">
            {road.map((d, i) => <path key={`e${i}`} d={d} className="smap-road-edge" />)}
            {road.map((d, i) => <path key={`t${i}`} d={d} className={`smap-road-top ${i < reached ? "is-walked" : ""}`} />)}
            {road.map((d, i) => <path key={`c${i}`} d={d} className="smap-road-line" />)}
          </g>
          <g transform="translate(914 60)"><rect x="-1.5" y="-34" width="3" height="34" fill="#334a7a" /><path d="M1.5 -34 L26 -26 L1.5 -18Z" fill="#f0705f" /></g>
        </svg>
        <span className="smap-cloud c1" aria-hidden="true" />
        <span className="smap-cloud c2" aria-hidden="true" />
        <span className="smap-cloud c3" aria-hidden="true" />
        </div>
        <ol className="smap-stops" aria-label="Bản đồ 7 chặng học">
          {stops.map((stop, index) => {
            const [x, y] = points[index];
            const { icon, color } = look[index];
            const progress = stop.total ? Math.round(stop.explored / stop.total * 100) : stop.state === "done" ? 100 : 0;
            return <li key={stop.stage.id} className={`smap-stop is-${stop.state}`} style={{ left: `${x / W * 100}%`, top: `${y / H * 100}%`, "--c": color, "--delay": `${index * 70}ms` } as React.CSSProperties}>
              <Link href={`/app/learn/${stop.stage.id}`} aria-label={`Chặng ${index + 1}: ${stop.stage.name}, band ${stop.stage.range}, ${statusText(stop)}`}>
                <span className="smap-figure" aria-hidden="true">
                  {stop.state === "current" ? <><span className="smap-here">Bạn ở đây</span><HarryMascot size={54} /></> : <Sticker name={icon} size={44} tilt={index % 2 ? 6 : -6} pop={false} />}
                </span>
                <span className="smap-pad" aria-hidden="true"><b>{stop.state === "done" ? <Check size={16} strokeWidth={3} /> : stop.state === "future" ? <Lock size={14} /> : index + 1}</b></span>
                <span className="smap-label">
                  <small>{stop.stage.range}</small>
                  <strong>{stop.stage.name}</strong>
                  <em>{statusText(stop)}</em>
                  {stop.state !== "future" && <i><b style={{ width: `${progress}%` }} /></i>}
                </span>
              </Link>
            </li>;
          })}
        </ol>
      </div>
    </div>
  </div>;
}
