"use client";
/*
 * Listening Lab: a 28-module roadmap built on the Dictation Skill Lab recordings.
 * This file holds the roadmap and the mistake review; the study screens live in listening-lab-session.tsx.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpenCheck, Check, Clock3, Compass, Headphones, Layers, ListChecks, Map as MapIcon, Play, RotateCcw, Sparkles, Target } from "lucide-react";
import type { GradedQuestion, PublicLesson } from "@/lib/dictation-skill-lab/lessons";
import { listeningModules, listeningTypeLabels, type ListeningModule } from "@/lib/listening-lab/curriculum";
import type { ListeningPhase } from "@/lib/listening-lab/plan";
import {
  BASE, errorPrefix, fetchLesson, mastered, minutes, phaseInfo, phasePassed, phaseResult, phases, placementStartPrefix,
  REVIEW_DELAY_MS, stageLevels, themeFor, useModuleSummaries, usePrefixResults, type Progress,
} from "./listening-lab-shared";
import { Breadcrumb, Evidence, ModulePage, PlacementPage } from "./listening-lab-session";
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
const nextPhaseOf = (id: string, progress: Progress): ListeningPhase =>
  phases.find((phase) => !phaseResult(progress, id, phase)?.checked) ?? phases.find((phase) => !phasePassed(phaseResult(progress, id, phase), phase)) ?? "transfer";
const isDue = (updatedAt?: string) => !updatedAt || new Date(updatedAt).getTime() + REVIEW_DELAY_MS <= Date.now();

/* ───────────────────────── Roadmap ───────────────────────── */

function RoadmapPage() {
  const progress = usePrefixResults("listening-lab:v1:") ?? {};
  const placement = usePrefixResults(placementStartPrefix);
  const errors = usePrefixResults(errorPrefix);
  const summaries = useModuleSummaries();
  const [typeFilter, setTypeFilter] = useState("all");

  const suggested = useMemo(() => {
    const latest = Object.entries(placement ?? {}).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""))[0];
    return latest ? latest[0].slice(placementStartPrefix.length) : null;
  }, [placement]);
  const startIndex = Math.max(0, listeningModules.findIndex((item) => item.id === (suggested ?? "01")));
  const next = listeningModules.slice(startIndex).find((item) => !mastered(item.id, progress)) ?? listeningModules.find((item) => !mastered(item.id, progress)) ?? listeningModules.at(-1)!;
  const nextPhase = nextPhaseOf(next.id, progress);
  const started = phases.some((phase) => phaseResult(progress, next.id, phase)?.checked);

  const done = listeningModules.filter((item) => mastered(item.id, progress)).length;
  const attempts = Object.entries(progress).filter(([slug]) => /^listening-lab:v1:\d+:/.test(slug)).map(([, value]) => value);
  const checked = attempts.reduce((sum, item) => sum + item.checked, 0);
  const correct = attempts.reduce((sum, item) => sum + item.correct, 0);
  const wrong = Object.values(errors ?? {}).filter((item) => item.correct === 0);
  const due = wrong.filter((item) => isDue(item.updatedAt)).length;

  const typesOf = (unit: ListeningModule) => {
    const real = summaries[unit.id]?.types;
    return real ? Object.keys(real).filter((type) => real[type] > 0) : unit.types;
  };
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit of listeningModules) for (const type of (summaries[unit.id] ? Object.keys(summaries[unit.id].types) : unit.types)) counts.set(type, (counts.get(type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [summaries]);
  const visible = (unit: ListeningModule) => typeFilter === "all" || typesOf(unit).includes(typeFilter);

  return <div className="ll-page">
    <header className="ll-hero">
      <Wave/>
      <div className="ll-hero-copy">
        <span className="ll-eyebrow"><Headphones size={13}/> Listening Lab · bản thử nghiệm</span>
        <h1>Nghe theo lộ trình, <em>luyện đúng từng dạng</em></h1>
        <p>28 mô-đun qua 7 chặng — từ nhận âm, tên và số đến trọn Section 1–4. Mỗi mô-đun: nghe có hướng dẫn → luyện độc lập → chuyển giao sang bản ghi mới.</p>
        <div className="ll-hero-actions">
          <Link className="ll-cta" href={`${BASE}/module/${next.id}#${nextPhase}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{started ? "Học tiếp" : done ? "Mô-đun tiếp theo" : "Bắt đầu học"}</b><small>Mô-đun {next.id} · {next.title} · bước {phaseInfo[nextPhase].step}/3</small></span>
            <ArrowRight size={18}/>
          </Link>
          {!suggested && <Link className="ll-ghost" href={`${BASE}/placement`}><Compass size={16}/> Chưa biết bắt đầu từ đâu?</Link>}
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={28}/><div><strong>Mô-đun đã đạt</strong><span>Đạt khi độc lập ≥ 8/10 và chuyển giao ≥ 75%</span></div></div>
        <dl><div><dt>Câu đã làm</dt><dd>{checked}</dd></div><div><dt>Độ chính xác</dt><dd>{checked ? `${Math.round((correct / checked) * 100)}%` : "—"}</dd></div><div><dt>Lỗi đến hạn</dt><dd>{due}</dd></div></dl>
      </div>
    </header>

    <nav className="ll-actions" aria-label="Lối tắt">
      <ActionCard href={`${BASE}/placement`} tone="sun" icon={<Compass size={20}/>} title="Kiểm tra đầu vào" text={suggested ? `Đã làm · gợi ý bắt đầu mô-đun ${suggested}` : "12 câu · nghe một lượt · gợi ý chặng bắt đầu"}/>
      <ActionCard href={`${BASE}/review`} tone="coral" icon={<RotateCcw size={20}/>} title="Ôn lỗi của tôi" text={wrong.length ? `${wrong.length} câu sai · ${due} câu đến hạn ôn` : "Câu sai được lưu kèm đoạn audio làm bằng chứng"} badge={due || undefined}/>
      <ActionCard href="#luyen-theo-dang" tone="lav" icon={<Layers size={20}/>} title="Luyện theo dạng" text="Form, Note, MCQ, Map, Matching… chọn dạng bạn hay sai"/>
      <ActionCard href="/app/dictation" tone="teal" icon={<Headphones size={20}/>} title="Nghe chép Dictation" text="Cùng kho bản ghi — chép từng câu để luyện tai"/>
    </nav>

    <section className="ll-journey" aria-labelledby="ll-journey-title">
      <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ lộ trình</span><h2 id="ll-journey-title">7 chặng, 28 mô-đun</h2></div><small>Mức 1.0–7.0+ là mức luyện nội bộ, không phải band IELTS.</small></div>
      <ol className="ll-track-map">{stageLevels.map((level, index) => {
        const units = listeningModules.filter((item) => item.level === level);
        const count = units.filter((item) => mastered(item.id, progress)).length;
        const here = next.level === level;
        return <li key={level} style={themeStyle(level)} className={`${here ? "is-here" : ""} ${count === units.length ? "is-done" : ""}`}>
          <a href={`#chang-${index + 1}`}>
            <span className="ll-node">{count === units.length ? <Check size={16} strokeWidth={3}/> : index + 1}</span>
            <b>{level}</b><small>{themeFor(level).name}</small>
            <i aria-label={`${count}/${units.length} mô-đun đạt`}>{units.map((unit) => <em key={unit.id} className={mastered(unit.id, progress) ? "is-on" : ""}/>)}</i>
            {here && <span className="ll-here">Bạn ở đây</span>}
          </a>
        </li>;
      })}</ol>
    </section>

    <div id="luyen-theo-dang" className="ll-typebar" role="group" aria-label="Luyện theo dạng câu hỏi">
      <span><ListChecks size={16}/> Dạng câu hỏi</span>
      <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tất cả</button>
      {typeCounts.map(([type, count]) => <button type="button" key={type} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{listeningTypeLabels[type] ?? type}<small>{count}</small></button>)}
    </div>

    {stageLevels.map((level, index) => {
      const units = listeningModules.filter((item) => item.level === level && visible(item));
      if (!units.length) return null;
      const all = listeningModules.filter((item) => item.level === level);
      const count = all.filter((item) => mastered(item.id, progress)).length;
      return <section className="ll-stage" id={`chang-${index + 1}`} key={level} style={themeStyle(level)}>
        <header><span className="ll-stage-tag">Chặng {index + 1}</span><h2>{themeFor(level).name}<small>{level}</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(count / all.length) * 100}%` }}/></i>{count}/{all.length} đạt</span></header>
        <div className="ll-grid">{units.map((unit) => <ModuleCard key={unit.id} unit={unit} progress={progress} types={typesOf(unit)} isNext={unit.id === next.id} isSuggested={unit.id === suggested}
          size={summaries[unit.id] ? { questions: Object.values(summaries[unit.id].counts).reduce((a, b) => a + b, 0), minutes: minutes(summaries[unit.id].durationMs) } : undefined}/>)}</div>
      </section>;
    })}
    {typeFilter !== "all" && !listeningModules.some(visible) && <p className="ll-empty">Chưa có mô-đun nào dùng dạng này.</p>}

    <aside className="ll-note"><Sparkles size={16}/><p>Bài nghe nguồn đang ở trạng thái bản nháp và cần giáo viên rà soát audio, đáp án, sơ đồ trước khi phát hành chính thức. Kết quả tại đây là điểm luyện tập, không quy đổi sang band.</p></aside>
  </div>;
}

function ModuleCard({ unit, progress, types, isNext, isSuggested, size }: { unit: ListeningModule; progress: Progress; types: string[]; isNext: boolean; isSuggested: boolean; size?: { questions: number; minutes: number } }) {
  const done = mastered(unit.id, progress);
  const tried = phases.some((phase) => phaseResult(progress, unit.id, phase)?.checked);
  const status = done ? { label: "Đã đạt", cls: "is-done" } : isNext ? { label: tried ? "Đang học" : "Tiếp theo", cls: "is-next" } : isSuggested ? { label: "Gợi ý bắt đầu", cls: "is-suggested" } : tried ? { label: "Đang học", cls: "is-tried" } : null;
  return <Link href={`${BASE}/module/${unit.id}${tried && !done ? `#${nextPhaseOf(unit.id, progress)}` : ""}`} className={`ll-card ${isNext ? "is-next" : ""} ${done ? "is-done" : ""}`}>
    <div className="ll-card-top"><span className="ll-number">{unit.id}</span>{status && <span className={`ll-status ${status.cls}`}>{status.label}</span>}</div>
    <strong>{unit.title}</strong>
    <p>{unit.objective}</p>
    <div className="ll-card-types">{types.slice(0, 3).map((type) => <span key={type}>{listeningTypeLabels[type] ?? type}</span>)}{types.length > 3 && <span>+{types.length - 3}</span>}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label="Ba bước luyện">{phases.map((phase) => { const result = phaseResult(progress, unit.id, phase); const pass = phasePassed(result, phase);
        return <i key={phase} className={pass ? "is-pass" : result?.checked ? "is-tried" : ""} title={`${phaseInfo[phase].label}: ${result?.checked ? `${result.correct}/${result.checked}` : "chưa làm"}`}/>; })}</span>
      <small>{size ? <><Clock3 size={12}/> {size.questions} câu · {size.minutes} phút</> : `${unit.stages.join(" · ")}`}</small>
      <ArrowRight size={16}/>
    </div>
  </Link>;
}

function ActionCard({ href, tone, icon, title, text, badge }: { href: string; tone: string; icon: React.ReactNode; title: string; text: string; badge?: number }) {
  const body = <><span className="ll-action-icon">{icon}</span><span className="ll-action-text"><strong>{title}</strong><span>{text}</span></span>{badge ? <span className="ll-badge">{badge}</span> : <ArrowRight className="ll-action-arrow" size={16}/>}</>;
  return href.startsWith("#") ? <a className={`ll-action is-${tone}`} href={href}>{body}</a> : <Link className={`ll-action is-${tone}`} href={href}>{body}</Link>;
}

function Ring({ value, total }: { value: number; total: number }) {
  return <span className="ll-ring is-hero" role="img" aria-label={`${value}/${total} mô-đun đạt`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/>{value > 0 && <circle cx="22" cy="22" r="19" strokeDasharray={`${(value / total) * 119.4} 119.4`}/>}</svg>
    <span><b>{value}</b><small>/{total}</small></span>
  </span>;
}

function Wave() {
  const bars = [14, 26, 40, 22, 52, 34, 64, 30, 46, 72, 38, 56, 28, 44, 66, 34, 50, 24, 58, 36, 20, 42, 30, 16];
  return <svg className="ll-wave" viewBox="0 0 480 80" preserveAspectRatio="none" aria-hidden="true">{bars.map((height, index) => <rect key={index} x={index * 20 + 4} y={(80 - height) / 2} width="9" height={height} rx="4.5"/>)}</svg>;
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
