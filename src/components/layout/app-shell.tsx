"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  FlaskConical,
  ChevronDown,
  Flame,
  GraduationCap,
  Headphones,
  Home,
  Languages,
  Menu,
  Mic,
  NotebookPen,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trophy,
  X,
  Bell,
  LogOut,
  Newspaper,
  UsersRound,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { useDemo } from "@/features/demo/demo-store";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { NotebookWidget } from "@/features/notebook/notebook-ui";
import { useStudyPresence } from "@/features/study-room/study-presence";

const links = [
  { href: "/app/dashboard", label: "Dashboard", icon: Home },
  { href: "/app/learn", label: "Learn", icon: GraduationCap },
  { href: "/app/news", label: "Daily News", icon: Newspaper },
  { href: "/app/news/learn", label: "Learn with News", icon: BookOpen },
  { href: "/app/study-together", label: "Cùng học", icon: UsersRound },
  { href: "/app/content-lab", label: "Content Lab", icon: FlaskConical },
  { href: "/app/notebook", label: "Notebook", icon: NotebookPen },
  { href: "/app/vocabulary", label: "Vocabulary", icon: Languages },
  { href: "/app/grammar", label: "Grammar", icon: BookOpen },
  { href: "/app/reading", label: "Reading", icon: BookOpen },
  { href: "/app/listening", label: "Listening", icon: Headphones },
  { href: "/app/writing", label: "Writing", icon: NotebookPen },
  { href: "/app/speaking", label: "Speaking", icon: Mic },
  { href: "/app/planner", label: "Planner", icon: CalendarDays },
  { href: "/app/progress", label: "Progress", icon: ChartNoAxesCombined },
];

const searchItems = [
  {
    label: "Technology & Digital Life",
    href: "/app/lesson/technology-digital-life",
    type: "Lesson",
  },
  { label: "Vocabulary flashcards", href: "/app/vocabulary", type: "Practice" },
  { label: "Present Simple", href: "/app/grammar", type: "Grammar" },
  { label: "City gardens", href: "/app/reading", type: "Reading" },
  {
    label: "Everyday conversations",
    href: "/app/listening",
    type: "Listening",
  },
];

export function AppShell({ children, canManage = false }: { children: React.ReactNode; canManage?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tasks, attempts, error, clearError } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { online: studyOnline } = useStudyPresence();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const completed = tasks.filter((t) => t.completed).length;
  const xp = 320 + Math.max(0, completed - 3) * 15 + attempts.length * 20;
  const filtered = searchItems
    .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(window.localStorage.getItem("ieltswithharry-sidebar-collapsed") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      window.localStorage.setItem("ieltswithharry-sidebar-collapsed", String(!current));
      return !current;
    });
  }

  return (
    <div className={`app-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar">
        <button
          className="mobile-menu icon-button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={23} />
        </button>
        <button
          type="button"
          className="desktop-sidebar-toggle icon-button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="student-sidebar"
          title={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={21} /> : <PanelLeftClose size={21} />}
        </button>
        <Link href="/app/dashboard" className="brand">
          <span className="brand-mascot">
            <HarryMascot size={49} />
          </span>
          <span>
            Ielts<b>WithHarry</b>
          </span>
        </Link>
        <div className="header-search">
          <Search size={20} />
          <input
            aria-label="Search lessons"
            placeholder="Search lessons, topics or skills..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                router.push(filtered[0].href);
                setSearchOpen(false);
              }
              if (e.key === "Escape") setSearchOpen(false);
            }}
          />
          <kbd>⌘ K</kbd>
          {searchOpen && query && (
            <div className="search-results">
              <div className="search-title">Search results</div>
              {filtered.length ? (
                filtered.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery("");
                    }}
                  >
                    <span>{item.label}</span>
                    <small>{item.type}</small>
                  </Link>
                ))
              ) : (
                <p>No matching lessons yet.</p>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          {demoMode && <div className="stat-pill streak">
            <Flame size={23} fill="#ff9b3d" color="#ff752f" />
            <strong>12</strong>
            <small>day streak</small>
          </div>}
          {demoMode && <div className="stat-pill xp">
            <Star size={23} fill="#ffd15a" color="#eca927" />
            <strong>{xp}</strong>
            <small>XP points</small>
          </div>}
          <div className="stat-pill level">
            <Trophy size={22} fill="#ffd15a" color="#e9a923" />
            <strong>{demoMode ? "Level 3" : `${completed} tasks`}</strong>
            <small>{demoMode ? "Demo learner" : `${attempts.length} practices`}</small>
          </div>
          <div className="popover-wrap">
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileOpen(false);
              }}
            >
              <Bell size={20} />
            </button>
            {notificationsOpen && (
              <div className="small-popover">
                <b>Notifications</b>
                <p>
                  Welcome to your learning lab! Your practice tasks are ready.
                </p>
              </div>
            )}
          </div>
          <div className="popover-wrap">
            <button
              className="avatar-button"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
            >
              <span>👩🏻</span>
              <ChevronDown size={16} />
            </button>
            {profileOpen && (
              <div className="small-popover profile-menu">
                <b>{demoMode ? "Demo learner" : "My account"}</b>
                <small>{demoMode ? "Local demo mode" : "Saved with Supabase"}</small>
                <Link
                  href="/app/progress"
                  onClick={() => setProfileOpen(false)}
                >
                  <ChartNoAxesCombined size={16} /> Progress
                </Link>
                <Link
                  href="/app/settings"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={16} /> Settings
                </Link>
                {canManage && <Link href="/admin" onClick={() => setProfileOpen(false)}><ShieldCheck size={16} /> Admin portal</Link>}
                {demoMode ? <button onClick={async () => { await fetch("/auth/demo", { method: "DELETE" }); router.push("/"); router.refresh(); }}><LogOut size={16} /> Thoát demo</button> :
                  <button onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}><LogOut size={16} /> Sign out</button>}
              </div>
            )}
          </div>
        </div>
      </header>
      <aside id="student-sidebar" className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-mobile-head">
          <span>Menu</span>
          <button
            className="icon-button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`nav-link ${pathname === href || (href !== "/app/dashboard" && pathname.startsWith(href + "/")) ? "active" : ""}`}
              title={label}
            >
              <Icon size={21} strokeWidth={2.3} />
              <span>{label}</span>
              {href === "/app/study-together" && <span className="study-nav-count" aria-label={`${studyOnline ?? "Đang kết nối"} người đang học trực tiếp`}><i />{studyOnline ?? "…"}</span>}
            </Link>
          ))}
          {canManage && <Link href="/admin" onClick={() => setMenuOpen(false)} className="nav-link"><ShieldCheck size={21} strokeWidth={2.3} /><span>Admin portal</span></Link>}
        </nav>
        <div className="sidebar-card">
          <div className="sidebar-card-stars">✦ ✧</div>
          <strong>
            Small Steps
            <br />
            Big Progress!
          </strong>
          <HarryMascot size={85} />
          <span>Every practice counts.</span>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="main-area">
        {error && <div className="save-error" role="alert">{error} <button onClick={clearError} aria-label="Dismiss error">×</button></div>}
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {links.filter(({ href }) => ["/app/dashboard", "/app/learn", "/app/study-together", "/app/planner"].includes(href)).map(
          ({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ),
        )}
      </nav>
      <NotebookWidget />
    </div>
  );
}
