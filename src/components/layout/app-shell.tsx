"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  CalendarDays,
  ChartNoAxesCombined,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flame,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  Languages,
  Library,
  Menu,
  MessageCircle,
  Mic,
  NotebookPen,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  SpellCheck,
  X,
  Bell,
  LogOut,
  Newspaper,
  UserRound,
  UsersRound,
} from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { Tape } from "@/components/stickers/stickers";
import { HarryBuddy } from "@/components/fx/harry-buddy";
import { useDemo } from "@/features/demo/demo-store";
import { communityEnabled, demoMode, liveMode, lockedLearnerPath } from "@/lib/runtime";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { createClient } from "@/lib/supabase/browser";
import { NotebookWidget } from "@/features/notebook/notebook-ui";
import { useStudyPresence } from "@/features/study-room/study-presence";
import { NotificationBell } from "@/components/account/notification-bell";
import { AvatarFrame } from "@/components/account/avatar-frame";
import { levelProgress, rankForLevel } from "@/lib/gamification";
import { useNewsUnread } from "@/features/news/news-unread";
import { HeaderSkyBackdrop, HeaderWeatherProvider, HeaderWeatherWidget, useHeaderWeather } from "@/components/header-weather";
import weatherStyles from "@/components/header-weather/headerWeather.module.css";

const groups = [
  {
    label: "HOT",
    links: [
      { href: "/app/news", label: "Daily News", icon: Newspaper, tone: "sky" },
      { href: "/app/study-together", label: "Cùng học", icon: UsersRound, tone: "lavender" },
      ...(communityEnabled ? [{ href: "/app/community", label: "Cộng đồng", icon: MessageCircle, tone: "teal" }] : []),
      { href: "/app/learn", label: "Learn", icon: GraduationCap, tone: "sky" },
    ],
  },
  {
    label: "Luyện tập",
    links: [
      { href: "/app/dictation", label: "Dictation", icon: Headphones, tone: "teal" },
      { href: "/app/practice/translation", label: "Dịch Việt–Anh theo mức", icon: Languages, tone: "mint" },
    ],
  },
  {
    label: "Tổng quan",
    links: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, tone: "teal" },
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
      { href: "/app/news/learn", label: "Learn with News", icon: Library, tone: "mint" },
    ],
  },
  {
    label: "Không gian học",
    links: [
      { href: "/app/notebook", label: "Ghi chú", icon: NotebookPen, tone: "sun" },
      { href: "/app/content-lab", label: "Content Lab", icon: FlaskConical, tone: "coral" },
    ],
  },
];
const links = groups.flatMap((group) => group.links);

type SkillPracticeLink = { label: string; href: string; kind?: "parent" | "child" | "full" };
const skillPracticeLinks: Record<string, SkillPracticeLink[]> = {
  vocabulary: [
    { label: "Ôn tập", href: "/app/vocabulary/review" },
    { label: "Học từ IELTS", href: "/app/vocabulary/study?collection=ielts" },
    { label: "Học từ A1–C2", href: "/app/vocabulary/study?collection=cefr" },
    { label: "Từ IELTS Listening", href: "/app/vocabulary/listening" },
    { label: "Từ IELTS Reading", href: "/app/reading/vocabulary" },
    { label: "Collocations", href: "/app/vocabulary/collocations" },
    { label: "Word Formation", href: "/app/vocabulary/word-formation" },
    { label: "Dịch câu Việt → Anh", href: "/app/vocabulary/translation" },
    { label: "Sổ từ & tiến độ", href: "/app/vocabulary/notebook" },
  ],
  grammar: [
    { label: "Kiểm tra lên cấp", href: "/app/grammar/placement" },
    { label: "Kiểm tra chặng", href: "/app/grammar/tests" },
    { label: "Ôn tập & Sổ lỗi", href: "/app/grammar/review" },
    { label: "Tiến độ Grammar", href: "/app/grammar/progress" },
    { label: "Từ nối trong ngữ cảnh", href: "/app/grammar/live" },
  ],
  ...(!demoMode ? {
    reading: [
      { label: "Bài lẻ", href: "/app/reading?type=passage", kind: "parent" as const },
      ...[1, 2, 3].map((part): SkillPracticeLink => ({ label: `Passage ${part}`, href: `/app/reading?type=passage&part=${part}`, kind: "child" })),
      { label: "Full đề", href: "/app/reading?type=full_test", kind: "full" as const },
    ],
    listening: [
      { label: "1.200 từ IELTS Listening", href: "/app/listening/vocabulary" },
      { label: "Bài lẻ", href: "/app/listening?type=part", kind: "parent" as const },
      ...[1, 2, 3, 4].map((part): SkillPracticeLink => ({ label: `Section ${part}`, href: `/app/listening?type=part&part=${part}`, kind: "child" })),
      { label: "Full đề", href: "/app/listening?type=full_test", kind: "full" as const },
    ],
  } : {}),
  writing: [
    ...(!demoMode ? [
      { label: "Bài lẻ", href: "/app/writing?type=all", kind: "parent" as const },
      { label: "Task 1 · Academic", href: "/app/writing?type=task1_academic", kind: "child" as const },
      { label: "Task 2 · Essay", href: "/app/writing?type=task2", kind: "child" as const },
    ] : []),
    { label: "Task 1 · Số liệu World Bank", href: "/app/writing/task-1", ...(!demoMode ? { kind: "full" as const } : {}) },
    { label: "Task 2 · Chủ đề thời sự", href: "/app/writing/task-2" },
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
  return <HeaderWeatherProvider><AppShellContent canManage={canManage}>{children}</AppShellContent></HeaderWeatherProvider>;
}

function AppShellContent({ children, canManage }: { children: React.ReactNode; canManage: boolean }) {
  const { mode, phase } = useHeaderWeather();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tasks, attempts, error, clearError } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const vocabularyLayout = /^\/app\/(?:vocabulary(?:\/|$)|reading\/vocabulary(?:\/|$)|listening\/vocabulary(?:\/|$))/.test(pathname);
  const learningRoute = /^\/app\/(?:vocabulary\/(?:study|review|practice|listening|collocations|word-formation|translation)(?:\/|$)|reading\/vocabulary(?:\/|$)|listening\/vocabulary(?:\/|$))/.test(pathname);
  const { online: studyOnline } = useStudyPresence();
  const learnerStreak = useLearnerStreak();
  const newsUnread = useNewsUnread(pathname, liveMode);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatar, setAvatar] = useState("harry");
  const [avatarFrame, setAvatarFrame] = useState("classic");
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  const [loginBonus, setLoginBonus] = useState(0);
  const liveProgress = levelProgress(xpTotal ?? 0);
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
    if (!learningRoute) return;
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(false);
      window.localStorage.setItem("ieltswithharry-sidebar-collapsed", "false");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [learningRoute, pathname]);

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
      // The local session is enough to address our own profile row (RLS still checks it on the server);
      // getUser() would add a round trip to the auth server before anything else could start.
      const { data: session } = await db.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) return;
      // Claim first: the summary must include today's login bonus.
      const [{ data }, claim] = await Promise.all([
        db.from("profiles").select("avatar,avatar_frame").eq("id", userId).maybeSingle(),
        db.rpc("claim_daily_login_xp"),
      ]);
      if (active && data?.avatar) setAvatar(data.avatar);
      if (active && data?.avatar_frame) setAvatarFrame(data.avatar_frame);
      if (active && !claim.error && Number(claim.data) === 5) setLoginBonus(5);
      const summary = await db.rpc("learner_xp_summary");
      if (active && !summary.error) setXpTotal(Number((summary.data as { xp?: number } | null)?.xp ?? 0));
    }
    // Once per visit (the shell now stays mounted across pages); avatar changes and some XP awards announce themselves.
    void loadAvatar();
    window.addEventListener("account-avatar-updated", loadAvatar);
    window.addEventListener("learner-xp-updated", loadAvatar);
    return () => { active = false; window.removeEventListener("account-avatar-updated", loadAvatar); window.removeEventListener("learner-xp-updated", loadAvatar); };
  }, []);

  // XP is summed from many activities, most of which don't announce it, so re-read just the
  // total in the background after each page change (skipping the first page, loaded above).
  const xpPathname = useRef(pathname);
  useEffect(() => {
    if (demoMode || xpPathname.current === pathname) return;
    xpPathname.current = pathname;
    let active = true;
    void createClient().rpc("learner_xp_summary").then((summary) => {
      if (active && !summary.error) setXpTotal(Number((summary.data as { xp?: number } | null)?.xp ?? 0));
    });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    if (!loginBonus) return;
    const timer = window.setTimeout(() => setLoginBonus(0), 5000);
    return () => window.clearTimeout(timer);
  }, [loginBonus]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      window.localStorage.setItem("ieltswithharry-sidebar-collapsed", String(!current));
      return !current;
    });
  }

  return (
    <div
      className={`app-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${vocabularyLayout ? "vocabulary-layout" : ""} ${learningRoute ? "learning-focus" : ""} ${mode !== "off" ? weatherStyles.skyFrame : ""}`}
      data-sky-phase={mode !== "off" ? phase : undefined}
    >
      <header className={`topbar ${mode !== "off" ? weatherStyles.headerSurface : ""}`}>
        <HeaderSkyBackdrop />
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
          {loginBonus > 0 && <span className="login-xp-toast" role="status">+5 XP · Đăng nhập hôm nay</span>}
          <HeaderWeatherWidget />
          <Link href="/app/progress" className="stat-pill streak" title="Chuỗi ngày học">
            <Flame size={18} fill="#ff9b3d" color="#ef6a24" />
            <strong>{demoMode ? 12 : learnerStreak?.current ?? "…"}</strong>
            <small>ngày liên tiếp</small>
          </Link>
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
              className="avatar-button profile-trigger"
              aria-label={`Mở menu hồ sơ, cấp ${demoMode ? 3 : xpTotal === null ? "đang tải" : liveProgress.level}, ${demoMode ? xp : xpTotal?.toLocaleString("vi-VN") ?? "đang tải"} XP`}
              aria-expanded={profileOpen}
              title={demoMode ? `${xp % 500}/500 XP tới cấp tiếp theo` : xpTotal === null ? "Đang tải XP" : `${rankForLevel(liveProgress.level)} · ${liveProgress.earned}/${liveProgress.required} XP tới cấp ${liveProgress.level + 1}`}
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
            >
              <span className="profile-trigger-avatar">
                {demoMode ? <span className="profile-demo-avatar"><UserRound size={18} strokeWidth={2.2} /></span> : canManage ? <HarryMascot size={34} /> : <AvatarFrame avatar={avatar} frame={avatarFrame} size={34} />}
                <ChevronDown size={13} />
              </span>
              <span className="profile-trigger-progress">
                <span><b>{demoMode ? "Cấp 3" : xpTotal === null ? "Cấp …" : `Cấp ${liveProgress.level}`}</b><small>{demoMode ? xp : xpTotal?.toLocaleString("vi-VN") ?? "…"} XP</small></span>
                <span className="level-bar"><i style={{ width: demoMode ? `${(xp % 500) / 5}%` : `${liveProgress.percent}%` }} /></span>
              </span>
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
      <button
        type="button"
        className="desktop-sidebar-toggle icon-button"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
        aria-expanded={!sidebarCollapsed}
        aria-controls="student-sidebar"
        title={sidebarCollapsed ? "Mở sidebar" : "Ẩn sidebar"}
      >
        {sidebarCollapsed ? <ChevronRight size={15} strokeWidth={2.5} /> : <ChevronLeft size={15} strokeWidth={2.5} />}
      </button>
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
              <span className={`nav-group-label ${group.label === "HOT" ? "nav-group-hot" : ""}`}>{group.label === "HOT" && <Flame size={13} aria-hidden="true" />}{group.label}</span>
              {group.links.map(({ href, label, icon: Icon, tone }) => {
                const skill = href.split("/")[2];
                const practiceLinks = skillPracticeLinks[skill];
                const examSkill = skill === "reading" || skill === "listening" || (skill === "writing" && !demoMode);
                const currentType = searchParams.get("type") ?? (skill === "reading" ? "passage" : skill === "listening" ? "part" : "all");
                const expanded = expandedSkill === skill && Boolean(practiceLinks);
                const active = isActive(pathname, href);
                if (lockedLearnerPath(href)) return <div key={href} className="nav-link nav-link-locked" aria-label={`${label} đang chuẩn bị`} title={`${label} đang chuẩn bị`}>
                  <b className={`nav-icon tone-${tone}`}><Icon size={17} strokeWidth={2.2} /></b><span>{label}</span><small>Sắp mở</small>
                </div>;
                return <div className={`nav-item ${examSkill ? `nav-exam-item nav-exam-${skill}` : ""}`} key={href}>
                  <Link
                    href={practiceLinks && !examSkill && skill !== "grammar" ? `${href}#che-do-hoc` : href}
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
                    {!examSkill && <Link href={skill === "vocabulary" || skill === "grammar" ? href : `${href}#che-do-hoc`} className="nav-submenu-link" onClick={() => setMenuOpen(false)}>{skill === "vocabulary" ? "Hôm nay" : skill === "grammar" ? "Lộ trình học" : "Tất cả chế độ"}</Link>}
                    {practiceLinks.filter((practice) => !lockedLearnerPath(practice.href)).map((practice) => {
                      const target = new URL(practice.href, "https://ieltswithharry.local");
                      const selected = examSkill
                        ? target.pathname !== href ? pathname === target.pathname : pathname === target.pathname && currentType === target.searchParams.get("type") && (searchParams.get("part") ?? "") === (target.searchParams.get("part") ?? "")
                        : pathname === target.pathname && (!target.search || searchParams.get("collection") === target.searchParams.get("collection"));
                      // Writing's tasks sit under "Bài lẻ" with their own type, so any Writing task lights the parent.
                      const parentSelected = examSkill && practice.kind === "parent" && pathname === target.pathname && (skill === "writing" || currentType === target.searchParams.get("type"));
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
      {!learningRoute && <NotebookWidget />}
    </div>
  );
}
