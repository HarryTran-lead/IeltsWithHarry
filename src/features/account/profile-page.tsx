"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenText, CalendarClock, CalendarDays, Check, Clock3, Flame, Languages, MessageCircleOff, Newspaper, Save, Target, Trophy } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { ActivityHeatmap } from "@/components/account/activity-heatmap";
import { activeUntil, activityLabels, avatarStickers, isAvatar, untilLabel, type LearnerOverview } from "@/lib/account";
import { stages } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { celebrate } from "@/lib/celebrate";
import "./profile.css";

const bands = ["", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"];
const zones = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];

function dateLabel(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value)); }
function ago(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes || 1} phút trước` : minutes < 1440 ? `${Math.floor(minutes / 60)} giờ trước` : `${Math.floor(minutes / 1440)} ngày trước`;
}

/** Badges earned from saved activity, so they mean the same thing everywhere. */
function badges(data: LearnerOverview) {
  const { streak, stats } = data;
  return [
    { sticker: "flame", label: "Chuỗi 3 ngày", detail: "Học 3 ngày liên tiếp", earned: streak.longest >= 3 },
    { sticker: "rocket", label: "Chuỗi 7 ngày", detail: "Học 7 ngày liên tiếp", earned: streak.longest >= 7 },
    { sticker: "book", label: "Chăm làm bài", detail: "Nộp 10 bài học", earned: stats.lessons >= 10 },
    { sticker: "newspaper", label: "Mọt báo", detail: "Làm 10 quiz Daily News", earned: stats.newsQuizzes >= 10 },
    { sticker: "abc", label: "Kho từ 50", detail: "Lưu 50 từ mới", earned: stats.words >= 50 },
    { sticker: "mountain", label: "30 ngày học", detail: "Có 30 ngày hoạt động", earned: streak.totalDays >= 30 },
  ] satisfies { sticker: StickerName; label: string; detail: string; earned: boolean }[];
}

export function ProfilePage() {
  const db = useMemo(() => (demoMode ? null : createClient()), []);
  const [data, setData] = useState<LearnerOverview | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!db) return;
    const [overview, user] = await Promise.all([db.rpc("learner_overview"), db.auth.getUser()]);
    if (overview.error) setError(overview.error.message); else setData(overview.data as LearnerOverview);
    setEmail(user.data.user?.email ?? "");
  }, [db]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (demoMode) return <div className="content-page"><section className="card section-card profile-demo"><Sticker name="harry" size={72} /><div><h1>Hồ sơ học viên</h1><p>Hồ sơ, chuỗi ngày học và lịch hoạt động được lưu với tài khoản thật. Hãy đăng nhập bằng tài khoản học viên để xem.</p></div></section></div>;
  if (error) return <div className="content-page"><p className="form-error" role="alert">Không tải được hồ sơ: {error}</p></div>;
  if (!data) return <div className="content-page profile-page" aria-busy="true"><span className="skeleton profile-skeleton" /><span className="skeleton profile-skeleton short" /></div>;

  const { profile, streak, stats, controls } = data;
  const stage = stages.find((item) => item.id === profile.stage_id);
  // Counted from the learner's local "today" that the server already worked out.
  const daysToExam = profile.exam_date ? Math.round((Date.parse(`${profile.exam_date}T00:00:00Z`) - Date.parse(`${streak.today}T00:00:00Z`)) / 86400000) : null;
  const muted = activeUntil(controls?.chatMutedUntil);
  const tiles = [
    { icon: BookOpenText, tone: "teal", value: stats.lessons, label: "Bài học đã nộp", note: stats.lessonScore !== null ? `Đúng ${stats.lessonScore}%` : "" },
    { icon: Newspaper, tone: "sky", value: stats.newsQuizzes, label: "Quiz Daily News", note: stats.newsScore !== null ? `Đúng ${stats.newsScore}%` : "" },
    { icon: BookOpenText, tone: "coral", value: stats.newsRead, label: "Bài báo đã đọc", note: "" },
    { icon: Languages, tone: "mint", value: stats.words, label: "Từ đã lưu", note: "" },
    { icon: Check, tone: "lavender", value: stats.tasksDone, label: "Nhiệm vụ xong", note: stats.tasksOpen ? `${stats.tasksOpen} đang chờ` : "" },
    { icon: CalendarDays, tone: "sun", value: streak.totalDays, label: "Ngày có học", note: "" },
  ] as const;

  return <div className="content-page profile-page">
    <section className="card profile-hero">
      <div className="profile-avatar"><Sticker name={isAvatar(profile.avatar) ? profile.avatar : "harry"} size={84} tilt={-6} /></div>
      <div className="profile-id">
        <span className="eyebrow">HỒ SƠ HỌC VIÊN</span>
        <h1>{profile.display_name}</h1>
        <p>{email} · Tham gia {dateLabel(profile.created_at)}</p>
        <div className="profile-chips">
          {profile.target_band && <span className="chip-target"><Target size={14} /> Mục tiêu {Number(profile.target_band).toFixed(1)}</span>}
          {stage && <span><Trophy size={14} /> {stage.name} · {stage.range}</span>}
          {daysToExam !== null && <span className={daysToExam <= 30 ? "chip-soon" : ""}><CalendarClock size={14} /> {daysToExam > 0 ? `Còn ${daysToExam} ngày tới kỳ thi` : daysToExam === 0 ? "Hôm nay thi!" : `Đã thi ${dateLabel(profile.exam_date!)}`}</span>}
          <span><Clock3 size={14} /> Mục tiêu {profile.daily_goal} nhiệm vụ/ngày</span>
        </div>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </div>
      <div className={`profile-streak ${streak.activeToday ? "is-lit" : ""}`}>
        <Flame size={30} />
        <strong>{streak.current}</strong>
        <span>ngày liên tiếp</span>
        <small>{streak.activeToday ? "Hôm nay đã học ✓" : streak.current ? "Học hôm nay để giữ chuỗi!" : "Bắt đầu chuỗi mới hôm nay"}</small>
        <small>Kỷ lục: {streak.longest} ngày</small>
      </div>
    </section>

    {muted && <p className="profile-notice" role="status"><MessageCircleOff size={18} /> Bạn đang bị tạm cấm chat trong phòng cùng học {untilLabel(controls?.chatMutedUntil)}.{controls?.chatMutedReason && ` Lý do: ${controls.chatMutedReason}`}</p>}

    <div className="profile-stats">{tiles.map((tile) => <div key={tile.label} className="card profile-stat">
      <HeadIcon icon={tile.icon} tone={tile.tone} />
      <strong>{tile.value}</strong><span>{tile.label}</span>{tile.note && <small>{tile.note}</small>}
    </div>)}</div>

    <div className="profile-columns">
      <section className="card section-card">
        <div className="section-head"><h2>Lịch học 18 tuần</h2><span>Một ô là một ngày; ngày có làm bài, đọc báo, lưu từ, xong nhiệm vụ hoặc học trong phòng cùng học được tính vào chuỗi.</span></div>
        <ActivityHeatmap days={streak.days} today={streak.today} />
        <div className="profile-badges">{badges(data).map((badge) => <div key={badge.label} className={`profile-badge ${badge.earned ? "" : "locked"}`} title={badge.detail}>
          <Sticker name={badge.earned ? badge.sticker : "lock"} size={40} pop={false} /><strong>{badge.label}</strong><small>{badge.detail}</small>
        </div>)}</div>
      </section>
      <section className="card section-card">
        <div className="section-head"><h2>Nhiệm vụ đang chờ</h2><Link href="/app/planner" className="text-link">Mở Planner</Link></div>
        {data.openTasks.length ? <ul className="profile-tasks">{data.openTasks.map((task) => <li key={task.id}>
          <span>{task.title}{task.assigned && <em>Harry giao</em>}</span><small>{task.skill} · hạn {dateLabel(task.due)}</small>
        </li>)}</ul> : <p className="profile-empty">Không còn nhiệm vụ nào. Thêm một việc nhỏ trong Planner nhé!</p>}
      </section>
    </div>

    <section className="card section-card">
      <div className="section-head"><h2>Hoạt động gần đây</h2><span>Kết quả được lưu với tài khoản của bạn.</span></div>
      {data.timeline.length ? <ol className="profile-timeline">{data.timeline.slice(0, 12).map((item, index) => <li key={`${item.at}-${index}`}>
        <i className={`dot ${item.kind}`} aria-hidden="true" />
        <div><small>{activityLabels[item.kind] ?? item.kind} · {ago(item.at)}</small>
          {item.link ? <Link href={item.link}>{item.title}</Link> : <strong>{item.title}</strong>}</div>
        {item.total ? <b className="profile-score">{item.score}/{item.total}</b> : null}
      </li>)}</ol> : <p className="profile-empty">Chưa có hoạt động nào. Làm một bài học hoặc đọc một bài Daily News để bắt đầu.</p>}
    </section>

    <ProfileForm data={data} onSaved={load} />
  </div>;
}

function ProfileForm({ data, onSaved }: { data: LearnerOverview; onSaved: () => Promise<void> }) {
  const { profile } = data;
  const [form, setForm] = useState({
    display_name: profile.display_name, bio: profile.bio, avatar: isAvatar(profile.avatar) ? profile.avatar : "harry",
    target_band: profile.target_band ? Number(profile.target_band).toFixed(1) : "", exam_date: profile.exam_date ?? "",
    stage_id: profile.stage_id ?? "", daily_goal: profile.daily_goal, timezone: profile.timezone,
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm((current) => ({ ...current, [key]: value })); setStatus(""); };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!form.display_name.trim()) { setStatus("Tên hiển thị không được để trống."); return; }
    setBusy(true); setStatus("");
    const { error } = await createClient().from("profiles").update({
      display_name: form.display_name.trim().slice(0, 80), bio: form.bio.trim().slice(0, 280), avatar: form.avatar,
      target_band: form.target_band ? Number(form.target_band) : null, exam_date: form.exam_date || null,
      stage_id: form.stage_id || null, daily_goal: form.daily_goal, timezone: form.timezone, updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
    setBusy(false);
    if (error) { setStatus(error.message); return; }
    setStatus("Đã lưu hồ sơ.");
    if (submitter) celebrate(submitter, { label: "Đã lưu!", pieces: 18 });
    await onSaved();
  }
  return <section className="card section-card profile-form" id="edit">
    <div className="section-head"><h2>Chỉnh sửa hồ sơ</h2><span>Tên hiển thị dùng trong phòng cùng học.</span></div>
    <form onSubmit={(event) => void save(event)}>
      <fieldset className="profile-avatars"><legend>Ảnh đại diện</legend>
        {avatarStickers.map((name) => <label key={name} className={form.avatar === name ? "selected" : ""}>
          <input type="radio" name="avatar" value={name} checked={form.avatar === name} onChange={() => set("avatar", name)} />
          <Sticker name={name} size={44} pop={false} /><span className="sr-only">{name}</span>
        </label>)}
      </fieldset>
      <div className="profile-fields">
        <label>Tên hiển thị<input value={form.display_name} maxLength={80} onChange={(event) => set("display_name", event.target.value)} required /></label>
        <label>Band mục tiêu<select value={form.target_band} onChange={(event) => set("target_band", event.target.value)}>{bands.map((band) => <option key={band} value={band}>{band || "Chưa chọn"}</option>)}</select></label>
        <label>Ngày thi dự kiến<input type="date" value={form.exam_date} onChange={(event) => set("exam_date", event.target.value)} /></label>
        <label>Chặng đang học<select value={form.stage_id} onChange={(event) => set("stage_id", event.target.value)}><option value="">Chưa chọn</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.range} · {stage.name}</option>)}</select></label>
        <label>Mục tiêu mỗi ngày<input type="number" min={1} max={20} value={form.daily_goal} onChange={(event) => set("daily_goal", Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label>
        <label>Múi giờ<select value={form.timezone} onChange={(event) => set("timezone", event.target.value)}>{[...new Set([form.timezone, ...zones])].map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
        <label className="profile-bio-field">Giới thiệu ngắn<textarea rows={3} maxLength={280} value={form.bio} onChange={(event) => set("bio", event.target.value)} placeholder="Ví dụ: Mình cần 6.5 để du học, mạnh Reading, yếu Speaking." /><small>{form.bio.length}/280</small></label>
      </div>
      <div className="profile-form-actions">
        <button type="submit" className="button primary" disabled={busy}><Save size={16} /> {busy ? "Đang lưu…" : "Lưu hồ sơ"}</button>
        {status && <span role="status">{status}</span>}
      </div>
    </form>
  </section>;
}
