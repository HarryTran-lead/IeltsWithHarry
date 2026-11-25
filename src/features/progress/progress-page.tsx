"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenText, CalendarCheck, CalendarClock, ChartColumn, CircleCheck, Clock3, Compass, Flame,
  Headphones, History, Layers, Lightbulb, ListChecks, Mic, Newspaper, PenLine, Target, Trophy, Type,
} from "lucide-react";
import { HeadIcon } from "@/components/ui/head-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { PageHeader } from "@/components/ui/page-header";
import { StudyProgress } from "@/features/dashboard/study-progress";
import { useDemo } from "@/features/demo/demo-store";
import { activityLabels, type LearnerOverview } from "@/lib/account";
import { todayISO } from "@/lib/demo-data";
import {
  behaviorInsights, examPlan, formatMinutes, isCounted, overallBand, periodTotals, skillSummaries, TESTS_PER_HALF_BAND, TYPE_MIN_ANSWERED, weakTypes, weeklyRows,
  type InsightAttempt, type ProgressInsights, type SkillSummary, type SpeakingStats, type TypeStat, type WeekRow,
} from "@/lib/progress-insights";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import {
  addDays, asProgressSkill, bucketActivity, emptyGoals, progressSkills, skillFromSlug, weekOf,
  type ActivityItem, type ProgressDay, type ProgressGoals, type ProgressReport, type ProgressSkill,
} from "@/lib/study-progress";
import "./progress-page.css";

const WEEKS = 12;
const skillMeta: Record<ProgressSkill, { icon: typeof BookOpenText; href: string }> = {
  Reading: { icon: BookOpenText, href: "/app/reading" },
  Listening: { icon: Headphones, href: "/app/listening" },
  Writing: { icon: PenLine, href: "/app/writing" },
  Speaking: { icon: Mic, href: "/app/speaking" },
};
const series = [...progressSkills, "other"] as const;
type Series = (typeof series)[number];
const seriesLabel = (key: Series) => (key === "other" ? "Khác" : key);
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fullDate = (at: string) => new Date(at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const bandText = (band: number | null) => (band === null ? "—" : band.toFixed(1));

export type ProgressViewProps = {
  today: string; days: ProgressDay[]; goals: ProgressGoals; overview: LearnerOverview | null; insights: ProgressInsights | null;
  loading: boolean; error?: string; footer?: ReactNode;
};

/** Live account data: 12 weeks of daily activity, scored tests and the account overview. */
function useLiveProgress(enabled: boolean) {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [insights, setInsights] = useState<ProgressInsights | null>(null);
  const [overview, setOverview] = useState<LearnerOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const today = todayISO(), from = addDays(weekOf(today)[0], -(WEEKS - 1) * 7);
    const load = async <T,>(url: string) => {
      const response = await fetch(url);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? "Đăng nhập để xem tiến độ học của bạn." : body.error || "Chưa tải được tiến độ học.");
      return body as T;
    };
    void load<ProgressReport>(`/api/progress?from=${from}&to=${addDays(today, 1)}`).then((data) => { if (active) setReport(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    void load<ProgressInsights>("/api/progress/insights").then((data) => { if (active) setInsights(data); })
      .catch(() => { if (active) setInsights({ attempts: [], questionTypes: [] }); });
    void createClient().rpc("learner_overview").then(({ data }) => { if (active && data) setOverview(data as LearnerOverview); });
    return () => { active = false; };
  }, [enabled]);
  return { report, insights, overview, error };
}

/** Demo preview: planner tasks and lesson attempts saved in this browser. */
function useDemoDays(today: string) {
  const { tasks, attempts } = useDemo();
  return useMemo(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone, from = addDays(weekOf(today)[0], -(WEEKS - 1) * 7);
    const items: ActivityItem[] = [
      ...tasks.filter((task) => task.completed).map((task) => ({ at: `${task.date}T12:00:00`, skill: asProgressSkill(task.skill), counted: true, minutes: 0 })),
      ...attempts.map((attempt) => ({ at: attempt.submittedAt ?? `${attempt.date}T12:00:00`, skill: skillFromSlug(attempt.lesson), counted: true, minutes: 0 })),
    ];
    return bucketActivity(items, from, addDays(today, 6), timezone);
  }, [tasks, attempts, today]);
}

export function ProgressPage() {
  const live = useLiveProgress(!demoMode);
  const demoDays = useDemoDays(todayISO());
  const [goals, setGoals] = useState<ProgressGoals | null>(null);
  const today = live.report?.today ?? todayISO();
  return <ProgressView
    today={today}
    days={demoMode ? demoDays : live.report?.days ?? []}
    goals={goals ?? live.report?.goals ?? emptyGoals}
    overview={live.overview}
    insights={demoMode ? { attempts: [], questionTypes: [] } : live.insights}
    loading={!demoMode && !live.report && !live.error}
    error={live.error}
    footer={<StudyProgress variant="page" onGoalsChange={setGoals} />}
  />;
}

export function ProgressView({ today, days, goals, overview, insights, loading, error, footer }: ProgressViewProps) {
  const attempts = useMemo(() => insights?.attempts ?? [], [insights]);
  const summaries = useMemo(() => skillSummaries(attempts), [attempts]);
  const weeks = useMemo(() => weeklyRows(days, today, WEEKS), [days, today]);
  const period = useMemo(() => periodTotals(days, today), [days, today]);
  const plan = useMemo(() => examPlan(goals, summaries, attempts, today), [goals, summaries, attempts, today]);
  const notes = useMemo(() => insights ? behaviorInsights({ attempts, days, today, speaking: insights.speaking }) : [], [insights, attempts, days, today]);
  const left = plan.status === "no-exam" || plan.status === "past" ? null : plan.daysLeft;
  return <div className="content-page progress-page">
    <PageHeader
      eyebrow="HÀNH TRÌNH CỦA BẠN"
      title="Tiến độ học tập"
      description="Band ước tính, thời gian luyện, dạng câu hỏi cần cải thiện và lịch sử làm đề — cập nhật theo bài bạn nộp."
      sticker="chart"
      actions={<>
        {left !== null && <span className={`pg-exam-chip ${left <= 30 ? "soon" : ""}`}><CalendarClock size={15} /> {left === 0 ? "Hôm nay thi!" : <>Còn <b>{left}</b> ngày đến kỳ thi</>}</span>}
        <a className="button ghost" href="#muc-tieu"><Target size={15} /> {goals.overall ? `Mục tiêu ${goals.overall.toFixed(1)}` : "Đặt mục tiêu"}</a>
      </>}
    />
    {error && <p className="pg-error" role="alert">{error}</p>}
    <KpiRow overview={overview} period={period} attempts={attempts} insightsLoaded={Boolean(insights)} loading={loading} today={today} />
    <div className="pg-split pg-split-even">
      <PlanCard plan={plan} loading={!insights} />
      <BehaviorCard notes={notes} loading={!insights} />
    </div>
    <BandSection summaries={summaries} goals={goals} speaking={insights?.speaking ?? null} loading={!insights} />
    <div className="pg-split">
      <WeeklyChart weeks={weeks} loading={loading} />
      <TypeAccuracy stats={insights?.questionTypes ?? []} goals={goals} validTests={attempts.filter((item) => isCounted(item) && (item.skill === "Reading" || item.skill === "Listening")).length} loading={!insights} />
    </div>
    <AttemptHistory attempts={attempts} loading={!insights} />
    <div className="pg-split pg-split-even">
      <OtherStats overview={overview} />
      <RecentActivity overview={overview} />
    </div>
    {footer && <section id="muc-tieu" className="pg-footer" aria-label="Mục tiêu và lịch học">
      <h2 className="pg-section-title"><CalendarCheck size={18} /> Mục tiêu &amp; lịch học</h2>
      {footer}
    </section>}
  </div>;
}

function Delta({ now, before, unit = "" }: { now: number; before: number; unit?: string }) {
  if (!now && !before) return <small className="pg-delta">Chưa có hoạt động</small>;
  const diff = now - before;
  if (!diff) return <small className="pg-delta">Bằng 4 tuần trước</small>;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return <small className={`pg-delta ${diff > 0 ? "up" : "down"}`}><Icon size={13} /> {diff > 0 ? "+" : "−"}{Math.abs(diff)}{unit} so với 4 tuần trước</small>;
}

function KpiRow({ overview, period, attempts, insightsLoaded, loading, today }: { overview: LearnerOverview | null; period: ReturnType<typeof periodTotals>; attempts: InsightAttempt[]; insightsLoaded: boolean; loading: boolean; today: string }) {
  const dots = (value: ReactNode) => (loading ? "…" : value);
  const since = addDays(today, -27);
  const valid = attempts.filter(isCounted);
  const recentValid = valid.filter((item) => item.submittedAt.slice(0, 10) >= since).length;
  const skipped = attempts.length - valid.length;
  return <section className="pg-kpis" aria-label="Chỉ số chính">
    <div className="pg-kpi pg-kpi-streak">
      <span><Flame size={15} /> Chuỗi ngày học<InfoTip>Số ngày liên tiếp có ít nhất một hoạt động học thật: làm bài, làm đề, quiz Daily News, chép chính tả, lưu từ, hoặc 5 phút học trên trang bài học. Mở trang không tính.</InfoTip></span>
      <strong>{overview ? overview.streak.current : demoMode ? "—" : "…"}<em> ngày</em></strong>
      <small className="pg-delta">{overview ? <>Dài nhất {overview.streak.longest} ngày · {overview.streak.activeToday ? "đã học hôm nay" : "chưa học hôm nay"}</> : "Học mỗi ngày để giữ chuỗi"}</small>
    </div>
    <div className="pg-kpi">
      <span><CalendarCheck size={15} /> Ngày có học · 28 ngày<InfoTip>Cùng định nghĩa với chuỗi ngày học: một ngày được tính khi bạn hoàn thành ít nhất một hoạt động học, hoặc học thật ít nhất 5 phút.</InfoTip></span>
      <strong>{dots(period.current.activeDays)}<em>/28</em></strong>
      <Delta now={period.current.activeDays} before={period.previous.activeDays} unit=" ngày" />
    </div>
    <div className="pg-kpi">
      <span><ListChecks size={15} /> Bài đã làm · 28 ngày<InfoTip>Bài học, bài luyện, đề IELTS có trả lời, quiz Daily News và dictation (mỗi ngày tính một lượt dictation).</InfoTip></span>
      <strong>{dots(period.current.exercises)}</strong>
      <Delta now={period.current.exercises} before={period.previous.exercises} unit=" bài" />
    </div>
    <div className="pg-kpi">
      <span><Clock3 size={15} /> Thời gian học · 28 ngày<InfoTip>Mỗi ngày lấy số lớn hơn giữa thời gian làm đề có giờ và thời gian học thật (tab đang mở, bạn có thao tác trong 1 phút gần nhất hoặc đang nghe audio). Trang tổng quan không tính.</InfoTip></span>
      <strong className="pg-kpi-time">{dots(formatMinutes(period.current.minutes))}</strong>
      <Delta now={period.current.minutes} before={period.previous.minutes} unit=" phút" />
    </div>
    <div className="pg-kpi">
      <span><Trophy size={15} /> Đề IELTS được tính<InfoTip>Đề có trả lời ít nhất một nửa số câu và không làm quá nhanh (dưới 20 giây/câu). Bài Writing cần ít nhất nửa số từ tối thiểu. Đề bỏ dở vẫn nằm trong lịch sử nhưng không vào band.</InfoTip></span>
      <strong>{insightsLoaded ? valid.length : "…"}</strong>
      <small className="pg-delta">{recentValid} đề trong 28 ngày{skipped ? ` · ${skipped} đề bỏ dở/không tính` : ""}</small>
    </div>
    <div className="pg-kpi">
      <span><Type size={15} /> Từ vựng đã lưu</span>
      <strong>{overview?.stats.words ?? (demoMode ? "—" : "…")}</strong>
      <small className="pg-delta">{overview ? `${overview.streak.totalDays} ngày học từ lúc tạo tài khoản` : "Lưu từ khi đọc báo và làm bài"}</small>
    </div>
  </section>;
}

const focusLabel = (focus: ProgressSkill | "overall") => (focus === "overall" ? "Overall" : focus);

function PlanCard({ plan, loading }: { plan: ReturnType<typeof examPlan>; loading: boolean }) {
  let body: ReactNode;
  if (loading) body = <p className="pg-muted">Đang tính lộ trình…</p>;
  else if (plan.status === "no-exam" || plan.status === "past") body = <div className="pg-empty"><p>{plan.status === "past" ? "Ngày thi đã qua." : "Chưa có ngày thi."} Chọn ngày thi và band mục tiêu để biết mỗi tuần cần làm bao nhiêu đề.</p><a className="button ghost" href="#muc-tieu">Chọn ngày thi</a></div>;
  else if (plan.status === "no-target") body = <div className="pg-empty"><p>Còn <b>{plan.daysLeft}</b> ngày. Đặt band mục tiêu để biết bạn đang đúng tiến độ hay không.</p><a className="button ghost" href="#muc-tieu">Đặt mục tiêu</a></div>;
  else if (plan.status === "no-band") body = <div className="pg-empty"><p>Còn <b>{plan.daysLeft}</b> ngày. Cần band hiện tại của ít nhất một kỹ năng có mục tiêu: làm trọn một đề Reading hoặc Listening, hoặc chấm một bài Writing.</p><Link className="button ghost" href="/app/reading">Làm đề Reading</Link></div>;
  else if (plan.status === "reached") body = <p className="pg-plan-line"><b className="pg-chip good"><CircleCheck size={13} /> Đã đạt mục tiêu</b> Band hiện tại {plan.current.toFixed(1)} ≥ mục tiêu {plan.target.toFixed(1)}. Còn {plan.daysLeft} ngày để giữ phong độ: 1–2 đề mỗi tuần là đủ.</p>;
  else body = <>
    <p className="pg-plan-line">Còn <b>{plan.daysLeft}</b> ngày, cần <b>+{plan.gap.toFixed(1)}</b> band {focusLabel(plan.focus)} ({plan.current.toFixed(1)} → {plan.target.toFixed(1)}).</p>
    <div className="pg-plan-pace">
      <div><small>Nên làm</small><strong>{plan.perWeekNeeded}</strong><span>đề/tuần</span></div>
      <div><small>Bạn đang làm</small><strong>{plan.perWeekNow}</strong><span>đề/tuần (4 tuần qua)</span></div>
      <b className={`pg-chip ${plan.status === "on-track" ? "good" : "warn"}`}>{plan.status === "on-track" ? "Đúng tiến độ" : "Đang chậm"}</b>
    </div>
    {plan.status === "behind" && <p className="pg-muted">Tăng thêm {Math.max(1, Math.ceil(plan.perWeekNeeded - plan.perWeekNow))} đề mỗi tuần, hoặc lùi ngày thi nếu lịch quá dày.</p>}
    <Link className="pg-link" href="/app/planner">Đưa vào kế hoạch học <ArrowRight size={13} /></Link>
  </>;
  return <section className="card pg-card pg-plan">
    <div className="card-head"><div className="head-title"><HeadIcon icon={Compass} tone="sky" /><div><h2>Lộ trình đến ngày thi<InfoTip>Ước lượng thô: khoảng {TESTS_PER_HALF_BAND} đề được tính (có xem lại đáp án) cho mỗi 0.5 band. Một passage/part lẻ tính khoảng 1/3 đề, Writing Task 1 tính 1/2.</InfoTip></h2><p>Mục tiêu, ngày thi và nhịp làm đề hiện tại</p></div></div></div>
    {body}
  </section>;
}

function BehaviorCard({ notes, loading }: { notes: ReturnType<typeof behaviorInsights>; loading: boolean }) {
  return <section className="card pg-card pg-notes">
    <div className="card-head"><div className="head-title"><HeadIcon icon={Lightbulb} tone="sun" /><div><h2>Nhận xét từ cách bạn học</h2><p>Rút ra từ bài nộp và lịch học của bạn</p></div></div></div>
    {loading ? <p className="pg-muted">Đang phân tích…</p> : notes.length ? <ul className="pg-note-list">{notes.map((note) => <li key={note.id} className={`is-${note.tone}`}>
      <p>{note.text}</p>
      {note.action && (note.action.href.startsWith("#") ? <a href={note.action.href}>{note.action.label} <ArrowRight size={13} /></a> : <Link href={note.action.href}>{note.action.label} <ArrowRight size={13} /></Link>)}
    </li>)}</ul> : <p className="pg-muted">Chưa có nhận xét nào. Làm thêm vài bài để Harry nhận ra thói quen học của bạn.</p>}
  </section>;
}

function BandSection({ summaries, goals, speaking, loading }: { summaries: SkillSummary[]; goals: ProgressGoals; speaking: SpeakingStats | null; loading: boolean }) {
  const overall = overallBand(summaries);
  const gap = overall.band !== null && goals.overall !== null ? goals.overall - overall.band : null;
  return <section className="card pg-card pg-bands">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={Target} tone="coral" /><div><h2>Band ước tính so với mục tiêu<InfoTip>Trung bình có trọng số của các bài được tính gần nhất, đủ tương đương 3 đề full. Đề full nặng 1, một passage/part lẻ nặng khoảng 1/3 (quy đổi về thang 40 câu nên kém chính xác hơn). Số ± là khoảng sai số: càng ít bài, khoảng càng rộng.</InfoTip></h2><p>Chỉ tính đề làm trọn vẹn. Đề bỏ dở hoặc nộp quá nhanh không làm sai lệch band.</p></div></div>
    </div>
    <div className="pg-band-grid">
      <div className="pg-overall">
        <span>Overall ước tính</span>
        <strong>{loading ? "…" : bandText(overall.band)}</strong>
        <small>{overall.band !== null ? <>± {overall.margin?.toFixed(1)}{overall.withoutSpeaking ? " · chưa gồm Speaking" : ""}</> : loading ? "" : `Cần band ${overall.missing.join(", ")} để tính Overall`}</small>
        <div className="pg-overall-goal">
          <span>Mục tiêu <b>{bandText(goals.overall)}</b></span>
          {goals.overall === null ? <a href="#muc-tieu">Đặt mục tiêu</a> : gap === null ? null : gap <= 0 ? <b className="pg-chip good"><CircleCheck size={13} /> Đã đạt</b> : <b className="pg-chip">Còn {gap.toFixed(1)} band</b>}
        </div>
      </div>
      {summaries.map((summary) => summary.skill === "Speaking" && summary.current === null
        ? <SpeakingCard key="Speaking" stats={speaking} target={goals.Speaking} loading={loading} />
        : <SkillBandCard key={summary.skill} summary={summary} target={goals[summary.skill]} loading={loading} />)}
    </div>
  </section>;
}

function SkillBandCard({ summary, target, loading }: { summary: SkillSummary; target: number | null; loading: boolean }) {
  const { skill, current, previous, best, bestPartial, attempts, valid, trend, margin, needMore, criteria } = summary;
  const Icon = skillMeta[skill].icon;
  const gap = current !== null && target !== null ? target - current : null;
  const change = current !== null && previous !== null ? current - previous : null;
  const empty = skill === "Writing" ? "Nộp một bài Writing đủ dài rồi bấm “Chấm bài” để có band." : `Làm trọn một đề ${skill} để thấy band của bạn.`;
  return <article className={`pg-skill pg-tone-${skill.toLowerCase()}`}>
    <header><span className="pg-skill-name"><i aria-hidden="true"><Icon size={14} strokeWidth={2.4} /></i>{skill}</span><small>{attempts ? `${valid}/${attempts} bài được tính` : ""}</small></header>
    <div className="pg-skill-band">
      <strong>{loading ? "…" : bandText(current)}</strong>
      {margin !== null && <span className="pg-margin">±{margin.toFixed(1)}</span>}
      <span>/ mục tiêu {bandText(target)}</span>
      {change !== null && change !== 0 && <em className={change > 0 ? "up" : "down"} title="So với các bài trước đó">{change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}</em>}
    </div>
    <div className="pg-meter" role="img" aria-label={`${skill}: band ${bandText(current)} trên mục tiêu ${bandText(target)}`}>
      <i style={{ width: `${((current ?? 0) / 9) * 100}%` }} />
      {target !== null && <b style={{ left: `${(target / 9) * 100}%` }} title={`Mục tiêu ${target.toFixed(1)}`} />}
    </div>
    {current !== null && needMore > 0 && <p className="pg-skill-need">Cần thêm ~{needMore} đề full (hoặc {needMore * 3} bài lẻ) để ước tính chính xác.</p>}
    {criteria.length > 0 && <ul className="pg-criteria" aria-label="Điểm theo tiêu chí">{criteria.map((item) => <li key={item.key} title={criterionNames[item.key] ?? item.key}>
      <span>{item.key}</span><i><b style={{ width: `${(item.score / 9) * 100}%` }} /></i><em>{item.score.toFixed(1)}</em>
    </li>)}</ul>}
    {trend.length >= 2 ? <BandTrend skill={skill} trend={trend} target={target} /> : <p className="pg-skill-empty">{trend.length === 1 ? "Làm thêm 1 bài để xem xu hướng." : empty}</p>}
    <footer>
      <span>{best !== null ? <>Cao nhất <b>{best.toFixed(1)}{bestPartial ? "*" : ""}</b></> : "Chưa có điểm"}</span>
      {gap !== null && (gap <= 0 ? <span className="pg-chip good">Đạt mục tiêu</span> : <span className="pg-chip">Còn {gap.toFixed(1)}</span>)}
      <Link href={skillMeta[skill].href}>Luyện <ArrowRight size={13} /></Link>
    </footer>
  </article>;
}
const criterionNames: Record<string, string> = { TR: "Task Response / Task Achievement", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy" };

/** Speaking has no band here on purpose; show how much the learner actually speaks. */
function SpeakingCard({ stats, target, loading }: { stats: SpeakingStats | null; target: number | null; loading: boolean }) {
  return <article className="pg-skill pg-tone-speaking">
    <header><span className="pg-skill-name"><i aria-hidden="true"><Mic size={14} strokeWidth={2.4} /></i>Speaking</span><small>{stats?.sessions ? `${stats.sessions} buổi` : ""}</small></header>
    <div className="pg-skill-band"><strong>{loading ? "…" : stats?.speakingMinutes ?? "—"}</strong><span>phút đã nói · mục tiêu {bandText(target)}</span></div>
    <p className="pg-skill-empty">{stats?.sessions
      ? <>{stats.coached} lượt được nhận xét Part 2{stats.lastAt ? ` · gần nhất ${fullDate(stats.lastAt)}` : ""}. Speaking chưa có band tự động để tránh điểm sai.</>
      : "Chưa có buổi luyện Speaking nào. Speaking chưa có band tự động, nên được theo dõi bằng số phút bạn nói."}</p>
    <footer><span>{stats?.sessions ? "Luyện đều 3 buổi/tuần" : "Chưa luyện"}</span><Link href={skillMeta.Speaking.href}>Luyện <ArrowRight size={13} /></Link></footer>
  </article>;
}

/** Band per scored test, oldest to newest, with the skill's target as a reference line. Hollow dots are single parts. */
function BandTrend({ skill, trend, target }: { skill: ProgressSkill; trend: SkillSummary["trend"]; target: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 240, height = 74, pad = 8;
  const values = trend.map((point) => point.band).concat(target ?? []);
  const low = Math.max(0, Math.floor(Math.min(...values)) - 0.5), high = Math.min(9, Math.ceil(Math.max(...values)) + 0.5);
  const x = (index: number) => pad + (index / (trend.length - 1)) * (width - pad * 2);
  const y = (band: number) => pad + (1 - (band - low) / Math.max(0.5, high - low)) * (height - pad * 2);
  const path = trend.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.band).toFixed(1)}`).join(" ");
  const active = hover === null ? null : trend[hover];
  return <div className="pg-trend" onMouseLeave={() => setHover(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Xu hướng band ${skill}: ${trend.map((point) => point.band.toFixed(1)).join(", ")}`}>
      {target !== null && <g className="pg-trend-target"><line x1={0} x2={width} y1={y(target)} y2={y(target)} /><text x={width - 2} y={y(target) - 4} textAnchor="end">mục tiêu</text></g>}
      <path d={path} className="pg-trend-line" />
      {trend.map((point, index) => <g key={`${point.at}-${index}`}>
        <circle cx={x(index)} cy={y(point.band)} r={index === trend.length - 1 || index === hover ? 4.5 : 3} className={`pg-trend-dot ${point.partial ? "partial" : ""}`} />
        <circle cx={x(index)} cy={y(point.band)} r={12} className="pg-trend-hit" tabIndex={0} aria-label={`${fullDate(point.at)}: band ${point.band.toFixed(1)}${point.partial ? " (bài lẻ)" : ""}`}
          onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />
      </g>)}
    </svg>
    {active && <div className="pg-tip" style={{ left: `${(x(hover!) / width) * 100}%`, top: `${(y(active.band) / height) * 100}%` }}>
      <b>Band {active.band.toFixed(1)}{active.partial ? "*" : ""}</b><span>{active.title}</span><small>{fullDate(active.at)}{active.partial ? " · bài lẻ" : ""}</small>
    </div>}
  </div>;
}

function WeeklyChart({ weeks, loading }: { weeks: WeekRow[]; loading: boolean }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...weeks.map((week) => week.total));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 20;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);
  const total = weeks.reduce((sum, week) => sum + week.total, 0);
  const activeWeeks = weeks.filter((week) => week.activeDays).length;
  return <section className="card pg-card pg-weekly">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={ChartColumn} tone="sky" /><div><h2>Số bài theo tuần<InfoTip>“Khác” gồm quiz Daily News, bài từ vựng, ngữ pháp và bài học không thuộc 4 kỹ năng. Một tuần “có học” khi có ít nhất một ngày học.</InfoTip></h2><p>{loading ? "Đang tải…" : `${total} bài trong ${WEEKS} tuần · ${activeWeeks}/${WEEKS} tuần có học`}</p></div></div>
      <div className="pg-toggle" role="group" aria-label="Kiểu hiển thị">
        <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Biểu đồ</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Bảng</button>
      </div>
    </div>
    <ul className="pg-legend" aria-label="Chú thích">{series.map((key) => <li key={key}><i className={`pg-fill-${key.toLowerCase()}`} />{seriesLabel(key)}</li>)}</ul>
    {view === "chart" ? <div className="pg-columns" onMouseLeave={() => setHover(null)}>
      <div className="pg-axis" aria-hidden="true">{ticks.slice().reverse().map((tick) => <span key={tick}>{tick}</span>)}</div>
      <div className="pg-plot">
        {ticks.map((tick) => <i key={tick} className="pg-grid" style={{ bottom: `${(tick / top) * 100}%` }} />)}
        {weeks.map((week, index) => {
          const current = index === weeks.length - 1;
          return <button key={week.start} type="button" className={`pg-col ${hover === index ? "hover" : ""} ${index < 2 ? "edge-start" : index >= weeks.length - 2 ? "edge-end" : ""}`}
            onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}
            aria-label={`Tuần ${shortDate(week.start)} – ${shortDate(week.end)}: ${week.total} bài, ${week.minutes} phút học, ${week.activeDays} ngày có học`}>
            <span className="pg-stack" style={{ height: `${(week.total / top) * 100}%` }}>
              {series.filter((key) => week[key]).map((key) => <i key={key} className={`pg-fill-${key.toLowerCase()}`} style={{ flexGrow: week[key] }} />)}
            </span>
            {week.total > 0 && <b className="pg-cap" style={{ bottom: `${(week.total / top) * 100}%` }}>{week.total}</b>}
            <small className={current ? "current" : ""}>{current ? "Tuần này" : shortDate(week.start)}</small>
            {hover === index && <span className="pg-tip pg-col-tip">
              <b>{shortDate(week.start)} – {shortDate(week.end)}</b>
              {series.map((key) => <span key={key}><i className={`pg-fill-${key.toLowerCase()}`} />{seriesLabel(key)}<em>{week[key]}</em></span>)}
              <small>{week.minutes} phút học · {week.activeDays}/7 ngày có học</small>
            </span>}
          </button>;
        })}
      </div>
    </div> : <div className="pg-table-wrap"><table className="pg-table">
      <thead><tr><th scope="col">Tuần</th>{series.map((key) => <th key={key} scope="col">{seriesLabel(key)}</th>)}<th scope="col">Tổng</th><th scope="col">Phút</th><th scope="col">Ngày học</th></tr></thead>
      <tbody>{weeks.slice().reverse().map((week) => <tr key={week.start}><th scope="row">{shortDate(week.start)} – {shortDate(week.end)}</th>{series.map((key) => <td key={key}>{week[key]}</td>)}<td><b>{week.total}</b></td><td>{week.minutes}</td><td>{week.activeDays}/7</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

function TypeAccuracy({ stats, goals, validTests, loading }: { stats: TypeStat[]; goals: ProgressGoals; validTests: number; loading: boolean }) {
  const skills = (["Reading", "Listening"] as const).filter((skill) => stats.some((item) => item.skill === skill));
  const [picked, setPicked] = useState<"Reading" | "Listening" | null>(null);
  const skill = picked && skills.includes(picked) ? picked : skills[0] ?? "Reading";
  const answeredOf = (row: TypeStat) => row.total - (row.skipped ?? 0);
  const pctOf = (row: TypeStat) => (answeredOf(row) ? Math.round((row.correct / answeredOf(row)) * 100) : 0);
  const rows = stats.filter((item) => item.skill === skill)
    .sort((a, b) => Number(answeredOf(a) < TYPE_MIN_ANSWERED) - Number(answeredOf(b) < TYPE_MIN_ANSWERED) || pctOf(a) - pctOf(b) || b.total - a.total);
  const target = goals[skill] ?? goals.overall;
  const { weak, threshold, byTarget } = weakTypes(rows, skill, target);
  const weakest = new Set(weak.slice(0, 3));
  const answered = rows.reduce((sum, row) => sum + answeredOf(row), 0), right = rows.reduce((sum, row) => sum + row.correct, 0);
  const skipped = rows.reduce((sum, row) => sum + (row.skipped ?? 0), 0);
  const practiceHref = (row: TypeStat) => `/app/${skill.toLowerCase()}${row.kind && row.kind !== "other" ? `?kind=${encodeURIComponent(row.kind)}` : ""}`;
  return <section className={`card pg-card pg-types pg-tone-${skill.toLowerCase()}`}>
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={Layers} tone="lavender" /><div><h2>Độ chính xác theo dạng câu hỏi<InfoTip>Chỉ tính đề được tính (không bỏ dở, không làm quá nhanh). Tỉ lệ đúng = câu đúng / câu đã trả lời; câu bỏ qua đếm riêng. Cần ít nhất {TYPE_MIN_ANSWERED} câu đã trả lời mới đánh giá một dạng. Ngưỡng “Cần luyện” là tỉ lệ đúng mà band mục tiêu cần{byTarget ? "" : " (chưa có mục tiêu nên so với trung bình của chính bạn)"}.</InfoTip></h2>
        <p>{loading ? "Đang tải…" : answered || skipped ? `${right}/${answered} câu đã trả lời đúng (${answered ? Math.round((right / answered) * 100) : 0}%)${skipped ? ` · ${skipped} câu bỏ qua` : ""} · ${validTests} đề được tính` : "Từ các đề Reading và Listening bạn làm trọn vẹn"}</p></div></div>
      {skills.length > 1 && <div className="pg-toggle" role="group" aria-label="Kỹ năng">
        {skills.map((item) => <button key={item} type="button" aria-pressed={item === skill} onClick={() => setPicked(item)}>{item}</button>)}
      </div>}
    </div>
    {rows.length ? <ol className="pg-type-list">{rows.map((row) => {
      const pct = pctOf(row), few = answeredOf(row) < TYPE_MIN_ANSWERED;
      return <li key={row.type} className={few ? "few" : ""}>
        <div><span>{row.type}</span>{weakest.has(row.type) && <b className="pg-chip warn">Cần luyện</b>}
          <small>{row.correct} đúng · {row.wrong ?? answeredOf(row) - row.correct} sai{row.skipped ? ` · ${row.skipped} bỏ qua` : ""}{few ? " · chưa đủ dữ liệu" : ""}</small></div>
        <div className="pg-type-bar" role="img" aria-label={`${row.type}: ${pct}% đúng trên câu đã trả lời`}>
          <i style={{ width: `${Math.max(pct, 2)}%` }} />
          {!few && <b className="pg-type-goal" style={{ left: `calc((100% - 44px) * ${threshold.toFixed(3)})` }} title={`Ngưỡng ${Math.round(threshold * 100)}%`} />}
          <em>{pct}%</em>
        </div>
        {weakest.has(row.type) && <Link className="pg-type-practice" href={practiceHref(row)}>Luyện dạng này <ArrowRight size={12} /></Link>}
      </li>;
    })}</ol> : <div className="pg-empty"><p>{loading ? "Đang phân tích bài làm…" : "Chưa có đề Reading/Listening nào được làm trọn vẹn. Làm một đề để biết dạng câu hỏi nào bạn mạnh, dạng nào cần luyện thêm."}</p>{!loading && <Link className="button primary" href="/app/reading">Làm đề Reading <ArrowRight size={15} /></Link>}</div>}
    {weakest.size > 0 && <p className="pg-hint">Gợi ý: ưu tiên luyện <b>{[...weakest].join(", ")}</b> trong tuần này — đúng dưới {Math.round(threshold * 100)}%{byTarget ? ` (mức cần cho band ${target?.toFixed(1)})` : " (thấp hơn trung bình của bạn)"}.</p>}
    {!loading && rows.length > 0 && weakest.size === 0 && rows.every((row) => answeredOf(row) < TYPE_MIN_ANSWERED) && <p className="pg-hint">Mỗi dạng cần ít nhất {TYPE_MIN_ANSWERED} câu đã trả lời trước khi Harry đánh giá. Làm thêm 1–2 đề trọn vẹn nhé.</p>}
  </section>;
}

const statusLabel: Record<string, string> = { abandoned: "Bỏ dở", rushed: "Quá nhanh" };

function AttemptHistory({ attempts, loading }: { attempts: InsightAttempt[]; loading: boolean }) {
  const [filter, setFilter] = useState<ProgressSkill | "all">("all");
  const [hideSkipped, setHideSkipped] = useState(false);
  const [limit, setLimit] = useState(8);
  const shown = attempts.filter((item) => (filter === "all" || item.skill === filter) && (!hideSkipped || isCounted(item)));
  const counts = Object.fromEntries(progressSkills.map((skill) => [skill, attempts.filter((item) => item.skill === skill).length]));
  const notCounted = attempts.filter((item) => !isCounted(item)).length;
  return <section id="lich-su" className="card pg-card pg-history">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={History} tone="teal" /><div><h2>Lịch sử làm đề</h2><p>{loading ? "Đang tải…" : `${attempts.length} đề gần nhất${notCounted ? ` · ${notCounted} đề không tính vào band` : ""} · bấm “Xem lại” để xem đáp án và giải thích`}</p></div></div>
      <div className="pg-filters" role="group" aria-label="Lọc theo kỹ năng">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả <small>{attempts.length}</small></button>
        {progressSkills.filter((skill) => counts[skill]).map((skill) => <button key={skill} type="button" aria-pressed={filter === skill} onClick={() => setFilter(skill)}><i className={`pg-fill-${skill.toLowerCase()}`} />{skill} <small>{counts[skill]}</small></button>)}
        {notCounted > 0 && <button type="button" aria-pressed={hideSkipped} onClick={() => setHideSkipped((value) => !value)}>Ẩn bài không tính</button>}
      </div>
    </div>
    {shown.length ? <><div className="pg-table-wrap"><table className="pg-table pg-history-table">
      <thead><tr><th scope="col">Ngày</th><th scope="col">Đề</th><th scope="col">Kỹ năng</th><th scope="col">Điểm</th><th scope="col">Band</th><th scope="col">Thời gian</th><th scope="col"><span className="sr-only">Xem lại</span></th></tr></thead>
      <tbody>{shown.slice(0, limit).map((item) => {
        const pct = item.score !== null && item.total ? Math.round((item.score / item.total) * 100) : null;
        const counted = isCounted(item);
        const writingNote = item.skill === "Writing" ? (item.graded ? "AI đã chấm" : counted ? "Chưa chấm" : "Bài quá ngắn") : "—";
        return <tr key={item.id} className={counted ? "" : "is-skipped"}>
          <td>{fullDate(item.submittedAt)}</td>
          <th scope="row"><span className="pg-title">{item.title}</span>
            {item.partial && <small>Part {item.part ?? "?"} · luyện từng phần</small>}
            {item.skill === "Writing" && item.words !== null && item.words !== undefined && <small>{item.words} từ{item.task ? ` · Task ${item.task}` : ""}</small>}
            {!counted && <small className="pg-skip-note"><b className="pg-chip warn">{statusLabel[item.status ?? ""] ?? "Không tính"}</b> {item.status === "abandoned" ? (item.skill === "Writing" ? "chưa đủ nửa số từ tối thiểu" : `trả lời ${item.answered ?? 0}/${item.total ?? "?"} câu`) : "dưới 20 giây/câu"} · không tính vào band</small>}
          </th>
          <td><span className="pg-skill-tag"><i className={`pg-fill-${item.skill.toLowerCase()}`} />{item.skill}</span></td>
          <td>{item.score !== null && item.total ? <><b>{item.score}/{item.total}</b>{item.skipped ? <small className="pg-muted"> · {item.skipped} bỏ qua</small> : null}<div className="pg-mini-bar"><i style={{ width: `${pct}%` }} /></div></> : <span className="pg-muted">{writingNote}</span>}</td>
          <td>{item.band !== null ? <b className={`pg-band-pill ${counted ? "" : "muted"}`}>{item.band.toFixed(1)}{item.partial || ((item.total ?? 40) < 40 && item.skill !== "Writing") ? "*" : ""}</b> : <span className="pg-muted">—</span>}</td>
          <td>{item.minutes ? `${item.minutes} phút` : "—"}</td>
          <td>{item.skill === "Writing" && counted && !item.graded
            ? <Link className="pg-grade-link" href={`/app/question-bank/result/${item.id}#writing-review`}>Chấm bài <ArrowRight size={13} /></Link>
            : <Link href={`/app/question-bank/result/${item.id}`}>Xem lại <ArrowRight size={13} /></Link>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="pg-history-foot">
      <small>* Band quy đổi từ bài lẻ (một passage/part), chỉ để tham khảo.</small>
      {shown.length > limit && <button type="button" className="button ghost" onClick={() => setLimit((value) => value + 10)}>Xem thêm {Math.min(10, shown.length - limit)} đề</button>}
    </div></> : <div className="pg-empty"><p>{loading ? "Đang tải lịch sử…" : "Bạn chưa nộp đề IELTS nào. Kết quả mỗi đề (điểm, band, thời gian) sẽ được lưu ở đây để bạn so sánh qua thời gian."}</p>{!loading && <Link className="button primary" href="/app/question-bank">Mở ngân hàng đề <ArrowRight size={15} /></Link>}</div>}
  </section>;
}

function OtherStats({ overview }: { overview: LearnerOverview | null }) {
  const stats = overview?.stats;
  const tiles: { icon: typeof BookOpenText; label: string; value: ReactNode; note: string; href: string }[] = [
    { icon: BookOpenText, label: "Bài học khóa học", value: stats?.lessons ?? "—", note: stats?.lessonScore != null ? `Đúng trung bình ${stats.lessonScore}%` : "Chưa có điểm", href: "/app/learn" },
    { icon: Headphones, label: "Câu Dictation", value: stats?.dictation ?? "—", note: "câu nghe chép đã kiểm tra", href: "/app/dictation" },
    { icon: Newspaper, label: "Quiz Daily News", value: stats?.newsQuizzes ?? "—", note: stats?.newsScore != null ? `Đúng trung bình ${stats.newsScore}%` : `${stats?.newsRead ?? 0} bài báo đã đọc`, href: "/app/news" },
    { icon: CircleCheck, label: "Nhiệm vụ Planner", value: stats ? `${stats.tasksDone}/${stats.tasksDone + stats.tasksOpen}` : "—", note: stats ? `${stats.tasksOpen} nhiệm vụ đang mở` : "Lên kế hoạch học", href: "/app/planner" },
  ];
  return <section className="card pg-card pg-other">
    <div className="card-head"><div className="head-title"><HeadIcon icon={ListChecks} tone="mint" /><div><h2>Học liệu khác</h2><p>Tổng từ lúc tạo tài khoản</p></div></div></div>
    <div className="pg-other-grid">{tiles.map((tile) => {
      const Icon = tile.icon;
      return <Link key={tile.label} href={tile.href} className="pg-other-tile"><span><Icon size={15} /> {tile.label}</span><strong>{tile.value}</strong><small>{tile.note}</small></Link>;
    })}</div>
  </section>;
}

function RecentActivity({ overview }: { overview: LearnerOverview | null }) {
  const items = overview?.timeline.slice(0, 7) ?? [];
  return <section className="card pg-card pg-recent">
    <div className="card-head"><div className="head-title"><HeadIcon icon={History} tone="sun" /><div><h2>Hoạt động gần đây</h2><p>Những gì bạn vừa làm</p></div></div><Link href="/app/profile">Xem hồ sơ</Link></div>
    {items.length ? <ol>{items.map((item, index) => <li key={`${item.at}-${index}`}>
      <span>{activityLabels[item.kind] ?? item.kind}</span>
      {item.link ? <Link href={item.link}>{item.title}</Link> : <strong>{item.title}</strong>}
      {item.total ? <b>{item.score}/{item.total}</b> : <i />}
      <time dateTime={item.at}>{fullDate(item.at)}</time>
    </li>)}</ol> : <div className="pg-empty"><p>{overview ? "Chưa có hoạt động. Hoàn thành một bài luyện để bắt đầu theo dõi." : demoMode ? "Đăng nhập để xem hoạt động của bạn." : "Đang tải…"}</p></div>}
  </section>;
}
