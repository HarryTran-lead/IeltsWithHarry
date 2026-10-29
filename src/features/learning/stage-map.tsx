"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { HarryMascot } from "@/components/illustrations/harry";
import { stages, type Stage } from "@/lib/demo-data";
import { starterSupplementUnits, visitedStarterUnitCount } from "@/lib/starter-supplement";
import { demoMode, releaseLocks } from "@/lib/runtime";
import { useDemo } from "@/features/demo/demo-store";
import { useNotebook } from "@/features/notebook/notebook-store";
import { usePublishedCourses, type StageCourse } from "./stage-courses";
import "./stage-map.css";

export type StageState = "done" | "current" | "available" | "future";
export type StageStop = { stage: Stage; state: StageState; total: number; explored: number };

/**
 * Where each stage stands for the learner: finished, the current one (the
 * first with lessons still to open), open, or still to come. A lesson counts
 * once it has been opened or submitted. Demo mode keeps the sample statuses.
 */
export function stageStops(courses: StageCourse[], explored: (slug: string) => boolean, starterOpened = 0): StageStop[] {
  const progress = stages.map((stage) => {
    if (stage.id === "ielts-starter") return { stage, total: starterSupplementUnits.length, explored: starterOpened };
    const lessons = courses.filter((course) => course.stage_id === stage.id).flatMap((course) => course.units.flatMap((unit) => unit.lessons));
    return { stage, total: lessons.length, explored: lessons.filter((lesson) => explored(lesson.slug)).length };
  });
  const current = progress.findIndex((item) => item.total > 0 && item.explored < item.total);
  return progress.map((item, index) => ({ ...item,
    state: releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(item.stage.id) ? "future" : demoMode && !item.total ? item.stage.status : !item.total ? "future" : item.explored === item.total ? "done" : index === current ? "current" : "available" }));
}

/** Stage stops for pages that do not load the courses themselves. */
export function useStageStops() {
  const { courses } = usePublishedCourses();
  const { attempts } = useDemo();
  const { visits } = useNotebook();
  const visited = new Set(visits.map((visit) => visit.path));
  const submitted = new Set(attempts.map((attempt) => attempt.lesson));
  return stageStops(courses, (slug) => visited.has(`/app/lesson/${slug}`) || submitted.has(slug), visitedStarterUnitCount(visited));
}

// Scene coordinates (viewBox 1000 × 420). Stops keep to the middle band so their labels fit below.
const W = 1000;
const H = 420;
const points: [number, number][] = [[72, 262], [208, 168], [344, 256], [484, 150], [624, 240], [764, 158], [906, 82]];
// Pad colours follow the site palette: teal, sky, mint, sun, coral, lavender, navy.
const look: { icon: StickerName; color: string }[] = [
  { icon: "abc", color: "#12a1ab" },
  { icon: "bubble", color: "#4f8fe0" },
  { icon: "pencil", color: "#2fae86" },
  { icon: "book", color: "#f2b43a" },
  { icon: "chart", color: "#f2665f" },
  { icon: "rocket", color: "#7c66dc" },
  { icon: "star", color: "#10233f" },
];
const bushes: [number, number, number][] = [[130, 318, 1], [280, 300, 0.8], [418, 222, 0.75], [560, 318, 1], [690, 300, 0.85], [250, 372, 0.9], [470, 362, 0.8], [118, 210, 0.7], [600, 176, 0.65], [380, 336, 0.7], [835, 290, 0.8]];

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
  if (stop.stage.id === "ielts-starter") return stop.state === "done" ? "Đã xem 8 unit" : `${stop.explored}/${stop.total} unit đã xem`;
  if (stop.total === 0) return stop.state === "done" ? "Đã hoàn thành" : stop.state === "current" ? "Chặng hiện tại" : "Mở để xem";
  if (stop.state === "done") return `Xong ${stop.total} bài`;
  return `${stop.explored}/${stop.total} bài`;
}

/**
 * The seven stages as a paper diorama in the site's sticker style: a road
 * winds from the lake up to the Mastery summit, each stage is a raised pad,
 * and Harry stands on the current one. The board leans gently toward the
 * pointer, is sized to fit one screen, and becomes a vertical trail on phones.
 */
export function StageMap({ stops }: { stops: StageStop[] }) {
  const board = useRef<HTMLDivElement>(null);
  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    const element = board.current;
    if (!element || event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--ry", `${((event.clientX - rect.left) / rect.width - 0.5) * 4}deg`);
    element.style.setProperty("--rx", `${8 - ((event.clientY - rect.top) / rect.height - 0.5) * 3}deg`);
  }
  function reset() {
    board.current?.style.removeProperty("--rx");
    board.current?.style.removeProperty("--ry");
  }
  const currentId = stops.find((stop) => stop.state === "current")?.stage.id;
  // On a board that scrolls sideways, start with the current stage in view.
  useEffect(() => {
    const element = board.current;
    const here = element?.querySelector<HTMLElement>(".smap-stop.is-current");
    if (!element || !here || element.scrollWidth <= element.clientWidth) return;
    element.scrollLeft = here.offsetLeft - element.clientWidth / 2;
  }, [currentId]);
  const reached = stops.reduce((last, stop, index) => stop.state === "done" || stop.state === "current" ? index : last, 0);
  return <div className="smap-wrap">
    <div className="smap" ref={board} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="smap-board">
        <div className="smap-surface">
          <svg className="smap-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <g className="smap-sun"><circle cx="96" cy="70" r="40" /><circle cx="96" cy="70" r="26" /></g>
            <path className="smap-hill far" d="M-10 220 C90 160 190 196 300 170 S520 128 640 168 S820 140 1010 150 L1010 430 L-10 430Z" />
            <path className="smap-mountain dark" d="M760 330 Q860 120 900 58 Q912 44 924 58 Q962 120 1010 220 L1010 330Z" />
            <path className="smap-mountain light" d="M760 330 Q860 120 900 58 Q908 48 916 52 Q900 190 930 330Z" />
            <path className="smap-snow" d="M882 92 Q898 62 904 56 Q912 46 922 58 L938 92 Q926 84 916 94 Q906 82 896 94 Q890 86 882 92Z" />
            <path className="smap-hill land" d="M-10 262 C120 232 250 290 400 252 S640 226 770 262 S920 300 1010 278 L1010 430 L-10 430Z" />
            <ellipse className="smap-lake" cx="150" cy="378" rx="112" ry="24" />
            <path className="smap-lake-shine" d="M100 374 Q140 368 176 372" />
            {bushes.map(([x, y, s], i) => <g key={i} className="smap-bush" transform={`translate(${x} ${y}) scale(${s})`}>
              <circle cx="-8" cy="0" r="9" /><circle cx="6" cy="-4" r="11" /><circle cx="14" cy="3" r="7" />
            </g>)}
            <g className="smap-road">
              {road.map((d, i) => <path key={`e${i}`} d={d} className="smap-road-edge" />)}
              {road.map((d, i) => <path key={`t${i}`} d={d} className={`smap-road-top ${i < reached ? "is-walked" : ""}`} />)}
              {road.map((d, i) => <path key={`c${i}`} d={d} className={`smap-road-line ${i < reached ? "is-walked" : ""}`} />)}
            </g>
            <g className="smap-flag" transform="translate(912 50)"><rect x="-1.5" y="-30" width="3" height="30" rx="1.5" /><path d="M1.5 -30 L24 -23 L1.5 -15Z" /></g>
          </svg>
          <span className="smap-cloud c1" aria-hidden="true" />
          <span className="smap-cloud c2" aria-hidden="true" />
        </div>
        <ol className="smap-stops" aria-label="Bản đồ 7 chặng học">
          {stops.map((stop, index) => {
            const [x, y] = points[index];
            const { icon, color } = look[index];
            const progress = stop.total ? Math.round(stop.explored / stop.total * 100) : stop.state === "done" ? 100 : 0;
            return <li key={stop.stage.id} className={`smap-stop is-${stop.state}`} style={{ left: `${x / W * 100}%`, top: `${y / H * 100}%`, "--c": color, "--delay": `${index * 70}ms` } as React.CSSProperties}>
              {releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(stop.stage.id) ? <div aria-label={`Chặng ${index + 1}: ${stop.stage.name}, band ${stop.stage.range}, đang khóa`}>
                <span className="smap-figure" aria-hidden="true"><Sticker name={icon} size={40} pop={false} /></span><span className="smap-pad"><b><Lock size={13} /></b></span><span className="smap-label"><small>{stop.stage.range}</small><strong>{stop.stage.name}</strong><em>Đang biên soạn</em></span>
              </div> : <Link href={`/app/learn/${stop.stage.id}`} aria-label={`Chặng ${index + 1}: ${stop.stage.name}, band ${stop.stage.range}, ${statusText(stop)}`}>
                <span className="smap-figure" aria-hidden="true">
                  {stop.state === "current" ? <><span className="smap-here">Bạn ở đây</span><HarryMascot size={50} /></> : <Sticker name={icon} size={40} tilt={index % 2 ? 6 : -6} pop={false} />}
                </span>
                <span className="smap-pad" aria-hidden="true"><b>{stop.state === "done" ? <Check size={15} strokeWidth={3} /> : stop.state === "future" ? <Lock size={13} /> : index + 1}</b></span>
                <span className="smap-label">
                  <small>{stop.stage.range}</small>
                  <strong>{stop.stage.name}</strong>
                  <em>{statusText(stop)}</em>
                  {stop.state !== "future" && <i><b style={{ width: `${progress}%` }} /></i>}
                </span>
              </Link>}
            </li>;
          })}
        </ol>
      </div>
    </div>
  </div>;
}
