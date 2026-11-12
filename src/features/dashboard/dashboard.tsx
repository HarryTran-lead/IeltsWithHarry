"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Headphones,
  Medal,
  Mic,
  Newspaper,
  PenLine,
  Route,
  Sun,
  Target,
  Zap,
} from "lucide-react";
import { Sticker, Tape, type StickerName } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { HarryBuddy } from "@/components/fx/harry-buddy";
import { celebrate } from "@/lib/celebrate";
import { PlannerMini } from "@/features/planner/planner-widgets";
import { useDemo } from "@/features/demo/demo-store";
import { offsetISO, recommendations, skillColors, todayISO, type Skill } from "@/lib/demo-data";
import { demoMode, releaseLocks } from "@/lib/runtime";
import { LatestNews, StreakLeaderboardCard, StudyRoomCard } from "./dashboard-widgets";
import { StudyProgress } from "./study-progress";
import { StageMap, useStageStops } from "@/features/learning/stage-map";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { streakWeek } from "@/lib/account";
import { GrammarTodayCard } from "@/features/grammar/grammar-today";
import dynamic from "next/dynamic";
import "./dashboard.css";

/** Loaded on demand: the Skill Lab path module is large and only needs its weekly summary here. */
const DictationWeekCard = dynamic(() => import("@/features/listening/skill-lab-path").then((module) => module.DictationWeekCard));

const skillIcons: Partial<Record<Skill, typeof BookOpenText>> = {
  Reading: BookOpenText,
  Writing: PenLine,
  Listening: Headphones,
  Speaking: Mic,
};

function WelcomeBanner() {
  const { tasks, goal } = useDemo();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const doneToday = tasks.filter((t) => t.date === todayISO() && t.completed).length;
  return (
    <section className="welcome-banner">
      <Tape tone="teal" className="welcome-tape" />
      <div className="welcome-copy">
        <p className="welcome-greeting">{greeting}!</p>
        <h1>
          Cứ tiếp tục nhé, bạn đang làm <span className="hl">rất tốt</span>!
        </h1>
        <div className="welcome-row">
        <StreakWeek />
        <div className="welcome-actions">
          {releaseLocks ? <Link href="/app/learn/ielts-builder" className="button primary">Học Level 2 <ArrowRight size={16} /></Link> : <Link href="/app/lesson/technology-digital-life" className="button primary">
            Học tiếp <ArrowRight size={16} />
          </Link>}
          <Link href="/app/planner" className="button ghost">
            <CalendarDays size={16} /> {doneToday}/{goal} nhiệm vụ hôm nay
          </Link>
        </div>
        </div>
      </div>
      <div className="welcome-art" aria-hidden="true">
        <HarryBuddy size={92} className="welcome-harry" />
        <Sticker name="star" label="7.0" size={46} tilt={-12} delay={260} float className="welcome-star" />
      </div>
    </section>
  );
}

const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * Monday-to-Sunday strip. With an account a day lights up from the saved learning
 * activity; in the demo it lights up once a planner task dated that day is ticked off.
 */
function StreakWeek() {
  const { tasks } = useDemo();
  const saved = useLearnerStreak();
  const today = saved?.today ?? todayISO();
  const mondayOffset = -((new Date().getDay() + 6) % 7);
  const days = saved
    ? streakWeek(saved.days, saved.today).map((cell, index) => ({ label: weekdays[index], date: cell.date, done: cell.events > 0 }))
    : weekdays.map((label, index) => {
      const date = offsetISO(mondayOffset + index);
      return { label, date, done: demoMode && tasks.some((task) => task.date === date && task.completed) };
    });
  const active = days.filter((day) => day.done).length;
  return (
    <div className="streak-week" aria-label={saved ? `Chuỗi ${saved.current} ngày học liên tiếp` : `${active} trên 7 ngày tuần này có hoàn thành nhiệm vụ`}>
      {days.map((day) => (
        <span key={day.date} className={`streak-day ${day.done ? "done" : ""} ${day.date === today ? "today" : ""} ${day.date > today ? "future" : ""}`} title={day.date}>
          <i>{day.done ? <Sticker name="flame" size={22} pop={false} /> : null}</i>
          <small>{day.label}</small>
        </span>
      ))}
      <b>{saved ? `${saved.current} ngày liên tiếp` : `${active}/7 ngày`}</b>
    </div>
  );
}

function LearningPath() {
  const stops = useStageStops();
  return (
    <section className="card learning-path">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Route} />
          <div>
            <h2>Lộ trình học của bạn</h2>
            <p>4 chặng từ Foundation đến Level 3, hướng tới band 7.5.</p>
          </div>
        </div>
        <Link href="/app/learn" className="link-pill">Xem 4 chặng <ArrowRight size={15} /></Link>
      </div>
      <StageMap stops={stops} />
    </section>
  );
}

/** The lesson or stage to pick up next, shown on the "Hôm nay" tab. */
function ContinueCard() {
  return (
    <section className="card dash-continue" aria-label="Học tiếp">
      <div className="continue-card">
        <div className="continue-art" aria-hidden="true">
          <Sticker name="globe" size={62} tilt={-8} delay={100} />
          <Sticker name="headphones" size={52} tilt={12} delay={200} />
          <Sticker name="abc" size={58} tilt={-4} delay={300} />
        </div>
        <div className="continue-body">
          <span className="current-label">{releaseLocks ? "Chặng đang mở" : demoMode ? "Bài đang học" : "Bài nổi bật"}</span>
          <h3>{releaseLocks ? "Level 2 · English Skill Lab Book 2" : "Technology & Digital Life"}</h3>
          <p>{releaseLocks ? "Học theo nhóm câu ngắn, xem tư liệu khi làm bài và ôn lại những câu cần sửa." : "Learn useful vocabulary, reading strategies, writing tasks and speaking skills for real-world topics."}</p>
          {releaseLocks ? <Link href="/app/learn/ielts-builder" className="button coral">Vào lộ trình <ArrowRight size={16} /></Link> : <Link
            href="/app/lesson/technology-digital-life"
            className="button coral"
          >
            Học tiếp <ArrowRight size={16} />
          </Link>}
        </div>
        <div className="continue-skills">
          {["Vocabulary", "Reading", "Listening", "Writing", "Speaking"].map(
            (skill, i) => (
              <span key={skill}>
                <i className={demoMode && i < 2 ? "filled" : ""}>
                  {demoMode && i < 2 && <Check size={10} strokeWidth={4} />}
                </i>
                {skill}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function TodayGoal() {
  const { tasks, goal, setGoal, updateTask } = useDemo();
  const todays = tasks.filter((t) => t.date === todayISO());
  const done = todays.filter((t) => t.completed).length;
  const pct = Math.min(100, Math.round((done / goal) * 100));
  const quests = [...todays].sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 3);
  async function toggle(id: string, completed: boolean, target: HTMLElement) {
    if (!completed) {
      const reached = done + 1 >= goal;
      celebrate(target, { label: reached ? "Đạt mục tiêu!" : "Tuyệt!", pieces: reached ? 44 : 22 });
    }
    await updateTask(id, { completed: !completed }).catch(() => {});
  }
  return (
    <section className="card goal-card">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Target} tone="coral" />
          <h2>Nhiệm vụ hôm nay</h2>
        </div>
        <button
          className="text-link"
          onClick={() => {
            const value = prompt(
              "Mỗi ngày bạn muốn hoàn thành bao nhiêu nhiệm vụ?",
              String(goal),
            );
            if (value && /^\d+$/.test(value)) void setGoal(Number(value)).catch(() => {});
          }}
        >
          Mục tiêu {goal} <ChevronRight size={14} />
        </button>
      </div>
      <div className="goal-content">
        <div
          className={`progress-ring ${pct >= 100 ? "complete" : ""}`}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        >
          <div>
            <strong>{pct}%</strong>
            <span>
              {done} / {goal}
            </span>
          </div>
        </div>
        <div className="quest-list">
          {quests.length ? quests.map((task) => (
            <button key={task.id} type="button" className={`quest-item ${task.completed ? "done" : ""}`} onClick={(event) => void toggle(task.id, task.completed, event.currentTarget)} aria-pressed={task.completed}>
              <i style={{ background: skillColors[task.skill] }} aria-hidden="true">{task.completed && <Check size={12} strokeWidth={3.5} />}</i>
              <span>{task.title}</span>
            </button>
          )) : <p>Chưa có nhiệm vụ cho hôm nay. Thêm một việc nhỏ trong Planner nhé!</p>}
          <small className={pct >= 100 ? "goal-state done" : "goal-state"}>
            {pct >= 100 ? "Đạt mục tiêu hôm nay rồi!" : `Còn ${Math.max(0, goal - done)} nhiệm vụ nữa thôi`}
          </small>
        </div>
      </div>
    </section>
  );
}

function PracticeNow() {
  return (
    <section className="card practice-card">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Zap} tone="lavender" />
          <h2>Luyện ngay</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          Xem tất cả <ChevronRight size={14} />
        </Link>
      </div>
      <div className="practice-panel">
        <div>
          <span className="purple-tag">Luyện Speaking</span>
          <h3>Talk about Technology</h3>
          <p>Trả lời 3 câu hỏi ngắn rồi nghe lại bản ghi âm của bạn.</p>
          <Link href="/app/speaking" className="button purple">
            Bắt đầu luyện <ArrowRight size={16} />
          </Link>
        </div>
        <Sticker name="mic" size={78} tilt={12} float className="practice-sticker" />
      </div>
    </section>
  );
}

function Recommended() {
  return (
    <section className="card recommended">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Compass} tone="sky" />
          <h2>Gợi ý cho bạn</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          Thêm bài học <ArrowRight size={14} />
        </Link>
      </div>
      <div className="recommend-grid">
        {recommendations.map((item) => {
          const Icon = skillIcons[item.skill] ?? BookOpenText;
          return (
            <Link href={item.href} key={item.title} className="recommend-card lift">
              <span className={`recommend-emoji ${item.skill.toLowerCase()}`}><Icon size={18} /></span>
              <div>
                <span className={`skill-tag ${item.skill.toLowerCase()}`}>
                  {item.skill}
                </span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
              <ChevronRight size={17} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const badges: { sticker: StickerName; label: string; detail: string; earned: boolean; tilt: number }[] = [
  { sticker: "star", label: "Bước đầu tiên", detail: "Hoàn thành 5 nhiệm vụ", earned: true, tilt: -8 },
  { sticker: "rocket", label: "Đang vào guồng", detail: "Chuỗi 7 ngày", earned: true, tilt: 6 },
  { sticker: "mountain", label: "Nhà thám hiểm", detail: "Hoàn thành một unit", earned: true, tilt: -4 },
  { sticker: "lock", label: "Bậc thầy từ vựng", detail: "Học 100 từ", earned: false, tilt: 5 },
];

function Achievements() {
  const { tasks, attempts } = useDemo();
  if (!demoMode) return <section className="card achievements"><div className="card-head"><div className="head-title"><HeadIcon icon={Activity} tone="mint" /><h2>Hoạt động của bạn</h2></div><Link href="/app/progress" className="text-link">Xem tất cả</Link></div><div className="activity-tiles"><div><strong>{tasks.filter((task) => task.completed).length}</strong><small>Nhiệm vụ đã xong</small></div><div><strong>{attempts.length}</strong><small>Lượt luyện tập</small></div></div></section>;
  return (
    <section className="card achievements">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Medal} tone="sun" />
          <h2>Thành tích của bạn</h2>
        </div>
        <Link href="/app/progress" className="text-link">
          Xem tất cả
        </Link>
      </div>
      <div className="achievement-tabs">
        <span className="active">Huy hiệu</span>
        <Link href="/app/progress">Thống kê kỹ năng</Link>
      </div>
      <div className="badge-grid">
        {badges.map((badge, index) => (
          <div
            key={badge.label}
            className={`badge-card ${badge.earned ? "" : "locked"}`}
          >
            <Sticker name={badge.sticker} size={52} tilt={badge.tilt} delay={index * 90} />
            <strong>{badge.label}</strong>
            <small>{badge.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

const dashTabs = [
  { id: "today", label: "Hôm nay", icon: Sun },
  { id: "path", label: "Lộ trình", icon: Route },
  { id: "progress", label: "Tiến độ", icon: Activity },
  { id: "news", label: "Daily News", icon: Newspaper },
  { id: "ranks", label: "Thành tích", icon: Medal },
] as const;
type DashTab = (typeof dashTabs)[number]["id"];
const TAB_KEY = "ieltswithharry-dashboard-tab-v1";

/**
 * The dashboard is one screen: the welcome strip, then one tab at a time in the space left. Every
 * panel stays mounted (hidden when not chosen) so switching is instant and keeps its state; a panel
 * longer than the screen scrolls inside itself. The last tab chosen is remembered in this browser.
 */
function DashboardTabs() {
  const [tab, setTab] = useState<DashTab>("today");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(TAB_KEY);
        if (dashTabs.some((item) => item.id === saved)) setTab(saved as DashTab);
      } catch { /* storage may be blocked */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  function choose(id: DashTab, focus = false) {
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* storage may be blocked */ }
    if (focus) list.current?.querySelector<HTMLButtonElement>(`#dash-tab-${id}`)?.focus();
  }
  function onKey(event: React.KeyboardEvent) {
    const index = dashTabs.findIndex((item) => item.id === tab);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? dashTabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    choose(dashTabs[(next + dashTabs.length) % dashTabs.length].id, true);
  }
  const panel = (id: DashTab, className: string, children: React.ReactNode) => (
    <div key={id} role="tabpanel" id={`dash-panel-${id}`} aria-labelledby={`dash-tab-${id}`} className={`dash-panel ${className}`} hidden={tab !== id} tabIndex={0}>{children}</div>
  );
  return (
    <section className="dash-tabs" aria-label="Bảng điều khiển">
      <div className="dash-tablist" role="tablist" aria-label="Chọn nội dung" ref={list} onKeyDown={onKey}>
        {dashTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" id={`dash-tab-${id}`} aria-selected={tab === id} aria-controls={`dash-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => choose(id)}>
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {panel("today", "dash-today", <>
        <TodayGoal />
        <ContinueCard />
        <GrammarTodayCard />
        <DictationWeekCard />
        {!releaseLocks && <><PracticeNow /><Recommended /></>}
      </>)}
      {panel("path", "dash-path", <LearningPath />)}
      {panel("progress", "dash-progress", <StudyProgress />)}
      {panel("news", "dash-news-panel", <LatestNews />)}
      {panel("ranks", "dash-ranks", <><StreakLeaderboardCard /><Achievements /></>)}
    </section>
  );
}

export function Dashboard() {
  return (
    <div className="dashboard-grid dash-board">
      <div className="dashboard-main stagger">
        {demoMode && <div className="demo-note"><i aria-hidden="true" /> Bản xem thử · Thay đổi của bạn được lưu trong trình duyệt này</div>}
        <WelcomeBanner />
        <DashboardTabs />
      </div>
      <aside className="dashboard-aside stagger">
        <StudyRoomCard />
        <PlannerMini />
      </aside>
    </div>
  );
}
