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
import { PlannerMini } from "@/features/planner/planner-widgets";
import { useDemo } from "@/features/demo/demo-store";
import { recommendations, stages, todayISO, type Skill } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";

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
        <span>Step by step to a more confident you.</span>
        <div className="welcome-actions">
          <Link href="/app/lesson/technology-digital-life" className="button primary">
            Continue learning <ArrowRight size={16} />
          </Link>
          <Link href="/app/planner" className="button ghost">
            <CalendarDays size={16} /> {doneToday}/{goal} tasks today
          </Link>
        </div>
      </div>
      <div className="welcome-art" aria-hidden="true">
        <Sticker name="harry" size={132} tilt={-4} float className="welcome-harry" />
        <Sticker name="bubble" label="Let’s go!" size={86} tilt={8} delay={150} className="welcome-bubble" />
        <Sticker name="star" label="7.0" size={62} tilt={-12} delay={260} float className="welcome-star" />
        <Sticker name="book" size={64} tilt={10} delay={340} className="welcome-book" />
        <Sticker name="pencil" size={50} tilt={-20} delay={420} className="welcome-pencil" />
      </div>
    </section>
  );
}

function LearningPath() {
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
      <div className="path-scroll">
        <div className="path-line" />
        {stages.map((stage, index) => (
          <Link
            key={stage.id}
            href={`/app/learn/${stage.id}`}
            className={`path-node ${demoMode ? stage.status : index === 0 ? "current" : "future"}`}
            title={stage.description}
          >
            <span className="node-check">
              {demoMode && stage.status === "done" ? (
                <Check size={13} strokeWidth={3.2} />
              ) : (demoMode ? stage.status === "current" : index === 0) ? (
                <i />
              ) : null}
            </span>
            <strong>{stage.range}</strong>
            <small>{stage.name}</small>
          </Link>
        ))}
      </div>
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
  const { tasks, goal, setGoal } = useDemo();
  const done = tasks.filter((t) => t.date === todayISO() && t.completed).length;
  const pct = Math.min(100, Math.round((done / goal) * 100));
  return (
    <section className="card goal-card">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={Target} tone="coral" />
          <h2>Today’s Goal</h2>
        </div>
        <button
          className="text-link"
          onClick={() => {
            const value = prompt(
              "How many tasks is your daily goal?",
              String(goal),
            );
            if (value && /^\d+$/.test(value)) void setGoal(Number(value)).catch(() => {});
          }}
        >
          Set goal <ChevronRight size={14} />
        </button>
      </div>
      <div className="goal-content">
        <div
          className="progress-ring"
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        >
          <div>
            <strong>{pct}%</strong>
            <span>
              {done} / {goal} tasks
            </span>
          </div>
        </div>
        <div>
          <strong>Complete {goal} learning tasks</strong>
          <p>Tick tasks off in your planner to fill the ring.</p>
          <small className={pct >= 100 ? "goal-state done" : "goal-state"}>
            {pct >= 100
              ? "Goal reached! Amazing work."
              : "You’re on track! Keep going!"}
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
        <div className="demo-note"><i aria-hidden="true" /> {demoMode ? "Demo preview · Your changes are saved in this browser" : "Your tasks and practice are saved to your account"}</div>
        <WelcomeBanner />
        <LearningPath />
        <div className="dashboard-duo">
          <TodayGoal />
          <PracticeNow />
        </div>
        <Recommended />
      </div>
      <aside className="dashboard-aside stagger">
        <PlannerMini />
        <Achievements />
        <Link href="/app/study-together" className="card encouragement lift">
          <Sticker name="coffee" size={50} tilt={-6} />
          <div>
            <strong>One step closer!</strong>
            <p>A little practice every day adds up. Join the study room.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      </aside>
    </div>
  );
}
