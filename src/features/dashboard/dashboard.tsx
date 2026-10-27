"use client";
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
  PenLine,
  Route,
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
import { demoMode } from "@/lib/runtime";
import { LatestNews, StudyRoomCard } from "./dashboard-widgets";
import { StudyProgress } from "./study-progress";
import { StageMap, useStageStops } from "@/features/learning/stage-map";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { streakWeek } from "@/lib/account";
import "./dashboard.css";

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
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const doneToday = tasks.filter((t) => t.date === todayISO() && t.completed).length;
  return (
    <section className="welcome-banner">
      <Tape tone="teal" className="welcome-tape" />
      <div className="welcome-copy">
        <p className="welcome-greeting">{greeting}!</p>
        <h1>
          Keep going, you’re doing <span className="hl">great</span>!
        </h1>
        <div className="welcome-row">
        <StreakWeek />
        <div className="welcome-actions">
          <Link href="/app/lesson/technology-digital-life" className="button primary">
            Continue learning <ArrowRight size={16} />
          </Link>
          <Link href="/app/planner" className="button ghost">
            <CalendarDays size={16} /> {doneToday}/{goal} tasks today
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
            <h2>Your Learning Path</h2>
            <p>From band 1.0 to 7.0+ — build your skills step by step.</p>
          </div>
        </div>
        <Link href="/app/learn" className="link-pill">
          View all levels <ArrowRight size={15} />
        </Link>
      </div>
      <StageMap stops={stops} />
      <div className="continue-card">
        <div className="continue-art" aria-hidden="true">
          <Sticker name="globe" size={62} tilt={-8} delay={100} />
          <Sticker name="headphones" size={52} tilt={12} delay={200} />
          <Sticker name="abc" size={58} tilt={-4} delay={300} />
        </div>
        <div className="continue-body">
          <span className="current-label">{demoMode ? "Current unit" : "Featured unit"}</span>
          <h3>Technology &amp; Digital Life</h3>
          <p>
            Learn useful vocabulary, reading strategies, writing tasks and
            speaking skills for real-world topics.
          </p>
          <Link
            href="/app/lesson/technology-digital-life"
            className="button coral"
          >
            Continue learning <ArrowRight size={16} />
          </Link>
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
              "How many tasks is your daily goal?",
              String(goal),
            );
            if (value && /^d+$/.test(value)) void setGoal(Number(value)).catch(() => {});
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
          <h2>Practice Now</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          See all <ChevronRight size={14} />
        </Link>
      </div>
      <div className="practice-panel">
        <div>
          <span className="purple-tag">Speaking practice</span>
          <h3>Talk about Technology</h3>
          <p>Answer 3 simple questions and listen to your recording.</p>
          <Link href="/app/speaking" className="button purple">
            Start practice <ArrowRight size={16} />
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
          <h2>Recommended for You</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          More lessons <ArrowRight size={14} />
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
  { sticker: "star", label: "First Steps", detail: "Complete 5 tasks", earned: true, tilt: -8 },
  { sticker: "rocket", label: "On a Roll", detail: "7 day streak", earned: true, tilt: 6 },
  { sticker: "mountain", label: "Explorer", detail: "Complete a unit", earned: true, tilt: -4 },
  { sticker: "lock", label: "Word Master", detail: "Learn 100 words", earned: false, tilt: 5 },
];

function Achievements() {
  const { tasks, attempts } = useDemo();
  if (!demoMode) return <section className="card achievements"><div className="card-head"><div className="head-title"><HeadIcon icon={Activity} tone="mint" /><h2>Your activity</h2></div><Link href="/app/progress" className="text-link">View all</Link></div><div className="activity-tiles"><div><strong>{tasks.filter((task) => task.completed).length}</strong><small>Completed tasks</small></div><div><strong>{attempts.length}</strong><small>Practice attempts</small></div></div></section>;
  return (
    <section className="card achievements">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Medal} tone="sun" />
          <h2>Your Progress</h2>
        </div>
        <Link href="/app/progress" className="text-link">
          View all
        </Link>
      </div>
      <div className="achievement-tabs">
        <span className="active">Achievements</span>
        <Link href="/app/progress">Skill stats</Link>
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

export function Dashboard() {
  return (
    <div className="dashboard-grid">
      <div className="dashboard-main stagger">
        {demoMode && <div className="demo-note"><i aria-hidden="true" /> Demo preview · Your changes are saved in this browser</div>}
        <WelcomeBanner />
        <LatestNews />
        <StudyProgress />
        <LearningPath />
        <div className="dashboard-duo">
          <TodayGoal />
          <PracticeNow />
        </div>
        <Recommended />
      </div>
      <aside className="dashboard-aside stagger">
        <StudyRoomCard />
        <PlannerMini />
        <Achievements />
      </aside>
    </div>
  );
}
