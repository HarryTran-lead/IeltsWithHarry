"use client";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CirclePlay,
  Sparkles,
} from "lucide-react";
import { Mochi, StudyIllustration } from "@/components/illustrations/mochi";
import { PlannerMini } from "@/features/planner/planner-widgets";
import { useDemo } from "@/features/demo/demo-store";
import { recommendations, stages, todayISO } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";

function WelcomeBanner() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <section className="welcome-banner">
      <span className="sun-doodle">☀️</span>
      <div className="welcome-copy">
        <p>{greeting}!</p>
        <h1>Keep going, you’re doing great!</h1>
        <span>
          Step by step to a more confident you <span className="heart">♥</span>
        </span>
      </div>
      <div className="welcome-art">
        <div className="speech-bubble">
          Better
          <br />
          English
          <br />
          Brighter
          <br />
          You! ✨
        </div>
        <StudyIllustration />
      </div>
      <div className="cloud cloud-one" />
      <div className="cloud cloud-two" />
    </section>
  );
}

function LearningPath() {
  return (
    <section className="card learning-path">
      <div className="card-head">
        <div className="head-title">
          <span className="emoji-icon">🗺️</span>
          <div>
            <h2>Your Learning Path</h2>
            <p>From band 1.0 to 7.0+ — build your skills step by step.</p>
          </div>
        </div>
        <Link href="/app/learn" className="link-pill">
          View All Levels <ArrowRight size={16} />
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
                <Check size={16} strokeWidth={3} />
              ) : (demoMode ? stage.status === "current" : index === 0) ? (
                "●"
              ) : (
                ""
              )}
            </span>
            <strong>{stage.range}</strong>
            <small>{stage.name}</small>
            {index < stages.length - 1 && <i />}
          </Link>
        ))}
      </div>
      <div className="continue-card">
        <div className="continue-art">
          <div className="mini-laptop">
            📱<span>💻</span>
          </div>
          <span className="plant">🌿</span>
        </div>
        <div className="continue-body">
          <span className="current-label">{demoMode ? "Current Unit" : "Featured Unit"}</span>
          <h3>Technology &amp; Digital Life</h3>
          <p>
            Learn useful vocabulary, reading strategies, writing tasks and
            speaking skills for real-world topics.
          </p>
          <Link
            href="/app/lesson/technology-digital-life"
            className="button coral"
          >
            Continue Learning <ArrowRight size={17} />
          </Link>
        </div>
        <div className="continue-skills">
          {["Vocabulary", "Reading", "Listening", "Writing", "Speaking"].map(
            (skill, i) => (
              <span key={skill}>
                <i className={demoMode && i < 2 ? "filled" : ""}>
                  {demoMode && i < 2 && <Check size={11} strokeWidth={4} />}
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
          <span className="emoji-icon">🎯</span>
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
          Set Goal ›
        </button>
      </div>
      <div className="goal-content">
        <div
          className="progress-ring"
          style={{
            background: `conic-gradient(#30c9c9 ${pct}%, #d9edf6 ${pct}% 100%)`,
          }}
        >
          <div>
            <strong>{pct}%</strong>
            <span>
              {done} / {goal} tasks
            </span>
          </div>
        </div>
        <div>
          <strong>Today’s Goal</strong>
          <p>Complete {goal} learning tasks</p>
          <small>
            🌱{" "}
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
          <span className="emoji-icon">⚡</span>
          <h2>Practice Now</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          See All ›
        </Link>
      </div>
      <div className="practice-panel">
        <span className="practice-icon">🎙️</span>
        <div>
          <span className="purple-tag">Speaking Practice</span>
          <h3>Talk about Technology</h3>
          <p>Answer 3 simple questions and listen to your recording.</p>
          <Link href="/app/speaking" className="button purple">
            Start Practice <ArrowRight size={16} />
          </Link>
        </div>
        <span className="practice-face">👩🏻‍💻</span>
      </div>
    </section>
  );
}

function Recommended() {
  return (
    <section className="card recommended">
      <div className="card-head">
        <div className="head-title">
          <span className="emoji-icon">✨</span>
          <h2>Recommended for You</h2>
        </div>
        <Link href="/app/learn" className="text-link">
          More Lessons <ArrowRight size={15} />
        </Link>
      </div>
      <div className="recommend-grid">
        {recommendations.map((item) => (
          <Link href={item.href} key={item.title} className="recommend-card">
            <span className="recommend-emoji">{item.icon}</span>
            <div>
              <span className={`skill-tag ${item.skill.toLowerCase()}`}>
                {item.skill}
              </span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
    </section>
  );
}

const badges = [
  {
    icon: "⭐",
    label: "First Steps",
    detail: "Complete 5 tasks",
    earned: true,
    color: "coral",
  },
  {
    icon: "🚀",
    label: "On a Roll",
    detail: "7 day streak",
    earned: true,
    color: "purple",
  },
  {
    icon: "🏔️",
    label: "Explorer",
    detail: "Complete a unit",
    earned: true,
    color: "blue",
  },
  {
    icon: "🔒",
    label: "Word Master",
    detail: "Learn 100 words",
    earned: false,
    color: "gray",
  },
];

function Achievements() {
  const { tasks, attempts } = useDemo();
  if (!demoMode) return <section className="card achievements"><div className="card-head"><div className="head-title"><span className="emoji-icon">📈</span><h2>Your activity</h2></div><Link href="/app/progress" className="text-link">View All</Link></div><div className="planner-summary"><div><strong>{tasks.filter((task) => task.completed).length}</strong><small>Completed tasks</small></div><div><strong>{attempts.length}</strong><small>Practice attempts</small></div></div></section>;
  return (
    <section className="card achievements">
      <div className="card-head">
        <div className="head-title">
          <span className="emoji-icon">🏅</span>
          <h2>Your Progress</h2>
        </div>
        <Link href="/app/progress" className="text-link">
          View All
        </Link>
      </div>
      <div className="achievement-tabs">
        <span className="active">Achievements</span>
        <Link href="/app/progress">Skill Stats</Link>
      </div>
      <div className="badge-grid">
        {badges.map((badge) => (
          <div
            key={badge.label}
            className={`badge-card ${badge.earned ? "" : "locked"}`}
          >
            <span className={`badge-shape ${badge.color}`}>{badge.icon}</span>
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
      <div className="dashboard-main">
        <div className="demo-note"><Sparkles size={14} /> {demoMode ? "Demo preview · Your changes are saved in this browser" : "Your tasks and practice are saved to your account"}</div>
        <WelcomeBanner />
        <LearningPath />
        <div className="dashboard-duo">
          <TodayGoal />
          <PracticeNow />
        </div>
        <Recommended />
      </div>
      <aside className="dashboard-aside">
        <PlannerMini />
        <Achievements />
        <div className="card encouragement">
          <Mochi size={55} />
          <div>
            <strong>One step closer!</strong>
            <p>A little practice every day adds up.</p>
          </div>
          <CirclePlay size={22} />
        </div>
      </aside>
    </div>
  );
}
