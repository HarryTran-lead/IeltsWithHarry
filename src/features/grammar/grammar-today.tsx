"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, Flag } from "lucide-react";
import { clockNow, dueLessons, flaggedQuestions, formatDue, MIXED_REVIEW_SIZE } from "@/lib/grammar/schedule";
import { reviewedCount, type GrammarLevel, type GrammarProgress } from "@/lib/grammar/types";
import { catalog, continueLesson, lessonHref, lessonTotal, nextLesson, ROOT } from "./grammar-catalog";
import { useGrammarProgress } from "./grammar-progress";
import "./grammar-tokens.css";
import "./grammar-today.css";

/** The three things worth doing today: continue a lesson, a spaced review that is due, and open mistakes. */
export function GrammarToday({ progress, level, compact = false }: { progress: GrammarProgress; level?: GrammarLevel; compact?: boolean }) {
  const now = clockNow();
  const current = level ? nextLesson(level, progress) : continueLesson(progress);
  const done = reviewedCount(progress[current.code]);
  const due = dueLessons(progress, now);
  const upcoming = Object.values(progress).map((lesson) => lesson.review?.due).filter((value): value is string => Boolean(value)).sort()[0];
  const mistakes = flaggedQuestions(progress).length;
  const dueTitle = due.length ? catalog.find((lesson) => lesson.code === due[0])?.title : "";
  return <section className={`gt ${compact ? "gt-compact" : ""}`} aria-label="Grammar hôm nay">
    <div className="gt-head"><span>{compact ? "GRAMMAR · HÔM NAY" : "HÔM NAY"}</span>{!compact && <h2>Việc nên làm trước</h2>}</div>
    <div className="gt-tiles">
      <Link className="gt-tile gt-main" href={lessonHref(current.code, progress[current.code])}>
        <BookOpen size={20} aria-hidden="true" /><span><small>{done ? "Tiếp tục bài" : "Bắt đầu bài"} {current.code}</small><strong>{current.title}</strong><em>{done ? `Đã làm ${done}/${lessonTotal(current)} câu` : "Đọc quy tắc rồi luyện 12 câu"}</em></span><ArrowRight size={16} aria-hidden="true" />
      </Link>
      {due.length ? <Link className="gt-tile gt-due" href={`${ROOT}/lesson/${due[0]}?stage=spaced_review`}>
        <CalendarClock size={20} aria-hidden="true" /><span><small>Ôn cách quãng</small><strong>{due.length} bài đến hạn</strong><em>{due[0]} · {dueTitle}</em></span><ArrowRight size={16} aria-hidden="true" />
      </Link> : <div className="gt-tile gt-idle"><CalendarClock size={20} aria-hidden="true" /><span><small>Ôn cách quãng</small><strong>Chưa có bài đến hạn</strong><em>{upcoming ? `Lần ôn tiếp theo: ${formatDue(upcoming, now)}` : "Học xong một bài để mở lịch ôn"}</em></span></div>}
      {mistakes ? <Link className="gt-tile gt-mistakes" href={`${ROOT}/review`}>
        <Flag size={20} aria-hidden="true" /><span><small>Sổ ôn</small><strong>{mistakes} câu cần ôn</strong><em>Ôn {Math.min(mistakes, MIXED_REVIEW_SIZE)} câu trộn nhiều bài</em></span><ArrowRight size={16} aria-hidden="true" />
      </Link> : <div className="gt-tile gt-idle"><Flag size={20} aria-hidden="true" /><span><small>Sổ ôn</small><strong>Chưa có câu sai</strong><em>Câu sai sẽ tự vào đây</em></span></div>}
    </div>
  </section>;
}

/** Dashboard version: loads Grammar progress on its own. */
export function GrammarTodayCard() {
  const { progress, ready } = useGrammarProgress();
  if (!ready) return null;
  return <div className="card gt-card"><GrammarToday progress={progress} compact /><Link className="gt-more" href={ROOT}>Mở lộ trình Grammar <ArrowRight size={14} /></Link></div>;
}
