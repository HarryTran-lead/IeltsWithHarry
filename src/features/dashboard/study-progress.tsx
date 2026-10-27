"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, CalendarClock, ChevronLeft, ChevronRight, Flame, Headphones, ListChecks, Mic, PenLine, Target } from "lucide-react";
import { HeadIcon } from "@/components/ui/head-icon";
import Link from "next/link";
import { useDemo } from "@/features/demo/demo-store";
import { todayISO } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { activityLabels, type LearnerOverview } from "@/lib/account";
import {
  addMonths, asProgressSkill, bandOptions, bucketActivity, dayDiff, dayTotal, emptyDay, emptyGoals, monthWeeks, progressSkills, skillFromSlug, weekOf,
  type ActivityItem, type ProgressDay, type ProgressGoals, type ProgressReport, type ProgressSkill,
} from "@/lib/study-progress";
import "./study-progress.css";

const skillMeta: Record<ProgressSkill, { label: string; short: string; icon: typeof BookOpenText }> = {
  Reading: { label: "Reading", short: "R", icon: BookOpenText },
  Listening: { label: "Listening", short: "L", icon: Headphones },
  Writing: { label: "Writing", short: "W", icon: PenLine },
  Speaking: { label: "Speaking", short: "S", icon: Mic },
};
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const GOALS_KEY = "ieltswithharry-progress-goals-v1";
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const monthLabel = (month: string) => `Tháng ${Number(month.slice(5, 7))}, ${month.slice(0, 4)}`;

type Selection = { kind: "week"; days: string[] } | { kind: "day"; day: string };

/** Demo preview: completed planner tasks and saved exercise attempts from this browser. */
function useDemoReport(month: string): ProgressReport {
  const { tasks, attempts } = useDemo();
  const [goals, setGoals] = useState<ProgressGoals>(emptyGoals);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { const saved = JSON.parse(localStorage.getItem(GOALS_KEY) ?? "null"); if (saved) setGoals({ ...emptyGoals, ...saved }); } catch { /* storage may be blocked */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return useMemo(() => {
    const weeks = monthWeeks(month), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const items: ActivityItem[] = [
      ...tasks.filter((task) => task.completed).map((task) => ({ at: `${task.date}T12:00:00`, skill: asProgressSkill(task.skill), counted: true, minutes: 0 })),
      ...attempts.map((attempt) => ({ at: attempt.submittedAt ?? `${attempt.date}T12:00:00`, skill: skillFromSlug(attempt.lesson), counted: true, minutes: 0 })),
    ];
    return { today: todayISO(), timezone, goals, days: bucketActivity(items, weeks[0][0], weeks.at(-1)![6], timezone) };
  }, [tasks, attempts, goals, month]);
}

function useLiveReport(month: string, enabled: boolean) {
  const [reports, setReports] = useState<Record<string, ProgressReport>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || reports[month]) return;
    let active = true;
    const weeks = monthWeeks(month);
    void fetch(`/api/progress?from=${weeks[0][0]}&to=${weeks.at(-1)![6]}`).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok) { setError(response.status === 401 ? "Đăng nhập để xem tiến độ học của bạn." : body.error || "Chưa tải được tiến độ học."); return; }
      setError("");
      setReports((current) => ({ ...current, [month]: body as ProgressReport }));
    }).catch(() => { if (active) setError("Chưa tải được tiến độ học."); });
    return () => { active = false; };
  }, [enabled, month, reports]);
  return { report: reports[month] ?? null, error, setReports };
}

export function StudyProgress() {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const demo = useDemoReport(month);
  const live = useLiveReport(month, !demoMode);
  const report = demoMode ? demo : live.report;
  const today = report?.today ?? todayISO();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [goalsOverride, setGoalsOverride] = useState<ProgressGoals | null>(null);
  const [status, setStatus] = useState("");
  const [overview, setOverview] = useState<LearnerOverview | null>(null);
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    void createClient().rpc("learner_overview").then(({ data }) => { if (active && data) setOverview(data as LearnerOverview); });
    return () => { active = false; };
  }, []);
  const goals = goalsOverride ?? report?.goals ?? emptyGoals;
  const days = useMemo(() => new Map((report?.days ?? []).map((day) => [day.day, day])), [report]);
  const selected = selection ?? { kind: "week", days: weekOf(today) };

  async function saveGoals(next: ProgressGoals) {
    setGoalsOverride(next);
    setStatus("Đang lưu…");
    if (demoMode) {
      try { localStorage.setItem(GOALS_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
      setStatus("Đã lưu trên trình duyệt này");
      return;
    }
    const response = await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    if (!response?.ok) { setStatus("Chưa lưu được, thử lại nhé"); return; }
    // Keep every loaded month in step with the saved goals.
    live.setReports((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, goals: next }])));
    setStatus("Đã lưu");
  }

  const monthDays = report?.days.filter((day) => day.day.startsWith(month)) ?? [];
  const monthActive = monthDays.filter((day) => day.active).length;
  const monthExercises = monthDays.reduce((total, day) => total + dayTotal(day), 0);
  return <section className="study-progress" aria-label="Tiến độ học tập" aria-busy={!report && !live.error}>
    <div className="sp-overview" aria-label="Tổng quan tiến độ">
      <div><span>Chuỗi hiện tại</span><strong><Flame size={20} /> {demoMode ? "—" : overview?.streak.current ?? "…"}</strong><small>ngày liên tiếp</small></div>
      <div><span>Ngày học trong tháng</span><strong>{report ? monthActive : "…"}</strong><small>{monthLabel(month)}</small></div>
      <div><span>Bài đã làm trong tháng</span><strong>{report ? monthExercises : "…"}</strong><small>theo hoạt động đã lưu</small></div>
      <div><span>Tổng ngày học</span><strong>{demoMode ? "—" : overview?.streak.totalDays ?? "…"}</strong><small>từ lúc tạo tài khoản</small></div>
    </div>
    <div className="sp-grid">
    <GoalsCard goals={goals} onChange={(next) => void saveGoals(next)} status={status} />
    <ExamCard examDate={goals.examDate} today={today} onChange={(examDate) => void saveGoals({ ...goals, examDate })} />
    <ActivityCalendar month={month} today={today} days={days} selection={selected} loading={!report} error={demoMode ? "" : live.error}
      onMonth={(offset) => { setMonth((current) => addMonths(current, offset)); setSelection(null); }}
      onSelect={setSelection} />
    <WeekStats selection={selected} days={days} today={today} loading={!report} />
    {overview && <section className="card sp-card sp-recent"><div className="card-head"><div className="head-title"><HeadIcon icon={ListChecks} tone="teal" /><div><h2>Hoạt động gần đây</h2><p>{overview.stats.lessons} bài học · {overview.stats.newsQuizzes} quiz tin tức · {overview.stats.words} từ đã lưu</p></div></div><Link href="/app/profile">Xem hồ sơ</Link></div>
      {overview.timeline.length ? <ol>{overview.timeline.slice(0, 6).map((item, index) => <li key={`${item.at}-${index}`}><span>{activityLabels[item.kind] ?? item.kind}</span>{item.link ? <Link href={item.link}>{item.title}</Link> : <strong>{item.title}</strong>}<time dateTime={item.at}>{new Date(item.at).toLocaleDateString("vi-VN")}</time></li>)}</ol> : <p>Chưa có hoạt động. Hoàn thành một bài luyện để bắt đầu theo dõi.</p>}
    </section>}
  </div></section>;
}

function GoalsCard({ goals, onChange, status }: { goals: ProgressGoals; onChange: (goals: ProgressGoals) => void; status: string }) {
  return <section className="card sp-card sp-goals">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={Target} tone="coral" /><div><h2>Mục tiêu của bạn</h2><p>Chọn band bạn muốn đạt cho từng kỹ năng.</p></div></div>
      {status && <small className="sp-status" role="status">{status}</small>}
    </div>
    <div className="sp-goal-grid">
      <label className="sp-goal sp-goal-overall">
        <span>Overall</span>
        <select value={goals.overall ?? ""} onChange={(event) => onChange({ ...goals, overall: event.target.value ? Number(event.target.value) : null })} aria-label="Band mục tiêu Overall">
          <option value="">–</option>
          {bandOptions.map((band) => <option key={band} value={band}>{band.toFixed(1)}</option>)}
        </select>
        <small>{goals.overall === null ? "Chưa đặt" : "Band tổng"}</small>
      </label>
      {progressSkills.map((skill) => {
        const Icon = skillMeta[skill].icon;
        return <label key={skill} className={`sp-goal sp-tone-${skill.toLowerCase()}`}>
          <span><i aria-hidden="true"><Icon size={14} strokeWidth={2.4} /></i>{skillMeta[skill].label}</span>
          <select value={goals[skill] ?? ""} onChange={(event) => onChange({ ...goals, [skill]: event.target.value ? Number(event.target.value) : null })} aria-label={`Band mục tiêu ${skill}`}>
            <option value="">–</option>
            {bandOptions.map((band) => <option key={band} value={band}>{band.toFixed(1)}</option>)}
          </select>
        </label>;
      })}
    </div>
  </section>;
}

function ExamCard({ examDate, today, onChange }: { examDate: string | null; today: string; onChange: (examDate: string | null) => void }) {
  const left = examDate ? dayDiff(today, examDate) : null;
  return <section className="card sp-card sp-exam">
    <div className="card-head"><div className="head-title"><HeadIcon icon={CalendarClock} tone="sky" /><h2>Lịch thi</h2></div></div>
    <div className={`sp-countdown ${left !== null && left >= 0 && left <= 30 ? "soon" : ""}`}>
      {left === null ? <p>Chọn ngày thi để bắt đầu đếm ngược.</p>
        : left > 0 ? <><span>còn</span><strong>{left}</strong><span>ngày</span></>
        : left === 0 ? <strong className="sp-today">Hôm nay thi!</strong>
        : <p>Kỳ thi đã diễn ra {-left} ngày trước. Chọn ngày thi mới nhé.</p>}
    </div>
    <label className="sp-date">
      <span>Ngày thi dự kiến</span>
      <input type="date" value={examDate ?? ""} onChange={(event) => onChange(event.target.value || null)} />
    </label>
  </section>;
}

function ActivityCalendar({ month, today, days, selection, loading, error, onMonth, onSelect }: {
  month: string; today: string; days: Map<string, ProgressDay>; selection: Selection; loading: boolean; error: string;
  onMonth: (offset: number) => void; onSelect: (selection: Selection | null) => void;
}) {
  const weeks = monthWeeks(month);
  const activeCount = weeks.flat().filter((day) => day.startsWith(month) && days.get(day)?.active).length;
  const selectedDays = new Set(selection.kind === "day" ? [selection.day] : selection.days);
  return <section className="card sp-card sp-calendar">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={Flame} tone="mint" /><div><h2>Biểu đồ chăm chỉ</h2><p>{loading ? "Đang tải…" : `${activeCount} ngày có học trong tháng`}</p></div></div>
      <div className="sp-month">
        <button type="button" onClick={() => onMonth(-1)} aria-label="Tháng trước"><ChevronLeft size={16} /></button>
        <b>{monthLabel(month)}</b>
        <button type="button" onClick={() => onMonth(1)} aria-label="Tháng sau" disabled={month >= today.slice(0, 7)}><ChevronRight size={16} /></button>
      </div>
    </div>
    {error && <p className="sp-error" role="alert">{error}</p>}
    <div className="sp-cal-grid" role="group" aria-label={`Lịch học ${monthLabel(month)}`}>
      <div className="sp-cal-row sp-cal-head" aria-hidden="true"><span>Tuần</span>{weekdays.map((label) => <span key={label}>{label}</span>)}</div>
      {weeks.map((week, index) => {
        const weekSelected = selection.kind === "week" && selection.days[0] === week[0];
        return <div key={week[0]} className="sp-cal-row">
          <button type="button" className={`sp-cal-week ${weekSelected ? "selected" : ""}`} aria-pressed={weekSelected} onClick={() => onSelect({ kind: "week", days: week })} aria-label={`Xem tuần ${shortDate(week[0])} – ${shortDate(week[6])}`}>{index + 1}</button>
          {week.map((day) => {
            const info = days.get(day), future = day > today, inMonth = day.startsWith(month);
            const isSelected = selection.kind === "day" ? selection.day === day : selectedDays.has(day);
            return <button key={day} type="button" disabled={future}
              className={`sp-cal-day ${info?.active ? "active" : ""} ${inMonth ? "" : "outside"} ${day === today ? "today" : ""} ${isSelected ? "selected" : ""}`}
              aria-pressed={selection.kind === "day" && selection.day === day}
              aria-label={`${shortDate(day)}${info?.active ? `, có học, ${dayTotal(info)} bài` : ""}`}
              onClick={() => onSelect(selection.kind === "day" && selection.day === day ? { kind: "week", days: week } : { kind: "day", day })}>
              {Number(day.slice(8, 10))}
            </button>;
          })}
        </div>;
      })}
    </div>
    <div className="sp-legend"><span><i className="active" /> Có học</span><span><i /> Chưa học</span><span><i className="today" /> Hôm nay</span></div>
  </section>;
}

function WeekStats({ selection, days, today, loading }: { selection: Selection; days: Map<string, ProgressDay>; today: string; loading: boolean }) {
  const list = selection.kind === "day" ? [selection.day] : selection.days;
  const rows = list.map((day) => days.get(day) ?? emptyDay(day));
  const total = rows.reduce((sum, row) => {
    progressSkills.forEach((skill) => { sum[skill] += row[skill]; });
    sum.other += row.other; sum.minutes += row.minutes;
    return sum;
  }, emptyDay("total"));
  const title = selection.kind === "day" ? "Thống kê số bài đã làm trong ngày" : "Thống kê số bài đã làm trong tuần";
  const range = selection.kind === "day" ? shortDate(selection.day) : `${shortDate(list[0])} – ${shortDate(list[6])}`;
  return <section className="card sp-card sp-stats">
    <div className="card-head"><div className="head-title"><HeadIcon icon={ListChecks} tone="sun" /><div><h2>{title}</h2><p>{range} · {dayTotal(total)} bài · {total.minutes} phút</p></div></div></div>
    <div className="sp-table-wrap">
      <table className="sp-table">
        <thead><tr>
          <th scope="col">Ngày</th>
          {progressSkills.map((skill) => <th key={skill} scope="col" className={`sp-tone-${skill.toLowerCase()}`} title={skill}><i aria-hidden="true">{skillMeta[skill].short}</i><span className="sp-th-label">{skill}</span></th>)}
          <th scope="col" title="Từ vựng, ngữ pháp và bài khác">Khác</th>
          <th scope="col" title="Thời gian làm bài thi, tính từ lúc bắt đầu đến lúc nộp">Phút</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => {
            const weekday = weekdays[(new Date(`${row.day}T00:00:00Z`).getUTCDay() + 6) % 7];
            return <tr key={row.day} className={`${row.day === today ? "today" : ""} ${row.day > today ? "future" : ""}`}>
              <th scope="row"><b>{weekday}</b> {shortDate(row.day)}</th>
              {progressSkills.map((skill) => <td key={skill} className={row[skill] ? "has" : ""}>{loading ? "·" : row[skill]}</td>)}
              <td className={row.other ? "has" : ""}>{loading ? "·" : row.other}</td>
              <td className={row.minutes ? "has" : ""}>{loading ? "·" : row.minutes}</td>
            </tr>;
          })}
        </tbody>
        {rows.length > 1 && <tfoot><tr>
          <th scope="row">Tổng</th>
          {progressSkills.map((skill) => <td key={skill}>{total[skill]}</td>)}
          <td>{total.other}</td>
          <td>{total.minutes}</td>
        </tr></tfoot>}
      </table>
    </div>
  </section>;
}
