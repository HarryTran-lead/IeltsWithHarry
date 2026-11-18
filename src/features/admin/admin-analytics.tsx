"use client";
/* Admin traffic analytics: page views, visits, guests vs learners, sign-ins and learning activity. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, BookOpenCheck, Eye, LogIn, MousePointerClick, RefreshCw, UserPlus, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { LoadingBlock } from "@/components/layout/loading-block";
import { AdminCardHead, AdminHeaderActions, AdminNotice } from "./admin-ui";
import { sampleAnalytics } from "./analytics-sample";
import "./admin-analytics.css";

export type DailyPoint = { day: string; pageViews: number; visits: number; guests: number; members: number; signIns: number; signups: number; learners: number };
export type Analytics = {
  days: number; from: string; to: string;
  summary: { pageViews: number; visits: number; visitors: number; guestVisitors: number; memberVisitors: number; signIns: number; signInUsers: number; signups: number; activeLearners: number; learningEvents: number; onlineNow: number; totalMembers: number };
  previous: { pageViews: number; visits: number; visitors: number; signIns: number; signups: number; activeLearners: number };
  daily: DailyPoint[];
  topPages: { path: string; area: "public" | "app" | "auth"; views: number; visitors: number; guest_views: number }[];
  areas: Partial<Record<"public" | "app" | "auth", number>>;
  devices: Partial<Record<"mobile" | "tablet" | "desktop", number>>;
  signInMethods: Partial<Record<"email" | "google" | "phone" | "unknown", number>>;
  referrers: { host: string; visits: number }[];
  hours: number[];
  recentSignIns: { at: string; method: string; device: string; user_id: string | null; display_name: string | null }[];
  topMembers: { user_id: string; display_name: string | null; page_views: number; visits: number; last_seen: string }[];
};

const ranges = [7, 30, 90] as const;
const nf = new Intl.NumberFormat("vi-VN");
const fmt = (value: number) => nf.format(value);
const dayLabel = (day: string) => { const [, m, d] = day.split("-"); return `${d}/${m}`; };
const timeLabel = (iso: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const areaNames = { public: "Trang công khai", app: "Khu học viên", auth: "Đăng nhập / đăng ký" } as const;
const deviceNames = { mobile: "Điện thoại", tablet: "Máy tính bảng", desktop: "Máy tính" } as const;
const methodNames = { email: "Email", google: "Google", phone: "Số điện thoại", unknown: "Khác" } as const;
/* Categorical order, validated for CVD separation: teal, orange, violet. */
const C = { teal: "#12a1ab", orange: "#e8853d", violet: "#6a5ad6" };

export function AdminAnalytics() {
  const db = useMemo(() => createClient(), []);
  const [days, setDays] = useState<(typeof ranges)[number]>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (sample) { setData(sampleAnalytics(days)); setLoading(false); return; }
    const result = await db.rpc("admin_site_analytics", { p_days: days });
    setLoading(false);
    if (result.error) {
      const notReady = /admin_site_analytics|schema cache|does not exist/i.test(result.error.message);
      setMissing(notReady); setError(notReady ? "" : result.error.message); setData(null); return;
    }
    setMissing(false); setData(result.data as Analytics);
  }, [db, days, sample]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <div className="admin-stack an-root">
    <AdminHeaderActions>
      <div className="admin-segment" role="group" aria-label="Khoảng thời gian">{ranges.map((value) => <button type="button" key={value} aria-pressed={days === value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{value} ngày</button>)}</div>
      <button type="button" className="button subtle" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Làm mới</button>
    </AdminHeaderActions>
    {sample && <AdminNotice tone="warning">Đang xem <b>dữ liệu mẫu</b> để duyệt giao diện. Số liệu thật sẽ hiện sau khi áp dụng migration <code>site_analytics</code>.</AdminNotice>}
    {missing && !sample && <AdminNotice tone="warning"><b>Chưa bật ghi lượt truy cập.</b> Database chưa có bảng <code>site_events</code> (migration <code>202611140003_site_analytics.sql</code>). Sau khi áp dụng, mọi lượt xem trang và đăng nhập mới sẽ được ghi.{process.env.NODE_ENV !== "production" && <> <button type="button" className="an-inline-button" onClick={() => setSample(true)}>Xem với dữ liệu mẫu</button></>}</AdminNotice>}
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    {loading && !data ? <section className="card admin-card"><LoadingBlock label="Đang tải số liệu truy cập…" /></section> : data && <Report data={data} />}
  </div>;
}

function delta(current: number, previous: number) {
  if (!previous) return current ? { label: "mới", tone: "up" } : null;
  const change = Math.round((current - previous) / previous * 100);
  return { label: `${change > 0 ? "+" : ""}${change}%`, tone: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

function Kpi({ icon: Icon, label, value, hint, change, tone = "teal" }: { icon: typeof Eye; label: string; value: number; hint: React.ReactNode; change?: { label: string; tone: string } | null; tone?: string }) {
  return <article className={`admin-stat tone-${tone} an-kpi`}>
    <span className="admin-stat-icon"><Icon size={18} aria-hidden="true" /></span>
    <span className="admin-stat-label">{label}</span>
    <strong>{fmt(value)}{change && <em className={`an-delta is-${change.tone}`} title="So với cùng số ngày liền trước">{change.label}</em>}</strong>
    <small>{hint}</small>
  </article>;
}

function Report({ data }: { data: Analytics }) {
  const s = data.summary, p = data.previous;
  const guestShare = s.visitors ? Math.round(s.guestVisitors / s.visitors * 100) : 0;
  const pagesPerVisit = s.visits ? (s.pageViews / s.visits).toFixed(1) : "0";
  return <>
    <div className="an-kpis">
      <Kpi icon={Eye} label="Lượt xem trang" value={s.pageViews} change={delta(s.pageViews, p.pageViews)} hint={`${pagesPerVisit} trang mỗi lượt`} />
      <Kpi icon={MousePointerClick} tone="sky" label="Lượt truy cập" value={s.visits} change={delta(s.visits, p.visits)} hint="Phiên, nghỉ 30 phút là lượt mới" />
      <Kpi icon={UsersRound} tone="amber" label="Người truy cập" value={s.visitors} change={delta(s.visitors, p.visitors)} hint={<><b className="an-key" style={{ background: C.orange }} />{fmt(s.guestVisitors)} khách · <b className="an-key" style={{ background: C.teal }} />{fmt(s.memberVisitors)} học viên</>} />
      <Kpi icon={Activity} tone="coral" label="Đang online" value={s.onlineNow} hint="Hoạt động trong 5 phút qua" />
      <Kpi icon={LogIn} tone="lavender" label="Lượt đăng nhập" value={s.signIns} change={delta(s.signIns, p.signIns)} hint={`${fmt(s.signInUsers)} tài khoản`} />
      <Kpi icon={UserPlus} label="Đăng ký mới" value={s.signups} change={delta(s.signups, p.signups)} hint={`Tổng ${fmt(s.totalMembers)} tài khoản`} />
      <Kpi icon={BookOpenCheck} tone="sky" label="Học viên có học" value={s.activeLearners} change={delta(s.activeLearners, p.activeLearners)} hint={`${fmt(s.learningEvents)} lượt học`} />
    </div>

    <section className="card admin-card">
      <AdminCardHead title="Lượt truy cập theo ngày" description={`${dayLabel(data.from)} – ${dayLabel(data.to)} · giờ Việt Nam. Rê chuột lên biểu đồ để xem từng ngày.`}>
        <Legend items={[["Lượt xem trang", C.teal, "area"], ["Lượt truy cập", C.violet, "line"]]} />
      </AdminCardHead>
      <TrafficChart daily={data.daily} />
    </section>

    <div className="an-grid">
      <section className="card admin-card">
        <AdminCardHead title="Khách và học viên" description={`${guestShare}% người truy cập chưa đăng nhập.`}><Legend items={[["Khách", C.orange, "box"], ["Học viên", C.teal, "box"]]} /></AdminCardHead>
        <StackedBars daily={data.daily} />
      </section>
      <section className="card admin-card">
        <AdminCardHead title="Giờ truy cập trong ngày" description="Lượt xem trang theo giờ, cộng dồn cả kỳ." />
        <HourStrip hours={data.hours} />
        <div className="an-split-bars">
          <ShareBar title="Thiết bị" parts={(Object.keys(deviceNames) as (keyof typeof deviceNames)[]).map((key) => [deviceNames[key], data.devices[key] ?? 0])} unit="người" />
          <ShareBar title="Khu vực được xem" parts={(Object.keys(areaNames) as (keyof typeof areaNames)[]).map((key) => [areaNames[key], data.areas[key] ?? 0])} unit="lượt" />
        </div>
      </section>
    </div>

    <section className="card admin-card">
      <AdminCardHead title="Đăng nhập, đăng ký và học bài" description="Mỗi cột là một ngày." />
      <div className="an-minis">
        <MiniBars title="Lượt đăng nhập" color={C.violet} values={data.daily.map((d) => [d.day, d.signIns])} total={s.signIns} />
        <MiniBars title="Đăng ký mới" color={C.orange} values={data.daily.map((d) => [d.day, d.signups])} total={s.signups} />
        <MiniBars title="Học viên có học" color={C.teal} values={data.daily.map((d) => [d.day, d.learners])} total={s.activeLearners} totalLabel="người khác nhau" />
      </div>
    </section>

    <div className="an-grid">
      <section className="card admin-card">
        <AdminCardHead title="Trang được xem nhiều nhất" count={data.topPages.length} />
        {data.topPages.length ? <div className="admin-table-wrap"><table className="admin-data-table an-table">
          <thead><tr><th scope="col">Trang</th><th scope="col">Lượt xem</th><th scope="col">Người xem</th><th scope="col">Khách</th></tr></thead>
          <tbody>{data.topPages.map((row) => <tr key={row.path}>
            <td><strong className="an-path">{row.path}</strong><small>{areaNames[row.area]}</small></td>
            <td><span className="an-cell-bar"><i style={{ width: `${row.views / data.topPages[0].views * 100}%` }} /><b>{fmt(row.views)}</b></span></td>
            <td className="is-num">{fmt(row.visitors)}</td>
            <td className="is-num">{row.views ? Math.round(row.guest_views / row.views * 100) : 0}%</td>
          </tr>)}</tbody>
        </table></div> : <p className="admin-empty-line">Chưa có lượt xem nào trong kỳ.</p>}
      </section>
      <div className="admin-stack">
        <section className="card admin-card">
          <AdminCardHead title="Nguồn truy cập" description="Trang web dẫn khách tới, tính theo lượt truy cập." />
          {data.referrers.length ? <ul className="an-rank">{data.referrers.map((row) => <li key={row.host}><span>{row.host}</span><i style={{ width: `${row.visits / data.referrers[0].visits * 100}%` }} /><b>{fmt(row.visits)}</b></li>)}</ul> : <p className="admin-empty-line">Phần lớn truy cập vào thẳng hoặc từ ứng dụng.</p>}
        </section>
        <section className="card admin-card">
          <AdminCardHead title="Cách đăng nhập" />
          <ShareBar parts={(Object.keys(methodNames) as (keyof typeof methodNames)[]).map((key) => [methodNames[key], data.signInMethods[key] ?? 0])} unit="lượt" />
        </section>
      </div>
    </div>

    <div className="an-grid">
      <section className="card admin-card">
        <AdminCardHead title="Đăng nhập gần đây" count={data.recentSignIns.length} />
        {data.recentSignIns.length ? <ul className="an-people">{data.recentSignIns.map((row, index) => <li key={`${row.at}-${index}`}>
          <PersonLink id={row.user_id} name={row.display_name} />
          <span className="an-chip">{methodNames[row.method as keyof typeof methodNames] ?? row.method}</span>
          <small>{deviceNames[row.device as keyof typeof deviceNames] ?? row.device} · {timeLabel(row.at)}</small>
        </li>)}</ul> : <p className="admin-empty-line">Chưa có lượt đăng nhập trong kỳ.</p>}
      </section>
      <section className="card admin-card">
        <AdminCardHead title="Học viên hoạt động nhiều" description="Theo số trang đã xem trong kỳ." />
        {data.topMembers.length ? <ul className="an-people">{data.topMembers.map((row) => <li key={row.user_id}>
          <PersonLink id={row.user_id} name={row.display_name} />
          <span className="an-chip">{fmt(row.page_views)} trang · {fmt(row.visits)} lượt</span>
          <small>Lần cuối {timeLabel(row.last_seen)}</small>
        </li>)}</ul> : <p className="admin-empty-line">Chưa có học viên nào đăng nhập xem trang trong kỳ.</p>}
      </section>
    </div>

    <details className="card admin-card an-table-view">
      <summary>Bảng số liệu theo ngày</summary>
      <div className="admin-table-wrap"><table className="admin-data-table">
        <thead><tr><th scope="col">Ngày</th><th scope="col">Xem trang</th><th scope="col">Truy cập</th><th scope="col">Khách</th><th scope="col">Học viên</th><th scope="col">Đăng nhập</th><th scope="col">Đăng ký</th><th scope="col">Có học</th></tr></thead>
        <tbody>{[...data.daily].reverse().map((d) => <tr key={d.day}><td>{dayLabel(d.day)}</td>{[d.pageViews, d.visits, d.guests, d.members, d.signIns, d.signups, d.learners].map((v, i) => <td className="is-num" key={i}>{fmt(v)}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </>;
}

function PersonLink({ id, name }: { id: string | null; name: string | null }) {
  const label = name || (id ? "Học viên" : "Tài khoản đã xóa");
  const body = <><span aria-hidden="true">{label.replace(/^Mẫu · /, "").slice(0, 1).toUpperCase()}</span>{label}</>;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? <Link prefetch={false} href={`/admin/users/${id}`} className="an-person">{body}</Link> : <span className="an-person">{body}</span>;
}

function Legend({ items }: { items: [string, string, "area" | "line" | "box"][] }) {
  return <ul className="an-legend">{items.map(([label, color, shape]) => <li key={label}><i className={`is-${shape}`} style={{ color }} />{label}</li>)}</ul>;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const node = ref.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * step >= value) return f * step;
  return 10 * step;
}
function topRoundedBar(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function tickIndexes(n: number, count = 6) {
  if (n <= count) return [...Array(n).keys()];
  const step = (n - 1) / (count - 1);
  return [...Array(count).keys()].map((i) => Math.round(i * step));
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: [string, number, string][] }) {
  const left = Math.min(Math.max(x, 90), width - 90);
  return <div className="an-tooltip" style={{ left }} role="status">
    <b>{title}</b>
    {rows.map(([label, value, color]) => <span key={label}><i style={{ background: color }} /><strong>{fmt(value)}</strong>{label}</span>)}
  </div>;
}

function TrafficChart({ daily }: { daily: DailyPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 260, pad = { l: 44, r: 14, t: 14, b: 28 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...daily.map((d) => d.pageViews)));
  const x = (i: number) => pad.l + (daily.length === 1 ? iw / 2 : i / (daily.length - 1) * iw);
  const y = (v: number) => pad.t + ih - v / max * ih;
  const line = (key: "pageViews" | "visits") => daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");
  const area = `${line("pageViews")}L${x(daily.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const pick = (clientX: number, rect: DOMRect) => { const rel = (clientX - rect.left - pad.l) / iw; setHover(Math.min(daily.length - 1, Math.max(0, Math.round(rel * (daily.length - 1))))); };
  const point = hover === null ? null : daily[hover];
  const last = daily.length - 1;
  return <div ref={ref} className="an-chart" tabIndex={0} aria-label="Biểu đồ lượt xem trang và lượt truy cập theo ngày; dùng phím mũi tên để xem từng ngày"
    onKeyDown={(event) => { if (event.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? -1) + 1)); if (event.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? daily.length) - 1)); if (event.key === "Escape") setHover(null); }}
    onBlur={() => setHover(null)}>
    <svg width={width} height={height} role="img" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={pad.l} x2={width - pad.r} y1={y(max * f)} y2={y(max * f)} className={f ? "an-grid-line" : "an-axis"} /><text x={pad.l - 8} y={y(max * f) + 4} textAnchor="end" className="an-tick">{fmt(max * f)}</text></g>)}
      {tickIndexes(daily.length).map((i) => <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="an-tick">{dayLabel(daily[i].day)}</text>)}
      <path d={area} fill={C.teal} fillOpacity={0.13} />
      <path d={line("pageViews")} fill="none" stroke={C.teal} strokeWidth={2} strokeLinejoin="round" />
      <path d={line("visits")} fill="none" stroke={C.violet} strokeWidth={2} strokeLinejoin="round" />
      {point && hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="an-crosshair" />
        <circle cx={x(hover)} cy={y(point.pageViews)} r={4.5} fill={C.teal} stroke="#fff" strokeWidth={2} />
        <circle cx={x(hover)} cy={y(point.visits)} r={4.5} fill={C.violet} stroke="#fff" strokeWidth={2} /></g>}
      {!point && <circle cx={x(last)} cy={y(daily[last].pageViews)} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} />}
      <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={(event) => pick(event.clientX, (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())} onPointerLeave={() => setHover(null)} />
    </svg>
    {point && hover !== null && <Tooltip x={x(hover)} width={width} title={dayLabel(point.day)} rows={[["Lượt xem trang", point.pageViews, C.teal], ["Lượt truy cập", point.visits, C.violet], ["Khách", point.guests, C.orange], ["Học viên", point.members, C.teal]]} />}
  </div>;
}

function StackedBars({ daily }: { daily: DailyPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220, pad = { l: 36, r: 6, t: 10, b: 26 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...daily.map((d) => d.guests + d.members)));
  const band = iw / daily.length, bw = Math.max(2, Math.min(22, band * 0.68));
  const y = (v: number) => pad.t + ih - v / max * ih;
  const point = hover === null ? null : daily[hover];
  return <div ref={ref} className="an-chart">
    <svg width={width} height={height} aria-hidden="true">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad.l} x2={width - pad.r} y1={y(max * f)} y2={y(max * f)} className={f ? "an-grid-line" : "an-axis"} /><text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="an-tick">{fmt(max * f)}</text></g>)}
      {daily.map((d, i) => {
        const x = pad.l + i * band + (band - bw) / 2;
        const hm = d.members / max * ih, hg = d.guests / max * ih;
        const gap = hm > 0 && hg > 0 ? 2 : 0;
        return <g key={d.day} className={hover === i ? "is-hover" : ""} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
          <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent" />
          {hm > 0 && <path d={hg > 0 ? `M${x},${pad.t + ih}V${pad.t + ih - hm}H${x + bw}V${pad.t + ih}Z` : topRoundedBar(x, pad.t + ih - hm, bw, hm)} fill={C.teal} />}
          {hg > 0 && <path d={topRoundedBar(x, pad.t + ih - hm - hg, bw, Math.max(0, hg - gap))} fill={C.orange} />}
        </g>;
      })}
      {tickIndexes(daily.length, 5).map((i) => <text key={i} x={pad.l + i * band + band / 2} y={height - 8} textAnchor="middle" className="an-tick">{dayLabel(daily[i].day)}</text>)}
    </svg>
    {point && hover !== null && <Tooltip x={pad.l + hover * band + band / 2} width={width} title={dayLabel(point.day)} rows={[["Khách", point.guests, C.orange], ["Học viên", point.members, C.teal]]} />}
  </div>;
}

function MiniBars({ title, color, values, total, totalLabel = "trong kỳ" }: { title: string; color: string; values: [string, number][]; total: number; totalLabel?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 96, ih = height - 4;
  const max = Math.max(1, ...values.map(([, v]) => v));
  const band = width / values.length, bw = Math.max(2, Math.min(14, band * 0.7));
  const shown = hover === null ? null : values[hover];
  return <div className="an-mini">
    <div className="an-mini-head"><span>{title}</span><strong>{shown ? fmt(shown[1]) : fmt(total)}</strong><small>{shown ? dayLabel(shown[0]) : totalLabel}</small></div>
    <div ref={ref} className="an-chart">
      <svg width={width} height={height} aria-label={`${title} theo ngày`} role="img">
        <line x1={0} x2={width} y1={ih} y2={ih} className="an-axis" />
        {values.map(([day, v], i) => <g key={day} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
          <rect x={i * band} y={0} width={band} height={height} fill="transparent" />
          {v > 0 && <path d={topRoundedBar(i * band + (band - bw) / 2, ih - v / max * (ih - 6), bw, v / max * (ih - 6), 3)} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
        </g>)}
      </svg>
    </div>
  </div>;
}

function HourStrip({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  return <div className="an-hours">
    <div className="an-hours-cells">{hours.map((value, hour) => <span key={hour} tabIndex={0} style={{ background: `color-mix(in oklab, ${C.teal} ${Math.round(8 + value / max * 92)}%, #f1f2ee)` }} title={`${hour}:00–${hour}:59 · ${fmt(value)} lượt xem`} aria-label={`${hour} giờ: ${fmt(value)} lượt xem`} />)}</div>
    <div className="an-hours-axis">{[0, 6, 12, 18, 23].map((h) => <span key={h} style={{ left: `${(h + 0.5) / 24 * 100}%` }}>{h}h</span>)}</div>
    {hours.some(Boolean) && <p className="an-note">Cao điểm: <b>{peak}:00–{peak}:59</b> với {fmt(hours[peak])} lượt xem.</p>}
  </div>;
}

function ShareBar({ title, parts, unit }: { title?: string; parts: [string, number][]; unit: string }) {
  const total = parts.reduce((sum, [, v]) => sum + v, 0);
  const colors = [C.teal, C.orange, C.violet, "#8391a6"];
  return <div className="an-share">
    {title && <h3>{title}</h3>}
    <div className="an-share-bar" aria-hidden="true">{parts.map(([label, v], i) => v > 0 && <i key={label} style={{ flex: v, background: colors[i] }} />)}{!total && <i style={{ flex: 1, background: "#e7e6df" }} />}</div>
    <ul>{parts.map(([label, v], i) => <li key={label}><i style={{ background: colors[i] }} />{label}<b>{total ? Math.round(v / total * 100) : 0}%</b><small>{fmt(v)} {unit}</small></li>)}</ul>
  </div>;
}
