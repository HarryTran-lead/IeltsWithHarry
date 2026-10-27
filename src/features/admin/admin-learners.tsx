"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, BellRing, CalendarPlus, ChevronLeft, ChevronRight, Flame, MessageCircleOff, Plus, Search, ShieldCheck, Target, Trash2, Unlock, UserRound } from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { ActivityHeatmap } from "@/components/account/activity-heatmap";
import { activeUntil, activityLabels, untilLabel, type LearnerOverview } from "@/lib/account";
import { createClient } from "@/lib/supabase/browser";
import "./admin-learners.css";

type Row = { id: string; email: string; display_name: string; avatar: string; created_at: string; last_sign_in_at: string | null; last_active: string | null;
  active_days_30: number; streak: number; attempts: number; is_admin: boolean; suspended_until: string | null; chat_muted_until: string | null; total_count: number };
type Detail = LearnerOverview & { account: { email: string; createdAt: string; lastSignInAt: string | null; isAdmin: boolean };
  audit: { action: string; details: Record<string, unknown>; at: string; admin: string }[] };

const PAGE = 50;
const skills = ["Reading", "Listening", "Writing", "Speaking", "Vocabulary", "Grammar", "Review"];
const suspendDurations = [["1", "1 ngày"], ["3", "3 ngày"], ["7", "7 ngày"], ["30", "30 ngày"], ["forever", "Vĩnh viễn"]] as const;
const muteDurations = [["0.0417", "1 giờ"], ["1", "24 giờ"], ["7", "7 ngày"], ["30", "30 ngày"], ["forever", "Vĩnh viễn"]] as const;
const actionLabels: Record<string, string> = {
  create_user: "Tạo tài khoản",
  suspend: "Khóa tài khoản", unsuspend: "Mở khóa tài khoản", mute_chat: "Cấm chat", unmute_chat: "Bỏ cấm chat", grant_admin: "Cấp quyền admin",
  revoke_admin: "Thu quyền admin", notify: "Gửi thông báo", broadcast: "Thông báo cả lớp", assign_task: "Giao nhiệm vụ", set_goal: "Đặt mục tiêu ngày",
};

function until(days: string) { return days === "forever" ? "infinity" : new Date(Date.now() + Number(days) * 86400000).toISOString(); }
function date(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}
function tomorrow() { const day = new Date(); day.setDate(day.getDate() + 1); return day.toLocaleDateString("sv-SE"); }
function Avatar({ name, size = 34 }: { name: string; size?: number }) { return <span className="learner-avatar"><AccountAvatar value={name} size={size} /></span>; }
function StatusChips({ isAdmin, suspended, muted }: { isAdmin: boolean; suspended: string | null; muted: string | null }) {
  return <span className="learner-chips">
    {isAdmin && <span className="chip admin"><ShieldCheck size={12} /> Admin</span>}
    {activeUntil(suspended) && <span className="chip suspended"><Ban size={12} /> Đang khóa</span>}
    {activeUntil(muted) && <span className="chip muted"><MessageCircleOff size={12} /> Cấm chat</span>}
  </span>;
}

/** Runs an admin RPC and reports the outcome in plain words. */
function useAction(onDone: () => Promise<void> | void) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async (key: string, done: string, action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(key); setMessage(null);
    const { error } = await action();
    setBusy("");
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: done });
    if (!error) await onDone();
  }, [onDone]);
  return { busy, message, run };
}

export function AdminLearners() {
  const db = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    let active = true;
    void db.rpc("admin_list_learners", { p_search: search, p_limit: PAGE, p_offset: page * PAGE }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(loadError.message); else { setError(""); setRows(data as Row[]); }
    });
    return () => { active = false; };
  }, [db, search, page, refresh]);

  const [{ today, weekAgo }] = useState(() => ({
    today: new Date().toLocaleDateString("sv-SE"),
    weekAgo: new Date(Date.now() - 6 * 86400000).toLocaleDateString("sv-SE"),
  }));
  const total = rows?.[0]?.total_count ?? 0;
  const list = (rows ?? []).filter((row) => filter === "all" ? true : filter === "active" ? (row.last_active ?? "") >= weekAgo
    : filter === "inactive" ? (row.last_active ?? "") < weekAgo : filter === "suspended" ? activeUntil(row.suspended_until)
    : filter === "muted" ? activeUntil(row.chat_muted_until) : row.is_admin);
  const tiles = [
    { label: "Tài khoản", value: total, icon: UserRound },
    { label: "Học hôm nay", value: (rows ?? []).filter((row) => row.last_active === today).length, icon: Flame },
    { label: "Học trong 7 ngày", value: (rows ?? []).filter((row) => (row.last_active ?? "") >= weekAgo).length, icon: CalendarPlus },
    { label: "Đang khóa / cấm chat", value: (rows ?? []).filter((row) => activeUntil(row.suspended_until) || activeUntil(row.chat_muted_until)).length, icon: Ban },
  ];

  return <div className="learners">
    <AdminCreateUser onCreated={() => { setPage(0); setSearch(""); setQuery(""); setRefresh((value) => value + 1); }} />
    <div className="learner-tiles">{tiles.map(({ label, value, icon: Icon }) => <div key={label} className="card learner-tile"><Icon size={18} /><strong>{rows ? value : "…"}</strong><span>{label}</span></div>)}</div>
    {total > PAGE && <p className="learner-note">Số liệu hoạt động tính trên {PAGE} tài khoản của trang này.</p>}
    <section className="card learner-table-card">
      <div className="learner-toolbar">
        <label className="learner-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc email…" aria-label="Tìm học viên" /></label>
        <div className="learner-filters" role="group" aria-label="Lọc">
          {[["all", "Tất cả"], ["active", "Học 7 ngày qua"], ["inactive", "Lâu không học"], ["suspended", "Đang khóa"], ["muted", "Cấm chat"], ["admin", "Admin"]].map(([id, label]) =>
            <button key={id} type="button" className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="learner-table-wrap">
        <table className="learner-table">
          <thead><tr><th>Học viên</th><th>Tham gia</th><th>Học gần nhất</th><th>Streak</th><th>30 ngày</th><th>Bài đã làm</th><th>Trạng thái</th><th aria-label="Mở" /></tr></thead>
          <tbody>
            {!rows ? <tr><td colSpan={8}><span className="skeleton learner-skeleton" /></td></tr>
              : list.length === 0 ? <tr><td colSpan={8} className="learner-empty">Không có học viên phù hợp.</td></tr>
              : list.map((row) => <tr key={row.id}>
                <td><Link href={`/admin/users/${row.id}`} className="learner-cell"><Avatar name={row.avatar} /><span><strong>{row.display_name}</strong><small>{row.email}</small></span></Link></td>
                <td>{date(row.created_at)}</td>
                <td className={(row.last_active ?? "") < weekAgo ? "is-stale" : ""}>{row.last_active ? (row.last_active === today ? "Hôm nay" : date(row.last_active)) : "Chưa học"}</td>
                <td><span className={`learner-streak ${row.streak ? "lit" : ""}`}><Flame size={14} /> {row.streak}</span></td>
                <td><span className="learner-days"><i style={{ width: `${Math.min(100, (row.active_days_30 / 30) * 100)}%` }} />{row.active_days_30}/30</span></td>
                <td>{row.attempts}</td>
                <td><StatusChips isAdmin={row.is_admin} suspended={row.suspended_until} muted={row.chat_muted_until} /></td>
                <td><Link href={`/admin/users/${row.id}`} className="learner-open" aria-label={`Quản lý ${row.display_name}`}><ChevronRight size={18} /></Link></td>
              </tr>)}
          </tbody>
        </table>
      </div>
      {total > PAGE && <div className="learner-pager">
        <button type="button" className="button subtle" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Trước</button>
        <span>Trang {page + 1}/{Math.ceil(total / PAGE)}</span>
        <button type="button" className="button subtle" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Sau <ChevronRight size={16} /></button>
      </div>}
    </section>
  </div>;
}

function AdminCreateUser({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; email: string; name: string; password: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setCreated(null);
    try {
      const response = await fetch("/api/admin/users", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không tạo được tài khoản.");
      setCreated(result); setName(""); setEmail(""); onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được tài khoản."); }
    finally { setBusy(false); }
  }

  return <section className="card learner-create-card">
    <div><h2>Tạo tài khoản học viên</h2><p>Admin tạo tài khoản để học viên đăng nhập ngay. Hệ thống tạo mật khẩu mạnh và chỉ hiển thị một lần.</p></div>
    <button type="button" className="button primary" onClick={() => { setOpen((value) => !value); setCreated(null); setError(""); }}><Plus size={16} /> {open ? "Đóng form" : "Tạo tài khoản"}</button>
    {open && <form onSubmit={(event) => void submit(event)} className="learner-create-form">
      <label>Họ và tên<input required minLength={2} maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Email đăng nhập<input required type="email" maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button type="submit" className="button primary" disabled={busy}>{busy ? "Đang tạo…" : "Tạo học viên"}</button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {created && <div className="learner-created" role="status"><strong>Đã tạo tài khoản cho {created.name}</strong><p>Email: {created.email}</p>
      <label>Mật khẩu ban đầu (chỉ hiện ở đây)<input readOnly value={created.password} onFocus={(event) => event.target.select()} /></label>
      <div><button type="button" className="button subtle" onClick={() => void navigator.clipboard.writeText(`${created.email}\n${created.password}`)}>Sao chép thông tin đăng nhập</button>
        <Link className="button subtle" href={`/admin/users/${created.id}`}>Mở hồ sơ</Link></div>
      <small>Gửi mật khẩu riêng cho học viên qua kênh an toàn. Đóng form hoặc rời trang sẽ không xem lại được mật khẩu này.</small>
    </div>}
  </section>;
}

export function AdminLearnerDetail({ id }: { id: string }) {
  const db = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: loadError } = await db.rpc("admin_learner_detail", { p_user: id });
    if (loadError) setError(loadError.message); else setDetail(data as Detail);
  }, [db, id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const { busy, message, run } = useAction(load);
  const [suspendFor, setSuspendFor] = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [muteFor, setMuteFor] = useState("1");
  const [muteReason, setMuteReason] = useState("");
  const [task, setTask] = useState({ title: "", skill: "Reading", due: tomorrow(), priority: "Medium" });
  const [goal, setGoal] = useState<number | null>(null);
  const [note, setNote] = useState({ title: "", body: "", link: "" });

  if (error) return <div className="learners"><Link href="/admin/users" className="learner-back"><ArrowLeft size={16} /> Danh sách học viên</Link><p className="form-error" role="alert">{error}</p></div>;
  if (!detail) return <div className="learners" aria-busy="true"><span className="skeleton learner-skeleton tall" /></div>;
  const { profile, account, controls, streak, stats } = detail;
  const suspended = activeUntil(controls?.suspendedUntil);
  const muted = activeUntil(controls?.chatMutedUntil);
  const setControls = (patch: { suspended?: string | null; suspendedReason?: string; muted?: string | null; mutedReason?: string }) => db.rpc("admin_set_account_controls", {
    p_user: id,
    p_suspended_until: "suspended" in patch ? patch.suspended : suspended ? controls?.suspendedUntil : null,
    p_suspended_reason: patch.suspendedReason ?? (suspended ? controls?.suspendedReason : "") ?? "",
    p_chat_muted_until: "muted" in patch ? patch.muted : muted ? controls?.chatMutedUntil : null,
    p_chat_muted_reason: patch.mutedReason ?? (muted ? controls?.chatMutedReason : "") ?? "",
  });
  const tiles = [
    ["Streak", `${streak.current} ngày`, `Kỷ lục ${streak.longest}`], ["Ngày có học", streak.totalDays, ""],
    ["Bài học", stats.lessons, stats.lessonScore !== null ? `Đúng ${stats.lessonScore}%` : ""], ["Quiz báo", stats.newsQuizzes, stats.newsScore !== null ? `Đúng ${stats.newsScore}%` : ""],
    ["Báo đã đọc", stats.newsRead, ""], ["Từ đã lưu", stats.words, ""], ["Nhiệm vụ", `${stats.tasksDone} xong`, `${stats.tasksOpen} đang chờ`], ["Tin nhắn", stats.messages, ""],
  ] as const;

  return <div className="learners learner-detail">
    <Link href="/admin/users" className="learner-back"><ArrowLeft size={16} /> Danh sách học viên</Link>
    <section className="card learner-hero">
      <Avatar name={profile.avatar} size={64} />
      <div>
        <h2>{profile.display_name} <StatusChips isAdmin={account.isAdmin} suspended={controls?.suspendedUntil ?? null} muted={controls?.chatMutedUntil ?? null} /></h2>
        <p>{account.email} · Tham gia {date(account.createdAt)} · Đăng nhập gần nhất {date(account.lastSignInAt, true)}</p>
        <p className="learner-goals">{profile.target_band ? `Mục tiêu band ${Number(profile.target_band).toFixed(1)}` : "Chưa đặt band mục tiêu"}{profile.exam_date && ` · Thi ${date(profile.exam_date)}`} · {profile.daily_goal} nhiệm vụ/ngày · {profile.timezone}</p>
        {profile.bio && <p className="learner-bio">“{profile.bio}”</p>}
      </div>
    </section>
    {message && <p className={message.ok ? "learner-message ok" : "form-error"} role="status">{message.text}</p>}

    <div className="learner-detail-grid">
      <div className="learner-main">
        <div className="learner-stats">{tiles.map(([label, value, hint]) => <div key={label} className="card"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>)}</div>
        <section className="card section-card"><div className="section-head"><h2>Lịch học</h2><span>{streak.activeToday ? "Hôm nay đã học" : "Hôm nay chưa học"}</span></div><ActivityHeatmap days={streak.days} today={streak.today} /></section>
        <section className="card section-card">
          <div className="section-head"><h2>Hoạt động gần đây</h2><span>{detail.timeline.length} mục mới nhất</span></div>
          {detail.timeline.length ? <ol className="learner-timeline">{detail.timeline.map((item, index) => <li key={`${item.at}-${index}`}>
            <small>{date(item.at, true)}</small><span>{activityLabels[item.kind] ?? item.kind}</span><strong>{item.title}</strong>{item.total ? <b>{item.score}/{item.total}</b> : <i />}
          </li>)}</ol> : <p className="learner-empty">Chưa có hoạt động nào.</p>}
        </section>
        <section className="card section-card">
          <div className="section-head"><h2>Nhiệm vụ đang chờ</h2><span>{detail.openTasks.length} việc</span></div>
          {detail.openTasks.length ? <ul className="learner-tasks">{detail.openTasks.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{item.skill} · hạn {date(item.due)}{item.assigned && " · admin giao"}</small></li>)}</ul> : <p className="learner-empty">Không có nhiệm vụ đang chờ.</p>}
        </section>
      </div>

      <aside className="learner-controls">
        <section className={`card control-card ${suspended ? "is-on danger" : ""}`}>
          <h3><Ban size={17} /> Khóa tài khoản</h3>
          {suspended ? <>
            <p>Đang khóa {untilLabel(controls?.suspendedUntil)}.{controls?.suspendedReason && <> Lý do: {controls.suspendedReason}</>}</p>
            <button type="button" className="button primary" disabled={!!busy} onClick={() => void run("suspend", "Đã mở khóa tài khoản.", () => setControls({ suspended: null, suspendedReason: "" }))}><Unlock size={15} /> Mở khóa</button>
          </> : <form onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Khóa tài khoản ${profile.display_name}? Học viên sẽ không vào được trang học.`)) void run("suspend", "Đã khóa tài khoản.", () => setControls({ suspended: until(suspendFor), suspendedReason: suspendReason })); }}>
            <p>Học viên bị khóa không vào được trang học và không chat được.</p>
            <select value={suspendFor} onChange={(event) => setSuspendFor(event.target.value)} aria-label="Thời hạn khóa">{suspendDurations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input value={suspendReason} maxLength={300} onChange={(event) => setSuspendReason(event.target.value)} placeholder="Lý do (học viên sẽ thấy)" />
            <button type="submit" className="button danger" disabled={!!busy || account.isAdmin}>Khóa tài khoản</button>
            {account.isAdmin && <small>Thu quyền admin trước khi khóa tài khoản này.</small>}
          </form>}
        </section>

        <section className={`card control-card ${muted ? "is-on" : ""}`}>
          <h3><MessageCircleOff size={17} /> Cấm chat phòng học</h3>
          {muted ? <>
            <p>Đang cấm chat {untilLabel(controls?.chatMutedUntil)}.{controls?.chatMutedReason && <> Lý do: {controls.chatMutedReason}</>}</p>
            <button type="button" className="button primary" disabled={!!busy} onClick={() => void run("mute", "Đã bỏ cấm chat.", () => setControls({ muted: null, mutedReason: "" }))}>Bỏ cấm chat</button>
          </> : <form onSubmit={(event) => { event.preventDefault(); void run("mute", "Đã cấm chat và báo cho học viên.", () => setControls({ muted: until(muteFor), mutedReason: muteReason })); }}>
            <p>Vẫn học được bình thường, chỉ không gửi được tin nhắn.</p>
            <select value={muteFor} onChange={(event) => setMuteFor(event.target.value)} aria-label="Thời hạn cấm chat">{muteDurations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input value={muteReason} maxLength={300} onChange={(event) => setMuteReason(event.target.value)} placeholder="Lý do (học viên sẽ thấy)" />
            <button type="submit" className="button subtle" disabled={!!busy}>Cấm chat</button>
          </form>}
        </section>

        <section className="card control-card">
          <h3><CalendarPlus size={17} /> Giao nhiệm vụ</h3>
          <form onSubmit={(event) => { event.preventDefault(); void run("task", "Đã giao nhiệm vụ và gửi thông báo.", () => db.rpc("admin_assign_task", { p_users: [id], p_title: task.title, p_skill: task.skill, p_due: task.due, p_priority: task.priority })).then(() => setTask((current) => ({ ...current, title: "" }))); }}>
            <input value={task.title} maxLength={100} required onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="Ví dụ: Làm 1 quiz Daily News" />
            <div className="control-row">
              <select value={task.skill} onChange={(event) => setTask({ ...task, skill: event.target.value })} aria-label="Kỹ năng">{skills.map((skill) => <option key={skill}>{skill}</option>)}</select>
              <select value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value })} aria-label="Mức ưu tiên"><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option></select>
            </div>
            <input type="date" value={task.due} required onChange={(event) => setTask({ ...task, due: event.target.value })} aria-label="Hạn" />
            <button type="submit" className="button primary" disabled={!!busy || !task.title.trim()}>Giao nhiệm vụ</button>
          </form>
        </section>

        <section className="card control-card">
          <h3><Target size={17} /> Mục tiêu mỗi ngày</h3>
          <form className="control-row" onSubmit={(event) => { event.preventDefault(); void run("goal", "Đã đặt mục tiêu ngày.", () => db.rpc("admin_set_daily_goal", { p_users: [id], p_goal: goal ?? profile.daily_goal })); }}>
            <input type="number" min={1} max={20} value={goal ?? profile.daily_goal} onChange={(event) => setGoal(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} aria-label="Số nhiệm vụ mỗi ngày" />
            <button type="submit" className="button subtle" disabled={!!busy}>Lưu</button>
          </form>
        </section>

        <section className="card control-card">
          <h3><BellRing size={17} /> Gửi thông báo riêng</h3>
          <form onSubmit={(event) => { event.preventDefault(); void run("note", "Đã gửi thông báo.", () => db.rpc("admin_send_notification", { p_users: [id], p_title: note.title, p_body: note.body, p_link: note.link })).then(() => setNote({ title: "", body: "", link: "" })); }}>
            <input value={note.title} maxLength={120} required onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Tiêu đề" />
            <textarea value={note.body} maxLength={1000} rows={3} onChange={(event) => setNote({ ...note, body: event.target.value })} placeholder="Nội dung" />
            <input value={note.link} onChange={(event) => setNote({ ...note, link: event.target.value })} placeholder="Đường dẫn trong web, ví dụ /app/news" pattern="/[A-Za-z0-9/_?=&#.\-]*" />
            <button type="submit" className="button subtle" disabled={!!busy || !note.title.trim()}>Gửi</button>
          </form>
        </section>

        <section className="card control-card">
          <h3><ShieldCheck size={17} /> Quyền admin</h3>
          <p>{account.isAdmin ? "Tài khoản này đang có quyền quản trị." : "Tài khoản học viên thường."}</p>
          <button type="button" className={account.isAdmin ? "button subtle" : "button subtle"} disabled={!!busy}
            onClick={() => { if (window.confirm(account.isAdmin ? "Thu quyền admin của tài khoản này?" : "Cấp quyền admin cho tài khoản này? Họ sẽ sửa được toàn bộ nội dung và tài khoản.")) void run("admin", account.isAdmin ? "Đã thu quyền admin." : "Đã cấp quyền admin.", () => db.rpc("admin_set_admin", { p_user: id, p_admin: !account.isAdmin })); }}>
            {account.isAdmin ? "Thu quyền admin" : "Cấp quyền admin"}
          </button>
        </section>

        <section className="card control-card">
          <h3>Nhật ký admin</h3>
          {detail.audit.length ? <ul className="audit-list">{detail.audit.map((entry, index) => <li key={index}><strong>{actionLabels[entry.action] ?? entry.action}</strong><small>{entry.admin} · {date(entry.at, true)}</small>{typeof entry.details.reason === "string" && entry.details.reason && <span>“{entry.details.reason}”</span>}{typeof entry.details.title === "string" && <span>{entry.details.title}</span>}</li>)}</ul> : <p>Chưa có thao tác nào.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

type Sent = { id: string; user_id: string | null; kind: string; title: string; body: string; created_at: string };

export function AdminBroadcast() {
  const db = useMemo(() => createClient(), []);
  const [sent, setSent] = useState<Sent[]>([]);
  const load = useCallback(async () => {
    const { data } = await db.from("user_notifications").select("id,user_id,kind,title,body,created_at").order("created_at", { ascending: false }).limit(40);
    setSent((data ?? []) as Sent[]);
  }, [db]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const { busy, message, run } = useAction(load);
  const [note, setNote] = useState({ title: "", body: "", link: "" });
  const [task, setTask] = useState({ title: "", skill: "Reading", due: tomorrow(), priority: "Medium" });
  const [goal, setGoal] = useState(5);

  return <div className="learners broadcast">
    {message && <p className={message.ok ? "learner-message ok" : "form-error"} role="status">{message.text}</p>}
    <div className="broadcast-grid">
      <section className="card control-card">
        <h3><BellRing size={17} /> Thông báo cho tất cả học viên</h3>
        <form onSubmit={(event) => { event.preventDefault(); if (window.confirm("Gửi thông báo này tới tất cả học viên?")) void run("note", "Đã gửi thông báo tới cả lớp.", () => db.rpc("admin_send_notification", { p_users: null, p_title: note.title, p_body: note.body, p_link: note.link })).then(() => setNote({ title: "", body: "", link: "" })); }}>
          <input value={note.title} maxLength={120} required onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Tiêu đề, ví dụ: Tuần này học Unit 3" />
          <textarea value={note.body} maxLength={1000} rows={4} onChange={(event) => setNote({ ...note, body: event.target.value })} placeholder="Nội dung" />
          <input value={note.link} onChange={(event) => setNote({ ...note, link: event.target.value })} placeholder="Đường dẫn, ví dụ /app/learn/ielts-starter" pattern="/[A-Za-z0-9/_?=&#.\-]*" />
          <button type="submit" className="button primary" disabled={!!busy || !note.title.trim()}>Gửi cho cả lớp</button>
        </form>
      </section>
      <section className="card control-card">
        <h3><CalendarPlus size={17} /> Giao nhiệm vụ cho cả lớp</h3>
        <form onSubmit={(event) => { event.preventDefault(); if (window.confirm("Giao nhiệm vụ này vào Planner của tất cả học viên?")) void run("task", "Đã giao nhiệm vụ cho cả lớp.", () => db.rpc("admin_assign_task", { p_users: null, p_title: task.title, p_skill: task.skill, p_due: task.due, p_priority: task.priority })).then(() => setTask((current) => ({ ...current, title: "" }))); }}>
          <input value={task.title} maxLength={100} required onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="Ví dụ: Hoàn thành Unit 2 · Reading" />
          <div className="control-row">
            <select value={task.skill} onChange={(event) => setTask({ ...task, skill: event.target.value })} aria-label="Kỹ năng">{skills.map((skill) => <option key={skill}>{skill}</option>)}</select>
            <select value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value })} aria-label="Mức ưu tiên"><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option></select>
          </div>
          <input type="date" value={task.due} required onChange={(event) => setTask({ ...task, due: event.target.value })} aria-label="Hạn" />
          <button type="submit" className="button primary" disabled={!!busy || !task.title.trim()}>Giao cho cả lớp</button>
        </form>
      </section>
      <section className="card control-card">
        <h3><Target size={17} /> Mục tiêu ngày cho cả lớp</h3>
        <p>Đặt lại số nhiệm vụ mỗi ngày cho mọi học viên (không áp dụng cho admin).</p>
        <form className="control-row" onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Đặt mục tiêu ${goal} nhiệm vụ/ngày cho tất cả học viên?`)) void run("goal", "Đã đặt mục tiêu ngày cho cả lớp.", () => db.rpc("admin_set_daily_goal", { p_users: null, p_goal: goal })); }}>
          <input type="number" min={1} max={20} value={goal} onChange={(event) => setGoal(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} aria-label="Số nhiệm vụ mỗi ngày" />
          <button type="submit" className="button subtle" disabled={!!busy}>Áp dụng</button>
        </form>
      </section>
    </div>
    <section className="card section-card">
      <div className="section-head"><h2>Thông báo đã gửi</h2><span>40 thông báo mới nhất</span></div>
      {sent.length ? <ul className="sent-list">{sent.map((item) => <li key={item.id}>
        <span className={`chip ${item.user_id ? "" : "admin"}`}>{item.user_id ? "1 học viên" : "Cả lớp"}</span>
        <div><strong>{item.title}</strong>{item.body && <small>{item.body}</small>}</div>
        <time>{date(item.created_at, true)}</time>
        <button type="button" className="icon-button" aria-label="Xóa thông báo" disabled={!!busy} onClick={() => { if (window.confirm("Xóa thông báo này? Học viên sẽ không thấy nữa.")) void run("delete", "Đã xóa thông báo.", () => db.from("user_notifications").delete().eq("id", item.id)); }}><Trash2 size={15} /></button>
      </li>)}</ul> : <p className="learner-empty">Chưa gửi thông báo nào.</p>}
    </section>
  </div>;
}

type AuditRow = { id: number; admin_id: string | null; target_user: string | null; action: string; details: Record<string, unknown>; created_at: string };

export function AdminAudit() {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void (async () => {
      const { data } = await db.from("admin_audit_log").select("id,admin_id,target_user,action,details,created_at").order("created_at", { ascending: false }).limit(150);
      const list = (data ?? []) as AuditRow[];
      const ids = [...new Set(list.flatMap((row) => [row.admin_id, row.target_user]).filter((value): value is string => Boolean(value)))];
      const profiles = ids.length ? await db.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
      setNames(Object.fromEntries((profiles.data ?? []).map((row) => [row.id as string, row.display_name as string])));
      setRows(list);
    })();
  }, [db]);
  return <section className="card section-card learners">
    <div className="section-head"><h2>Nhật ký thao tác admin</h2><span>150 thao tác mới nhất trên tài khoản học viên</span></div>
    {!rows ? <span className="skeleton learner-skeleton" /> : rows.length === 0 ? <p className="learner-empty">Chưa có thao tác nào.</p> :
      <div className="learner-table-wrap"><table className="learner-table audit-table">
        <thead><tr><th>Thời gian</th><th>Admin</th><th>Thao tác</th><th>Học viên</th><th>Chi tiết</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{date(row.created_at, true)}</td>
          <td>{row.admin_id ? names[row.admin_id] ?? "Admin" : "—"}</td>
          <td><strong>{actionLabels[row.action] ?? row.action}</strong></td>
          <td>{row.target_user ? <Link href={`/admin/users/${row.target_user}`}>{names[row.target_user] ?? "Học viên"}</Link> : "Cả lớp"}</td>
          <td className="audit-details">{[row.details.title, row.details.reason, row.details.goal && `${row.details.goal} nhiệm vụ/ngày`, row.details.until && untilLabel(String(row.details.until))].filter(Boolean).join(" · ")}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
