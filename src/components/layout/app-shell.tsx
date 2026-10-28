"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  CalendarDays,
  ChartNoAxesCombined,
  FlaskConical,
  ChevronDown,
  Flame,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  Languages,
  Library,
  Menu,
  Mic,
  NotebookPen,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  SpellCheck,
  Star,
  Trophy,
  X,
  Bell,
  LogOut,
  Newspaper,
  UserRound,
  UsersRound,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { Tape } from "@/components/stickers/stickers";
import { HarryBuddy } from "@/components/fx/harry-buddy";
import { useDemo } from "@/features/demo/demo-store";
import { demoMode, liveMode, lockedLearnerPath } from "@/lib/runtime";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { createClient } from "@/lib/supabase/browser";
import { NotebookWidget } from "@/features/notebook/notebook-ui";
import { useStudyPresence } from "@/features/study-room/study-presence";
import { NotificationBell } from "@/components/account/notification-bell";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useNewsUnread } from "@/features/news/news-unread";

const groups = [
  {
    label: "Tổng quan",
    links: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, tone: "teal" },
      { href: "/app/learn", label: "Learn", icon: GraduationCap, tone: "sky" },
      { href: "/app/planner", label: "Planner", icon: CalendarDays, tone: "coral" },
      { href: "/app/progress", label: "Progress", icon: ChartNoAxesCombined, tone: "lavender" },
    ],
  },
  {
    label: "Kỹ năng IELTS",
    links: [
      { href: "/app/vocabulary", label: "Vocabulary", icon: Languages, tone: "mint" },
      { href: "/app/grammar", label: "Grammar", icon: SpellCheck, tone: "sky" },
      { href: "/app/reading", label: "Reading", icon: BookOpenText, tone: "coral" },
      { href: "/app/listening", label: "Listening", icon: Headphones, tone: "teal" },
      { href: "/app/writing", label: "Writing", icon: PenLine, tone: "sun" },
      { href: "/app/speaking", label: "Speaking", icon: Mic, tone: "lavender" },
      ...(!demoMode ? [{ href: "/app/question-bank", label: "Ngân hàng đề", icon: Library, tone: "teal" }] : []),
    ],
  },
  {
    label: "Học với tin tức",
    links: [
      { href: "/app/news", label: "Daily News", icon: Newspaper, tone: "sky" },
      { href: "/app/news/learn", label: "Learn with News", icon: Library, tone: "mint" },
    ],
  },
  {
    label: "Không gian học",
    links: [
      { href: "/app/study-together", label: "Cùng học", icon: UsersRound, tone: "lavender" },
      { href: "/app/notebook", label: "Notebook", icon: NotebookPen, tone: "sun" },
      { href: "/app/content-lab", label: "Content Lab", icon: FlaskConical, tone: "coral" },
    ],
  },
];
const links = groups.flatMap((group) => group.links);

type SkillPracticeLink = { label: string; href: string; kind?: "parent" | "child" | "full" };
const skillPracticeLinks: Record<string, SkillPracticeLink[]> = {
  vocabulary: [
    { label: "Học theo topic & Level", href: "/app/vocabulary/library" },
    { label: "Bộ thẻ cá nhân", href: "/app/vocabulary/decks" },
    { label: "Luyện từ vựng", href: "/app/vocabulary/practice" },
    { label: "Ôn từ đã lưu", href: "/app/vocabulary/review" },
  ],
  grammar: [{ label: "Từ nối trong ngữ cảnh", href: "/app/grammar/live" }],
  ...(!demoMode ? {
    reading: [
      { label: "Bài lẻ", href: "/app/reading?type=passage", kind: "parent" as const },
      ...[1, 2, 3].map((part): SkillPracticeLink => ({ label: `Passage ${part}`, href: `/app/reading?type=passage&part=${part}`, kind: "child" })),
      { label: "Full đề", href: "/app/reading?type=full_test", kind: "full" as const },
    ],
    listening: [
      { label: "Bài lẻ", href: "/app/listening?type=part", kind: "parent" as const },
      ...[1, 2, 3, 4].map((part): SkillPracticeLink => ({ label: `Section ${part}`, href: `/app/listening?type=part&part=${part}`, kind: "child" })),
      { label: "Full đề", href: "/app/listening?type=full_test", kind: "full" as const },
    ],
  } : {}),
  writing: [
    ...(!demoMode ? [{ label: "Ngân hàng đề", href: "/app/writing#ngan-hang-de" }] : []),
    { label: "Academic Task 1", href: "/app/writing/task-1" },
    { label: "Academic Task 2", href: "/app/writing/task-2" },
  ],
  speaking: [
    ...(!demoMode ? [{ label: "Ngân hàng đề", href: "/app/speaking#ngan-hang-de" }] : []),
    { label: "Part 1 interview", href: "/app/speaking?type=part1" },
    { label: "Part 2 cue card", href: "/app/speaking/live" },
    { label: "Part 3 follow-up", href: "/app/speaking/part-3" },
    ...(!demoMode ? [{ label: "Thi thử Speaking", href: "/app/speaking/mock" }] : []),
  ],
};

const searchItems = [
  {
    label: "Technology & Digital Life",
    href: "/app/lesson/technology-digital-life",
    type: "Lesson",
  },
  { label: "IELTS Vocabulary from current news", href: "/app/vocabulary", type: "Practice" },
  { label: "IELTS Grammar in context", href: "/app/grammar", type: "Grammar" },
  { label: "IELTS Reading practice", href: "/app/reading", type: "Reading" },
  {
    label: "IELTS Listening practice",
    href: "/app/listening",
    type: "Listening",
  },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/app/dashboard" || !pathname.startsWith(href + "/")) return false;
  // Daily News should not stay highlighted while Learn with News is open.
  return !links.some((link) => link.href !== href && link.href.startsWith(href + "/") && (pathname === link.href || pathname.startsWith(link.href + "/")));
}

export function AppShell({ children, canManage = false }: { children: React.ReactNode; canManage?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tasks, attempts, error, clearError } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { online: studyOnline } = useStudyPresence();
  const learnerStreak = useLearnerStreak();
  const newsUnread = useNewsUnread(pathname, liveMode);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatar, setAvatar] = useState("harry");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const completed = tasks.filter((t) => t.completed).length;
  const xp = 320 + Math.max(0, completed - 3) * 15 + attempts.length * 20;
  const filtered = searchItems
    .filter((item) => !lockedLearnerPath(item.href) && item.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);
  const section = pathname.split("/")[2] || "dashboard";
  const [skillMenuOverride, setSkillMenuOverride] = useState<{ pathname: string; skill: string | null } | null>(null);
  const expandedSkill = skillMenuOverride?.pathname === pathname
    ? skillMenuOverride.skill
    : skillPracticeLinks[section] ? section : null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(window.localStorage.getItem("ieltswithharry-sidebar-collapsed") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (demoMode) return;
    const db = createClient();
    let active = true;
    async function loadAvatar() {
      const { data: user } = await db.auth.getUser();
      if (!user.user) return;
      const { data } = await db.from("profiles").select("avatar").eq("id", user.user.id).maybeSingle();
      if (active && data?.avatar) setAvatar(data.avatar);
    }
    void loadAvatar();
    window.addEventListener("account-avatar-updated", loadAvatar);
    return () => { active = false; window.removeEventListener("account-avatar-updated", loadAvatar); };
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
          <Menu size={22} />
        </button>
        <Link href="/app/dashboard" className="brand">
          <span className="brand-mascot">
            <HarryMascot size={40} />
          </span>
          <span>
            Ielts<b>WithHarry</b>
          </span>
        </Link>
        <button
          type="button"
          className="desktop-sidebar-toggle icon-button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="student-sidebar"
          title={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
        <div className="header-search">
          <Search size={17} />
          <input
            ref={searchInput}
            aria-label="Search lessons"
            placeholder="Search lessons, topics or skills..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                router.push(filtered[0].href);
                setSearchOpen(false);
              }
              if (e.key === "Escape") {
                setSearchOpen(false);
                e.currentTarget.blur();
              }
            }}
          />
          <kbd>Ctrl K</kbd>
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
          <Link href="/app/progress" className="stat-pill streak" title="Chuỗi ngày học">
            <Flame size={18} fill="#ff9b3d" color="#ef6a24" />
            <strong>{demoMode ? 12 : learnerStreak?.current ?? "…"}</strong>
            <small>ngày liên tiếp</small>
          </Link>
          {demoMode && <div className="stat-pill xp" title="XP points">
            <Star size={18} fill="#ffd15a" color="#e0a020" />
            <strong>{xp}</strong>
            <small>XP</small>
          </div>}
          <div className="stat-pill level">
            <Trophy size={18} fill="#ffd15a" color="#d99a17" />
            <strong>{demoMode ? "Level 3" : `${completed} tasks`}</strong>
            <small>{demoMode ? "Demo learner" : `${attempts.length} practices`}</small>
            {demoMode && <span className="level-bar" title={`${xp % 500}/500 XP tới level tiếp theo`}><i style={{ width: `${(xp % 500) / 5}%` }} /></span>}
          </div>
          <span className="header-divider" aria-hidden="true" />
          <div className="popover-wrap">
            {!demoMode ? <NotificationBell open={notificationsOpen} onToggle={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} /> : <><button
              className="icon-button notification-button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileOpen(false);
              }}
            >
              <Bell size={18} />
              <i className="notification-dot" aria-hidden="true" />
            </button>
            {notificationsOpen && (
              <div className="small-popover">
                <b>Notifications</b>
                <p>
                  Welcome to your learning lab! Your practice tasks are ready.
                </p>
              </div>
            )}</>}
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
              {demoMode ? <span><UserRound size={18} strokeWidth={2.2} /></span> : canManage ? <HarryMascot size={34} /> : <AccountAvatar value={avatar} size={34} />}
              <ChevronDown size={15} />
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
                  href="/app/profile"
                  onClick={() => setProfileOpen(false)}
                >
                  <UserRound size={16} /> Hồ sơ của tôi
                </Link>
                <Link
                  href="/app/profile#edit"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={16} /> Chỉnh sửa hồ sơ
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
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.links.map(({ href, label, icon: Icon, tone }) => {
                const skill = href.split("/")[2];
                const practiceLinks = skillPracticeLinks[skill];
                const examSkill = skill === "reading" || skill === "listening";
                const expanded = expandedSkill === skill && Boolean(practiceLinks);
                const active = isActive(pathname, href);
                if (lockedLearnerPath(href)) return <div key={href} className="nav-link nav-link-locked" aria-label={`${label} đang chuẩn bị`} title={`${label} đang chuẩn bị`}>
                  <b className={`nav-icon tone-${tone}`}><Icon size={17} strokeWidth={2.2} /></b><span>{label}</span><small>Sắp mở</small>
                </div>;
                return <div className={`nav-item ${examSkill ? `nav-exam-item nav-exam-${skill}` : ""}`} key={href}>
                  <Link
                    href={practiceLinks && !examSkill ? `${href}#che-do-hoc` : href}
                    onClick={() => {
                      if (practiceLinks) setSkillMenuOverride({ pathname, skill: examSkill ? skill : expanded ? null : skill });
                      else setMenuOpen(false);
                    }}
                    className={`nav-link ${active ? "active" : ""} ${practiceLinks ? "nav-skill-link" : ""}`}
                    aria-current={pathname === href ? "page" : undefined}
                    aria-expanded={practiceLinks ? expanded : undefined}
                    aria-controls={practiceLinks ? `skill-practice-${skill}` : undefined}
                    title={label}
                  >
                    <b className={`nav-icon tone-${tone}`}><Icon size={17} strokeWidth={2.2} /></b>
                    <span>{label}</span>
                    {practiceLinks && <ChevronDown className="nav-skill-chevron" size={15} aria-hidden="true" />}
                    {href === "/app/study-together" && <span className="study-nav-count" aria-label={`${studyOnline ?? "Đang kết nối"} người đang học trực tiếp`}><i />{studyOnline ?? "…"}</span>}
                    {href === "/app/news" && liveMode && <span className={`study-nav-count news-nav-count ${newsUnread ? "has-new" : ""}`} aria-label={`${newsUnread} tin mới`} title={`${newsUnread} tin mới`}><b>+{newsUnread > 99 ? "99" : newsUnread}</b><small> mới</small></span>}
                  </Link>
                  {practiceLinks && <div id={`skill-practice-${skill}`} role="group" className={`nav-submenu ${examSkill ? "nav-exam-submenu" : ""}`} hidden={!expanded} aria-label={`Chế độ luyện ${label}`}>
                    {!examSkill && <Link href={`${href}#che-do-hoc`} className="nav-submenu-link" onClick={() => setMenuOpen(false)}>Tất cả chế độ</Link>}
                    {practiceLinks.filter((practice) => !lockedLearnerPath(practice.href)).map((practice) => {
                      const target = new URL(practice.href, "https://ieltswithharry.local");
                      const selected = examSkill
                        ? pathname === target.pathname && (searchParams.get("type") ?? (skill === "reading" ? "passage" : "part")) === target.searchParams.get("type") && (searchParams.get("part") ?? "") === (target.searchParams.get("part") ?? "")
                        : pathname === practice.href;
                      const parentSelected = examSkill && practice.kind === "parent" && pathname === target.pathname && (searchParams.get("type") ?? (skill === "reading" ? "passage" : "part")) === target.searchParams.get("type");
                      return <Link
                        key={practice.href}
                        href={practice.href}
                        className={`nav-submenu-link ${examSkill ? `nav-exam-option nav-exam-${practice.kind}` : ""} ${selected ? "active" : ""} ${parentSelected ? "group-active" : ""}`}
                        aria-current={selected ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >{practice.label}</Link>;
                    })}
                  </div>}
                </div>;
              })}
            </div>
          ))}
          {canManage && <div className="nav-group"><span className="nav-group-label">Quản trị</span><Link href="/admin" onClick={() => setMenuOpen(false)} className="nav-link" title="Admin portal"><b className="nav-icon tone-teal"><ShieldCheck size={17} strokeWidth={2.2} /></b><span>Admin portal</span></Link></div>}
        </nav>
        <div className="sidebar-card">
          <Tape tone="sun" />
          <HarryBuddy size={60} className="sidebar-buddy" tips={["Small steps, big progress!", "Hôm nay học gì nào?", "Nhớ uống nước nhé!", "Mỗi bài luyện đều có giá trị.", "Cố lên, bạn làm được!"]} />
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
        <div className="page-enter" key={section}>{children}</div>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {links.filter(({ href }) => ["/app/dashboard", "/app/learn", "/app/study-together", "/app/planner"].includes(href)).map(
          ({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ),
        )}
      </nav>
      <NotebookWidget />
    </div>
  );
}
