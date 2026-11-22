"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, ChartNoAxesColumn, CheckCircle2, Clock3, Flame, Target, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { plainText } from "@/lib/news/plain-text";
import { Sticker } from "@/components/stickers/stickers";

type RecentRead = { id: string; title: string; category: string; read_at: string; image_url: string | null };
type RailData = {
  readToday: number; readWeek: number; quizPassedToday: boolean; wordsReviewedToday: number;
  topics: { category: string; correct: number; total: number }[]; recent: RecentRead[];
};

const WEEK_GOAL = 5;
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function startOfDay(date = new Date()) { const day = new Date(date); day.setHours(0, 0, 0, 0); return day; }
function startOfWeek() { const day = startOfDay(); day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); return day; }
function localKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function readAgo(value: string) {
  const days = Math.floor((startOfDay().valueOf() - startOfDay(new Date(value)).valueOf()) / 86400000);
  return days <= 0 ? "Hôm nay" : days === 1 ? "Hôm qua" : `${days} ngày trước`;
}

/** The right-hand column of the Daily News home: streak, today's tasks, topic accuracy, recent reads and the weekly goal. */
export function NewsRail() {
  const db = useMemo(() => createClient(), []);
  const streak = useLearnerStreak();
  const [data, setData] = useState<RailData | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const today = startOfDay().toISOString();
      const week = startOfWeek().toISOString();
      const [weekReads, quizzes, reviews, attempts, recentReads] = await Promise.all([
        db.from("user_news_article_reads").select("read_at").gte("read_at", week).limit(500),
        db.from("news_auto_attempts").select("score,total").gte("submitted_at", today).limit(50),
        db.from("vocabulary_review_events").select("notebook_entry_id").gte("reviewed_at", today).limit(500),
        db.from("news_auto_attempts").select("article_id,score,total").order("submitted_at", { ascending: false }).limit(60),
        db.from("user_news_article_reads").select("article_id,read_at").order("read_at", { ascending: false }).limit(3),
      ]);
      const ids = [...new Set([...(attempts.data ?? []).map((row) => row.article_id), ...(recentReads.data ?? []).map((row) => row.article_id)])];
      const articles = ids.length ? await db.from("news_archive_catalog").select("id,title,category,image_url").in("id", ids) : null;
      const byId = new Map((articles?.data ?? []).map((row) => [row.id, row]));
      const topics = new Map<string, { correct: number; total: number }>();
      for (const attempt of attempts.data ?? []) {
        const category = byId.get(attempt.article_id)?.category;
        if (!category || !attempt.total) continue;
        const entry = topics.get(category) ?? { correct: 0, total: 0 };
        entry.correct += attempt.score; entry.total += attempt.total;
        topics.set(category, entry);
      }
      if (!active) return;
      setData({
        readToday: (weekReads.data ?? []).filter((row) => row.read_at >= today).length,
        readWeek: weekReads.data?.length ?? 0,
        quizPassedToday: (quizzes.data ?? []).some((row) => row.total > 0 && row.score / row.total >= 0.7),
        wordsReviewedToday: new Set((reviews.data ?? []).map((row) => row.notebook_entry_id)).size,
        topics: [...topics].map(([category, value]) => ({ category, ...value })).sort((a, b) => b.total - a.total).slice(0, 3),
        recent: (recentReads.data ?? []).flatMap((row) => { const article = byId.get(row.article_id); return article ? [{ id: row.article_id, title: plainText(article.title), category: article.category, image_url: article.image_url, read_at: row.read_at }] : []; }),
      });
    })();
    return () => { active = false; };
  }, [db]);

  // This week, Monday to Sunday, marked from the learner's activity days.
  const monday = startOfWeek();
  const todayKey = localKey(new Date());
  const activeDays = new Set((streak?.days ?? []).filter((day) => day.events > 0).map((day) => day.day));
  const week = WEEKDAYS.map((label, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); const key = localKey(date); return { label, key, done: activeDays.has(key), today: key === todayKey, future: key > todayKey }; });
  const current = streak?.current ?? 0;
  const tasks = [
    { label: "Đọc 1 bài Daily News", value: Math.min(1, data?.readToday ?? 0), goal: 1 },
    { label: "Làm quiz (≥ 70%)", value: data?.quizPassedToday ? 1 : 0, goal: 1 },
    { label: "Ôn ít nhất 3 từ mới", value: Math.min(3, data?.wordsReviewedToday ?? 0), goal: 3, href: "/app/vocabulary" },
  ];
  const tasksDone = tasks.filter((task) => task.value >= task.goal).length;
  const weekRead = data?.readWeek ?? 0;

  return <aside className="nx-rail" aria-label="Tiến độ Daily News">
    <section className="nx-rail-card nx-streak">
      <div className="nx-streak-head">
        <span className="nx-streak-flame" aria-hidden="true"><Flame /></span>
        <div><span>Chuỗi học tập</span><strong>{current > 0 ? <><b>{current}</b> ngày liên tiếp!</> : "Bắt đầu chuỗi hôm nay"}</strong></div>
      </div>
      <ol className="nx-week">
        {week.map((day) => <li key={day.key} className={day.done ? "is-done" : day.today ? "is-today" : day.future ? "is-future" : "is-missed"} aria-label={`${day.label}: ${day.done ? "đã học" : day.today ? "hôm nay" : day.future ? "chưa tới" : "nghỉ"}`}>
          <i>{day.done ? <Check strokeWidth={3} /> : day.today ? <Flame /> : null}</i><span>{day.label}</span>
        </li>)}
      </ol>
    </section>

    <section className="nx-rail-card nx-tasks">
      <header><span className="nx-rail-icon is-violet"><Target /></span><h2>Nhiệm vụ hôm nay</h2><em>{tasksDone}/{tasks.length}</em></header>
      <ul>
        {tasks.map((task) => { const done = task.value >= task.goal; const body = <><i className={done ? "is-done" : ""} aria-hidden="true">{done && <Check strokeWidth={3} />}</i><span>{task.label}</span><small>{task.value}/{task.goal}</small></>;
          return <li key={task.label} className={done ? "is-done" : ""}>{task.href && !done ? <Link href={task.href}>{body}</Link> : <div>{body}</div>}</li>; })}
      </ul>
    </section>

    <section className="nx-rail-card nx-topic-progress">
      <header><span className="nx-rail-icon is-blue"><ChartNoAxesColumn /></span><h2>Tiến độ chủ đề</h2></header>
      {data?.topics.length ? <ul>{data.topics.map((topic) => { const value = Math.round(topic.correct / topic.total * 100); return <li key={topic.category} title={`Đúng ${topic.correct}/${topic.total} câu quiz`}><span>{topic.category}</span><div><i style={{ width: `${Math.max(value, 3)}%` }} /></div><b>{value}%</b></li>; })}</ul>
        : <p className="nx-rail-empty">Làm quiz sau mỗi bài để xem tỉ lệ đúng theo từng chủ đề.</p>}
    </section>

    <section className="nx-rail-card nx-recent">
      <header><span className="nx-rail-icon is-teal"><Clock3 /></span><h2>Bài đã đọc gần đây</h2><Link href="/app/news/history">Xem tất cả <ArrowRight size={13} /></Link></header>
      {data?.recent.length ? <ul>{data.recent.map((item) => <li key={item.id}><Link href={`/app/news/${item.id}`}>
        <span className="nx-recent-art">{item.image_url ? <Image src={item.image_url} alt="" fill sizes="64px" unoptimized /> : <Sticker name="newspaper" size={30} tilt={-6} pop={false} />}</span>
        <span className="nx-recent-copy"><strong>{item.title}</strong><small>{readAgo(item.read_at)} · {item.category}</small></span>
        <CheckCircle2 className="nx-recent-check" aria-label="Đã đọc" />
      </Link></li>)}</ul> : <p className="nx-rail-empty">Bài bạn đọc xong sẽ hiện ở đây để đọc lại nhanh.</p>}
    </section>

    <section className="nx-rail-card nx-goal">
      <div><span><Trophy /> Mục tiêu tuần này</span><strong>Đọc {WEEK_GOAL} bài News</strong></div>
      <span className="nx-goal-target" aria-hidden="true"><Target /></span>
      <div className="nx-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={WEEK_GOAL} aria-valuenow={Math.min(weekRead, WEEK_GOAL)} aria-label="Bài đã đọc tuần này"><i style={{ width: `${Math.max(Math.min(weekRead / WEEK_GOAL, 1) * 100, 4)}%` }} /></div>
      <b className="nx-goal-count">{Math.min(weekRead, WEEK_GOAL)} / {WEEK_GOAL}</b>
    </section>
  </aside>;
}
