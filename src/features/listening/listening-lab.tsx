"use client";
/*
 * Listening Lab: a 28-module roadmap built on the Dictation Skill Lab recordings.
 * This file holds the roadmap and the mistake review; the study screens live in listening-lab-session.tsx.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpenCheck, Compass, Headphones, Map as MapIcon, RotateCcw, Sparkles, Target } from "lucide-react";
import type { GradedQuestion, PublicLesson } from "@/lib/dictation-skill-lab/lessons";
import { listeningModules, listeningTypeLabels } from "@/lib/listening-lab/curriculum";
import type { ListeningPhase } from "@/lib/listening-lab/plan";
import {
  BASE, errorPrefix, fetchLesson, phaseInfo, REVIEW_DELAY_MS, themeFor, usePrefixResults,
} from "./listening-lab-shared";
import { Breadcrumb, Evidence, ModulePage, PlacementPage } from "./listening-lab-session";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { StudyPath } from "@/features/self-study-path/study-path";
import { suggestedModule, useListeningPath } from "./listening-path";
import "./listening-lab.css";

export function ListeningLab() {
  const parts = usePathname().split("/").filter(Boolean);
  const moduleId = parts[3] === "module" ? parts[4] : undefined;
  if (parts[3] === "placement") return <PlacementPage />;
  if (parts[3] === "review") return <ReviewPage />;
  if (moduleId) return <ModulePage key={moduleId} id={moduleId} />;
  return <RoadmapPage />;
}

const themeStyle = (level: string) => ({ "--ll-tone": themeFor(level).tone, "--ll-soft": themeFor(level).soft }) as CSSProperties;
const isDue = (updatedAt?: string) => !updatedAt || new Date(updatedAt).getTime() + REVIEW_DELAY_MS <= Date.now();

/* ───────────────────────── Roadmap ───────────────────────── */

function RoadmapPage() {
  const { course, view, data } = useListeningPath();
  const streak = useLearnerStreak();
  if (!view || !data) return <div className="ll-page ll-roadmap"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const suggested = suggestedModule(data.placement);
  const due = Object.values(data.errors).filter((item) => item.correct === 0 && isDue(item.updatedAt)).length;
  // Placement, the mistake review and Dictation stay one click away; the path itself carries the order.
  const intro = <nav className="ll-path-actions ll-actions" aria-label="Lối tắt">
    <ActionCard href={`${BASE}/placement`} tone="sun" icon={<Compass size={20}/>} title={suggested ? `Đầu vào · gợi ý mô-đun ${suggested}` : "Làm bài đầu vào"}/>
    <ActionCard href={`${BASE}/review`} tone="coral" icon={<RotateCcw size={20}/>} title="Ôn lỗi của tôi" badge={due || undefined}/>
    <ActionCard href="/app/dictation" tone="teal" icon={<Headphones size={20}/>} title="Nghe chép Dictation"/>
  </nav>;

  return <StudyPath course={course} view={view} streak={streak?.current ?? 0} intro={intro}>
    <p className="sp-footnote"><Sparkles size={15} aria-hidden/> Bài nghe nguồn đang ở trạng thái bản nháp và cần giáo viên rà soát audio, đáp án, sơ đồ trước khi phát hành chính thức. Một mô-đun đạt khi bước Độc lập đúng từ 8/10 và bước Chuyển giao đúng từ 75%; mức 1.0–7.0+ là mức luyện nội bộ, không quy đổi sang band.</p>
  </StudyPath>;
}

function ActionCard({ href, tone, icon, title, badge }: { href: string; tone: string; icon: React.ReactNode; title: string; badge?: number }) {
  return <Link className={`ll-action is-${tone}`} href={href}><span className="ll-action-icon">{icon}</span><span className="ll-action-text"><strong>{title}</strong></span>{badge ? <span className="ll-badge">{badge}</span> : <ArrowRight className="ll-action-arrow" size={16}/>}</Link>;
}

/* ───────────────────────── Review ───────────────────────── */

function ReviewPage() {
  const errors = usePrefixResults(errorPrefix);
  const [filter, setFilter] = useState<"all" | "due" | "later">("all");
  const [open, setOpen] = useState("");
  const wrong = useMemo(() => Object.entries(errors ?? {}).filter(([, result]) => result.correct === 0)
    .map(([slug, result]) => { const [, , id, phase, lessonId, questionId] = slug.split(":"); return { slug, id, phase: phase as ListeningPhase, lessonId, questionId, updatedAt: result.updatedAt, due: isDue(result.updatedAt) }; })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), [errors]);
  const dueCount = wrong.filter((item) => item.due).length;
  const shown = wrong.filter((item) => filter === "all" || (filter === "due" ? item.due : !item.due));
  const groups = [...new Set(shown.map((item) => item.id))].map((id) => ({ unit: listeningModules.find((item) => item.id === id), id, items: shown.filter((item) => item.id === id) }));

  return <div className="ll-page ll-module" style={themeStyle("5.0–6.0")}>
    <Breadcrumb current="Ôn lỗi"/>
    <header className="ll-module-hero is-review">
      <div className="ll-module-badge"><BookOpenCheck size={26}/></div>
      <div className="ll-module-copy"><span className="ll-kicker">Ôn lỗi của tôi</span><h1>Quay lại đúng chỗ nghe sai</h1>
        <p>Mỗi câu sai được lưu kèm đoạn audio chứa đáp án. Nghe lại bằng chứng, rồi luyện kỹ năng đó với một bản ghi khác. Câu đến hạn sau 2 ngày.</p></div>
      <dl className="ll-facts"><div><dt>Câu sai</dt><dd>{wrong.length}</dd></div><div><dt>Đến hạn</dt><dd>{dueCount}</dd></div><div><dt>Mô-đun</dt><dd>{new Set(wrong.map((item) => item.id)).size}</dd></div></dl>
    </header>
    {errors === null ? <><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></> : !wrong.length
      ? <section className="ll-empty-state"><span><Target size={28}/></span><h2>Chưa có lỗi cần ôn</h2><p>Làm một mô-đun rồi nộp bài — câu sai sẽ xuất hiện ở đây cùng đoạn audio làm bằng chứng.</p><Link className="ll-btn ll-btn-primary" href={BASE}>Xem lộ trình <ArrowRight size={15}/></Link></section>
      : <>
        <div className="ll-typebar" role="group" aria-label="Lọc lỗi">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả<small>{wrong.length}</small></button>
          <button type="button" aria-pressed={filter === "due"} onClick={() => setFilter("due")}>Đến hạn ôn<small>{dueCount}</small></button>
          <button type="button" aria-pressed={filter === "later"} onClick={() => setFilter("later")}>Chưa đến hạn<small>{wrong.length - dueCount}</small></button>
        </div>
        {!groups.length && <p className="ll-empty">Không có câu nào trong mục này.</p>}
        {groups.map(({ unit, id, items }) => <section key={id} className="ll-review-group" style={themeStyle(unit?.level ?? "1.0–2.0")}>
          <header><span className="ll-number">{id}</span><div><strong>{unit?.title ?? `Mô-đun ${id}`}</strong><small>{items.length} câu sai · {unit ? themeFor(unit.level).name : ""}</small></div>
            <Link className="ll-btn" href={`${BASE}/module/${id}#${items[0].phase === "guided" ? "independent" : items[0].phase === "independent" ? "transfer" : "independent"}`}>Luyện bản ghi khác <ArrowRight size={15}/></Link></header>
          <ul>{items.map((item) => <li key={item.slug} className={open === item.slug ? "is-open" : ""}>
            <button type="button" onClick={() => setOpen((current) => current === item.slug ? "" : item.slug)} aria-expanded={open === item.slug}>
              <span className={`ll-due ${item.due ? "is-due" : ""}`}>{item.due ? "Đến hạn" : `Ôn từ ${new Date(new Date(item.updatedAt!).getTime() + REVIEW_DELAY_MS).toLocaleDateString("vi-VN")}`}</span>
              <span className="ll-review-meta"><b>{item.lessonId} · {item.questionId}</b><small>{phaseInfo[item.phase]?.label ?? item.phase}</small></span>
              <span className="ll-review-toggle">{open === item.slug ? "Ẩn" : "Xem bằng chứng"}</span>
            </button>
            {open === item.slug && <ReviewEvidence lessonId={item.lessonId} questionId={item.questionId}/>}
          </li>)}</ul>
        </section>)}
      </>}
  </div>;
}

function ReviewEvidence({ lessonId, questionId }: { lessonId: string; questionId: string }) {
  const [review, setReview] = useState<{ result: GradedQuestion; lesson: PublicLesson } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`/api/dictation/skill-lab/${lessonId}/grade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: lessonId.startsWith("FND2-") ? "practice" : "ielts", question_ids: [questionId], answers: {} }) })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Không tải được bằng chứng."); return body; }),
      fetchLesson(lessonId),
    ]).then(([gradeBody, lesson]) => {
      if (!gradeBody.results?.[0]) throw new Error("Câu hỏi này không còn trong bài nguồn.");
      if (alive) setReview({ result: gradeBody.results[0] as GradedQuestion, lesson });
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bằng chứng."); });
    return () => { alive = false; };
  }, [lessonId, questionId]);
  if (error) return <p className="ll-error" role="alert">{error}</p>;
  if (!review) return <div className="ll-review-evidence"><div className="ll-skeleton ll-skeleton-row"/></div>;
  const question = review.lesson.questions.find((item) => item.question_id === questionId);
  return <div className="ll-review-evidence">
    {question && <p className="ll-review-prompt"><small>{listeningTypeLabels[question.type] ?? question.type}</small>{question.prompt}</p>}
    <div className="ll-feedback-top"><strong><MapIcon size={14}/> {review.lesson.title}</strong><span>Đáp án: <b>{review.result.accepted_answers.join(" / ")}</b></span></div>
    {review.result.explanation_vi && <p>{review.result.explanation_vi}</p>}
    {review.result.evidence.map((item) => {
      const clip = review.lesson.turns.find((turn) => turn.source_turn_id === item.turn_id && turn.audio_url);
      return <Evidence key={item.turn_id} label={item.turn_id} text={item.text_en} translation={item.translation_vi} url={clip?.audio_url ?? null}/>;
    })}
  </div>;
}
