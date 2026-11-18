"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Streak } from "@/lib/account";
import {
  celebrationFor, milestoneProgress, nextSeen, reminderFor, streakMilestones, tierFor,
  type Celebration, type Reminder, type SeenStreak,
} from "@/lib/streak-milestones";
import { FlameArt, StreakShell, WeekStrip, chime, confetti, readSound } from "./streak-fx";
import { StreakReminderDialog } from "./streak-reminder";

const seenKey = "ieltswithharry-streak-seen";
const remindedKey = "ieltswithharry-streak-reminded";
/** Milestones drawn on the little road under the card. */
const roadStops = [3, 7, 14, 30, 50, 100, 200, 365];
/** When the grey flame ignites, in ms after the popup opens; the CSS uses the same beat. */
const igniteAt = 820;
/** Screens where a reminder would interrupt real work; it waits for the next page instead. */
const busyRoute = /^\/app\/(lesson|check)\/|\/(exam|test|attempt)(\/|$)/;

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ }
}
function readSeen(): SeenStreak | null {
  try {
    const value = JSON.parse(read(seenKey) ?? "null") as SeenStreak | null;
    return value && typeof value.day === "string" && typeof value.count === "number" ? value : null;
  } catch { return null; }
}

/** A fake streak for the dev-only preview parameters. */
function previewStreak(count: number, activeToday: boolean): Streak {
  const today = new Date().toISOString().slice(0, 10);
  const length = activeToday ? count : count + 1;
  const days = Array.from({ length: Math.min(length, 120) }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return { day: date.toISOString().slice(0, 10), events: 1, kinds: ["lesson"] };
  }).filter((_, index) => activeToday || index > 0).reverse();
  return { current: count, longest: Math.max(count, 20), today, activeToday, totalDays: Math.max(count, 20), days };
}

type Shown = { type: "celebration"; celebration: Celebration; streak: Streak } | { type: "reminder"; reminder: Reminder; streak: Streak };

/**
 * Daily streak moments, mounted once in the app shell:
 * - before today's first activity, a reminder of the streak at stake with quick ways to keep it;
 * - on the first activity, a celebration as the flame grows by a day.
 * Each shows at most once a day per browser.
 */
export function StreakCelebration({ streak }: { streak: Streak | null }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const dev = process.env.NODE_ENV !== "production";
  const previewCelebrate = dev ? Number(params.get("streak-preview")) : NaN;
  const previewRemind = dev && params.has("streak-reminder") ? Number(params.get("streak-reminder")) : NaN;
  const [shown, setShown] = useState<Shown | null>(null);
  const busy = busyRoute.test(pathname);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (Number.isInteger(previewCelebrate) && previewCelebrate > 0) {
        const fake = previewStreak(previewCelebrate, true);
        const celebration = celebrationFor(fake, previewCelebrate > 1 ? { day: "", count: previewCelebrate - 1 } : null);
        if (celebration) setShown({ type: "celebration", celebration, streak: fake });
        return;
      }
      if (Number.isInteger(previewRemind) && previewRemind >= 0) {
        const fake = previewStreak(previewRemind, false);
        const reminder = reminderFor(fake, null, null);
        if (reminder) setShown({ type: "reminder", reminder, streak: fake });
        return;
      }
      if (!streak) return;
      const seen = readSeen();
      const celebration = celebrationFor(streak, seen);
      if (celebration) {
        write(seenKey, JSON.stringify(nextSeen(streak, seen)));
        setShown({ type: "celebration", celebration, streak });
        return;
      }
      if (streak.activeToday) return;
      // Before today's first activity, remember the past best so a later record is spotted.
      write(seenKey, JSON.stringify({ day: seen?.day ?? "", count: seen?.count ?? 0, pastBest: nextSeen(streak, seen).pastBest }));
      if (busy) return;
      const reminder = reminderFor(streak, seen, read(remindedKey));
      if (!reminder) return;
      write(remindedKey, streak.today);
      setShown({ type: "reminder", reminder, streak });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [streak, previewCelebrate, previewRemind, busy]);

  if (!shown) return null;
  const onClose = () => setShown(null);
  return shown.type === "celebration"
    ? <CelebrationDialog key={`c-${shown.streak.today}-${shown.celebration.to}`} celebration={shown.celebration} streak={shown.streak} onClose={onClose} />
    : <StreakReminderDialog key={`r-${shown.streak.today}`} reminder={shown.reminder} streak={shown.streak} onClose={onClose} />;
}

function CelebrationDialog({ celebration, streak, onClose }: { celebration: Celebration; streak: Streak; onClose: () => void }) {
  const [sound, setSound] = useState(readSound);
  const canvas = useRef<HTMLCanvasElement>(null);
  const big = celebration.kind === "milestone" || celebration.kind === "record" || celebration.tierUp;
  const tier = celebration.tier;
  const before = milestoneProgress(celebration.from);
  const after = milestoneProgress(celebration.to);
  // Crossing a milestone restarts the bar, so it fills from empty instead of running backwards.
  const barFrom = after.next.days === before.next.days ? before.ratio : 0;
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  // Confetti and chime land with the ignition beat.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      if (soundRef.current) chime(big);
      if (!canvas.current) return;
      // Reduced motion (often just Windows animation effects switched off) gets a lighter shower, not none.
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const flame = canvas.current.parentElement?.querySelector(".streak-flame")?.getBoundingClientRect();
      const origin = flame ? { x: flame.left + flame.width / 2, y: flame.top + flame.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      cleanup = confetti(canvas.current, origin, [tier.colors[0], tier.colors[1], "#ffc94a", "#12a1ab", "#f2665f", "#7c66dc"], (big ? 200 : 110) * (calm ? 0.45 : 1));
    }, igniteAt);
    return () => { window.clearTimeout(timer); cleanup?.(); };
  }, [big, tier.colors]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { window.localStorage.setItem("ieltswithharry-streak-sound", next ? "on" : "off"); } catch { /* storage blocked */ }
  }

  return (
    <StreakShell tier={tier} className={`is-celebration ${big ? "is-big" : ""}`} labelledBy="streak-celebrate-title" describedBy="streak-celebrate-message"
      onClose={onClose} sound={sound} onToggleSound={toggleSound}>
      {(close) => (
        <>
          <canvas ref={canvas} className="streak-confetti" aria-hidden="true" />
          <div className="streak-hero" aria-hidden="true">
            <span className="streak-rays" />
            <span className="streak-halo" />
            <span className="streak-shock" />
            <span className="streak-sparks">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--a": `${index * (360 / 14)}deg` } as CSSProperties} />)}</span>
            <FlameArt dim />
            <span className="streak-embers">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</span>
          </div>

          <div className="streak-count" aria-hidden="true">
            {celebration.from > 0 && <span className="count-old">{celebration.from}</span>}
            <span className="count-new">{celebration.to}</span>
            <span className="count-plus">+1</span>
          </div>
          <p className="streak-unit">ngày liên tiếp</p>

          <h2 id="streak-celebrate-title" className="streak-title">{celebration.headline}</h2>
          <p id="streak-celebrate-message" className="streak-message">
            {celebration.from > 0 && celebration.kind !== "restart" && <><b>{celebration.from} → {celebration.to} ngày.</b> </>}
            {celebration.message}
          </p>

          {(celebration.milestone || celebration.tierUp) && (
            <div className="streak-badges">
              {celebration.milestone && <span className="streak-badge"><b>🏅</b> Huy hiệu {celebration.milestone.badge}</span>}
              {celebration.tierUp && <span className="streak-badge tier"><b>✨</b> Lửa tiến hoá: {tier.name}</span>}
            </div>
          )}

          <WeekStrip days={streak.days} today={streak.today} todayLit />

          <div className="streak-next">
            <div className="streak-next-label">
              <span>Mốc tiếp theo: <b>{after.next.days} ngày</b></span>
              <span>còn {after.left} ngày</span>
            </div>
            <div className="streak-next-bar"><i style={{ "--from": barFrom, "--to": Math.max(0.03, after.ratio) } as CSSProperties} /></div>
          </div>

          <ol className="streak-road" aria-label="Các mốc chuỗi">
            {roadStops.map((days, index) => {
              const name = streakMilestones.find((item) => item.days === days)?.badge ?? `${days}`;
              return (
                <li key={days} className={`${celebration.to >= days ? "reached" : ""} ${celebration.to === days ? "now" : ""}`}
                  style={{ "--stop": tierFor(days).colors[0], "--i": index } as CSSProperties} title={name}>
                  <span>{days}</span>
                </li>
              );
            })}
          </ol>

          <div className="streak-actions">
            <button type="button" className="streak-continue" onClick={close} data-autofocus>Tiếp tục học</button>
            <Link href="/app/progress" className="streak-link" onClick={close}>Xem tiến độ</Link>
          </div>
          <p className="streak-longest">Kỷ lục của bạn: <b>{celebration.longest} ngày</b> · Tổng cộng {Math.max(streak.totalDays, celebration.to)} ngày học</p>
        </>
      )}
    </StreakShell>
  );
}
