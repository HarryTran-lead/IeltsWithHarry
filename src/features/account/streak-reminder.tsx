"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { BookOpenText, Headphones, NotebookPen, Newspaper } from "lucide-react";
import type { Streak } from "@/lib/account";
import { tierFor, timeLeftToday, type Reminder } from "@/lib/streak-milestones";
import { FlameArt, StreakShell, WeekStrip } from "./streak-fx";

/** Quick things that count toward the streak (each one is tracked by the database). */
const quickWins = [
  { href: "/app/dictation", icon: Headphones, title: "Chép chính tả 1 câu", time: "~2 phút" },
  { href: "/app/news", icon: Newspaper, title: "Đọc 1 bài Daily News", time: "~5 phút" },
  { href: "/app/notebook", icon: NotebookPen, title: "Ghi 1 từ vào sổ tay", time: "~1 phút" },
  { href: "/app/learn", icon: BookOpenText, title: "Làm 1 bài học", time: "~10 phút" },
];

function useTimeLeft() {
  const [left, setLeft] = useState(() => timeLeftToday(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(timeLeftToday(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return left;
}

/** First visit of the day, before any activity: show what is at stake and the quickest ways to keep it. */
export function StreakReminderDialog({ reminder, streak, onClose }: { reminder: Reminder; streak: Streak; onClose: () => void }) {
  const left = useTimeLeft();
  const atRisk = reminder.kind === "at-risk";
  const tier = tierFor(atRisk ? reminder.current : 1);
  const daysToNext = reminder.next.days - (atRisk ? reminder.current : 0);

  return (
    <StreakShell tier={tier} className={`is-reminder ${left.urgent ? "is-urgent" : ""}`} labelledBy="streak-remind-title" describedBy="streak-remind-message" onClose={onClose}>
      {(close) => (
        <>
          <div className="streak-hero is-small" aria-hidden="true">
            <span className="streak-halo" />
            {atRisk ? <FlameArt /> : <FlameArt dim />}
            <span className="streak-hourglass">⏳</span>
          </div>

          <div className="streak-count is-static" aria-hidden="true"><span className="count-new">{reminder.current}</span></div>
          <p className="streak-unit">{atRisk ? "ngày liên tiếp" : "ngày — chuỗi trước của bạn"}</p>

          <h2 id="streak-remind-title" className="streak-title">
            {atRisk ? (reminder.milestone ? `Hôm nay là ngày đạt mốc ${reminder.milestone.badge}!` : "Đừng để lửa tắt!") : "Thắp lại ngọn lửa nhé!"}
          </h2>
          <p id="streak-remind-message" className="streak-message">
            {atRisk
              ? <>Bạn đang giữ chuỗi <b>{reminder.current} ngày</b>. Hoàn thành 1 hoạt động hôm nay để lên <b>{reminder.target} ngày</b> 🔥</>
              : reminder.current >= reminder.longest
                ? <>Chuỗi kỷ lục <b>{reminder.current} ngày</b> đã tắt, nhưng bạn đã chứng minh mình làm được. Chỉ cần 1 hoạt động để bắt đầu lại!</>
                : <>Chuỗi {reminder.current} ngày đã tắt, nhưng kỷ lục <b>{reminder.longest} ngày</b> vẫn là của bạn. Chỉ cần 1 hoạt động để bắt đầu chuỗi mới!</>}
          </p>

          {atRisk && (
            <div className={`streak-timer ${left.urgent ? "urgent" : ""}`} role="status">
              <span>Còn</span>
              <b>{left.hours}<small>giờ</small></b>
              <b>{String(left.minutes).padStart(2, "0")}<small>phút</small></b>
              <span>để giữ chuỗi</span>
            </div>
          )}

          <WeekStrip days={streak.days} today={streak.today} todayLit={false} />

          <p className="streak-goal">
            {atRisk && daysToNext > 0
              ? <>Thêm <b>{daysToNext} ngày</b> nữa là đạt huy hiệu <b>{reminder.next.badge || `${reminder.next.days} ngày`}</b> 🏅</>
              : <>Học <b>3 ngày</b> liền để nhận huy hiệu đầu tiên 🏅</>}
          </p>

          <div className="streak-quick" role="list">
            {quickWins.map(({ href, icon: Icon, title, time }, index) => (
              <Link key={href} href={href} role="listitem" className="streak-quick-item" onClick={close} style={{ "--i": index } as CSSProperties}>
                <span className="streak-quick-icon"><Icon size={18} /></span>
                <span><b>{title}</b><small>{time}</small></span>
              </Link>
            ))}
          </div>

          <div className="streak-actions">
            <Link href="/app/learn" className="streak-continue" onClick={close} data-autofocus>{atRisk ? "Giữ chuỗi ngay" : "Bắt đầu chuỗi mới"}</Link>
            <button type="button" className="streak-link" onClick={close}>Để sau</button>
          </div>
        </>
      )}
    </StreakShell>
  );
}
