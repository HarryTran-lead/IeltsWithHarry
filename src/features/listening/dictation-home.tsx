"use client";
/*
 * Dictation home (/app/dictation): where to continue, this week's progress, quick ways in, the seven
 * Skill Lab stages and the other banks. Kept apart from the VOA player so the home loads only what it
 * shows: the shared Skill Lab catalog, the learner's saved results and two row counts.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, CalendarPlus, Check, Headphones, Keyboard, Map as MapIcon, Play, RotateCcw, Sparkles, Target, Timer, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { listPracticeResults } from "@/features/learning/practice-results";
import type { CatalogEntry } from "@/lib/dictation-skill-lab/lessons";
import { skillLabStages, skillLabStageOf, skillLabStageUrl } from "@/lib/dictation-skill-lab/stages";
import { DEFAULT_WEEKLY_GOAL, weekStart } from "@/lib/dictation-skill-lab/path";
import { useDemo } from "@/features/demo/demo-store";
import { todayISO } from "@/lib/demo-data";
import { fetchSkillLabCatalog } from "./skill-lab-catalog";
import "./dictation-home.css";

const BASE = "/app/dictation/banks/skill-lab";
/** Same keys as skill-lab-dictation.tsx and skill-lab-path.tsx (not imported, to keep the player out of this bundle). */
const DICTATION_PREFIX = "skill-lab-dictation:v2:";
const PLACEMENT = "skill-lab-placement:";
const GOAL = "skill-lab-goal:weekly";
const devPreview = process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES === "true";
const publicPreview = process.env.NEXT_PUBLIC_VOA_PREVIEW === "true";

type Saved = { correct: number; checked: number; total: number; updatedAt?: string };
type Personal = { dictation: Record<string, Saved>; placement: string; goal: number };

/** Decorative sound wave for the hero; the heights are fixed so server and client render the same. */
const WAVE = [18, 34, 52, 30, 64, 82, 46, 28, 58, 90, 70, 40, 24, 48, 76, 96, 62, 36, 22, 44, 68, 86, 54, 32, 20, 38, 60, 78, 50, 26];

function Ring({ share, size = 52, stroke = 5, children }: { share: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <span className="dh-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} strokeDasharray={`${Math.max(0, Math.min(1, share)) * length} ${length}`} opacity={share > 0 ? 1 : 0} />
      </svg>
      <span>{children}</span>
    </span>
  );
}

export function DictationHome() {
  const { addTask } = useDemo();
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [personal, setPersonal] = useState<Personal | null>(null);
  const [lastLesson, setLastLesson] = useState("");
  const [voaCount, setVoaCount] = useState<number | null>(null);
  const [quickCount, setQuickCount] = useState<number | null>(null);
  const [plannerState, setPlannerState] = useState<"idle" | "saving" | "added" | "error">("idle");

  useEffect(() => {
    let alive = true;
    fetchSkillLabCatalog().then((lessons) => {
      if (!alive) return;
      try { setLastLesson(window.localStorage.getItem("skill-lab-last-lesson") ?? ""); } catch { /* the home works without storage */ }
      setCatalog(lessons);
    })
      .catch((failure: unknown) => { if (alive) { setCatalog([]); setCatalogError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); } });
    Promise.all([listPracticeResults(DICTATION_PREFIX), listPracticeResults(PLACEMENT), listPracticeResults(GOAL)])
      .then(([dictation, placements, goals]) => {
        if (!alive) return;
        const latest = Object.entries(placements).sort(([, a], [, b]) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
        setPersonal({ dictation, placement: latest ? latest[0].slice(PLACEMENT.length) : "", goal: goals[GOAL]?.total || DEFAULT_WEEKLY_GOAL });
      })
      .catch(() => { if (alive) setPersonal({ dictation: {}, placement: "", goal: DEFAULT_WEEKLY_GOAL }); });
    // The home only needs how many VOA lessons and Quick clips are open, not the rows themselves.
    try {
      const db = createClient();
      const statuses = devPreview ? ["published", "preview", "uploaded"] : publicPreview ? ["published", "preview"] : ["published"];
      void db.from("voa_dictation_lessons").select("id", { count: "exact", head: true }).in("status", statuses).not("audio_object_key", "is", null)
        .then(({ count }) => { if (alive) setVoaCount(count ?? 0); });
      void db.from("dictation_clips").select("id", { count: "exact", head: true }).eq("bank", "quick").in("status", ["preview", "published"])
        .then(({ count }) => { if (alive) setQuickCount(count ?? 0); });
    } catch { void Promise.resolve().then(() => { if (alive) { setVoaCount(0); setQuickCount(0); } }); /* demo mode without Supabase */ }
    return () => { alive = false; };
  }, []);

  const view = useMemo(() => {
    if (!catalog) return null;
    const results = personal?.dictation ?? {};
    const saved = (lesson: CatalogEntry) => results[`${DICTATION_PREFIX}${lesson.lesson_id}`];
    const isDone = (lesson: CatalogEntry) => (saved(lesson)?.correct ?? 0) >= lesson.turns;
    const ready = catalog.filter((lesson) => lesson.audio_ready);
    const since = weekStart().toISOString();
    const stages = skillLabStages.map((stage) => {
      const lessons = ready.filter((lesson) => skillLabStageOf(lesson) === stage.id);
      const done = lessons.filter(isDone).length;
      const started = lessons.some((lesson) => saved(lesson)?.checked);
      return { ...stage, count: lessons.length, done, started, sentences: lessons.reduce((sum, lesson) => sum + lesson.turns, 0), next: lessons.find((lesson) => !isDone(lesson)) };
    });
    const suggested = skillLabStages.some((stage) => stage.id === personal?.placement) ? personal!.placement : "";
    const last = ready.find((lesson) => lesson.lesson_id === lastLesson && !isDone(lesson));
    const current = stages.find((stage) => stage.started && stage.next) ?? stages.find((stage) => stage.id === suggested && stage.next) ?? stages.find((stage) => stage.next);
    const next = last ?? current?.next;
    return {
      stages, suggested, next, resuming: Boolean(last),
      nextStage: next ? stages.find((stage) => stage.id === skillLabStageOf(next)) : undefined,
      lessonsDone: ready.filter(isDone).length,
      sentencesPassed: ready.reduce((sum, lesson) => sum + Math.min(lesson.turns, saved(lesson)?.correct ?? 0), 0),
      thisWeek: ready.filter((lesson) => isDone(lesson) && (saved(lesson)?.updatedAt ?? "") >= since).length,
    };
  }, [catalog, personal, lastLesson]);

  const goal = personal?.goal ?? DEFAULT_WEEKLY_GOAL;
  const loading = !view || !personal;
  const continueHref = view?.next ? `${BASE}/${view.next.lesson_id}` : BASE;

  async function addToPlanner() {
    setPlannerState("saving");
    try { await addTask({ title: "Dictation 15 phút", skill: "Listening", date: todayISO(), time: "", completed: false, priority: "Medium", lesson: "dictation" }); setPlannerState("added"); }
    catch { setPlannerState("error"); }
  }

  const banks = [
    { key: "voa", name: "VOA Learning English", tag: "Hội thoại · A1–B1", description: "Khóa Let’s Learn English: nghe từng câu theo mốc thời gian, có chế độ điền từ và nghe & đọc.", href: "/app/dictation/banks/voa", count: voaCount, unit: "bài" },
    { key: "quick", name: "Quick Dictation", tag: "Nâng cao · sách nói", description: "Câu đọc từ sách nói, nhiều từ khó. Chia bộ 20 câu từ ngắn đến dài.", href: "/app/dictation/banks/quick", count: quickCount, unit: "câu" },
  ].filter((bank) => bank.count !== 0);

  return (
    <main className="dh">
      <nav className="dh-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dashboard">Dashboard</Link><span aria-hidden>›</span><span>Dictation</span></nav>

      <section className="dh-hero" aria-labelledby="dh-title">
        <svg className="dh-wave" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden>
          {WAVE.map((height, index) => <rect key={index} x={index * 10 + 2} y={(100 - height) / 2} width="5" height={height} rx="2.5" />)}
        </svg>
        <div className="dh-hero-copy">
          <span className="dh-eyebrow"><Headphones size={14} aria-hidden /> DICTATION · NGHE CHÉP</span>
          <h1 id="dh-title">Nghe từng câu,{" "}<br /><em>chép từng từ.</em></h1>
          <p>Lộ trình 7 chặng từ âm dễ nhầm đến bài giảng Section 4. Mỗi ngày 15 phút, chấm từng từ ngay khi bạn gõ xong.</p>
          <div className="dh-hero-actions">
            <Link className="dh-cta" href={continueHref}>
              <span className="dh-cta-icon"><Play size={16} fill="currentColor" aria-hidden /></span>
              <span><b>{view?.resuming ? "Tiếp tục bài đang học" : view?.lessonsDone ? "Học bài tiếp theo" : "Bắt đầu lộ trình"}</b>
                <small>{loading ? "Đang tìm bài phù hợp…" : view?.next ? `${view.nextStage?.label} · ${view.next.title}` : "Xem bản đồ lộ trình"}</small></span>
              <ArrowRight size={18} aria-hidden />
            </Link>
            {!loading && !personal?.placement && <Link className="dh-ghost" href={`${BASE}/placement`}><Sparkles size={16} aria-hidden /> Làm bài xếp lớp 6 phút</Link>}
          </div>
          <ol className="dh-steps" aria-label="Cách học">
            <li><span>1</span>Nghe câu</li>
            <li><span>2</span>Gõ lại</li>
            <li><span>3</span>Đối chiếu từng từ</li>
          </ol>
        </div>

        <aside className="dh-stats" aria-label="Tiến độ của bạn">
          <div className="dh-week">
            <Ring share={loading ? 0 : (view?.thisWeek ?? 0) / goal} size={84} stroke={8}><b>{loading ? "–" : view?.thisWeek}</b><small>/{goal}</small></Ring>
            <div><strong>Mục tiêu tuần</strong><span>{loading ? "Đang tải…" : (view?.thisWeek ?? 0) >= goal ? "Đã đạt, giỏi lắm!" : `Còn ${goal - (view?.thisWeek ?? 0)} bài nữa`}</span>
              <Link href={BASE}>Đổi mục tiêu</Link></div>
          </div>
          <dl className="dh-numbers">
            <div><dt>Bài đã xong</dt><dd>{loading ? <i className="dh-skel-text" /> : view?.lessonsDone.toLocaleString("vi-VN")}</dd></div>
            <div><dt>Câu đã đạt</dt><dd>{loading ? <i className="dh-skel-text" /> : view?.sentencesPassed.toLocaleString("vi-VN")}</dd></div>
            <div><dt>{view?.suggested ? "Chặng gợi ý" : "Chặng đang học"}</dt><dd>{loading ? <i className="dh-skel-text" /> : view?.suggested || view?.nextStage?.id || "F1"}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="dh-actions" aria-label="Luyện nhanh">
        <Link className="dh-action is-quick" href="/app/dictation/practice">
          <span className="dh-action-icon"><Zap size={20} aria-hidden /></span>
          <span className="dh-action-text"><strong>Luyện nhanh 5 phút</strong><span>10 câu theo một kỹ năng: số, đánh vần, ngày tháng, chỉ đường…</span></span>
          <ArrowRight className="dh-action-arrow" size={18} aria-hidden />
        </Link>
        <Link className="dh-action is-review" href="/app/dictation/review">
          <span className="dh-action-icon"><RotateCcw size={20} aria-hidden /></span>
          <span className="dh-action-text"><strong>Sổ câu sai</strong><span>Câu chưa đạt ở mọi kho, chép lại đến khi đạt thì tự rời sổ.</span></span>
          <ArrowRight className="dh-action-arrow" size={18} aria-hidden />
        </Link>
        <Link className="dh-action is-mock" href="/app/listening/mock">
          <span className="dh-action-icon"><Timer size={20} aria-hidden /></span>
          <span className="dh-action-text"><strong>Đề Listening thi thử</strong><span>4 phần, 40 câu như phòng thi. Nghe một lần, nộp bài xem điểm.</span></span>
          <ArrowRight className="dh-action-arrow" size={18} aria-hidden />
        </Link>
        <button type="button" className={`dh-action is-plan${plannerState === "added" ? " is-done" : ""}`} disabled={plannerState === "saving" || plannerState === "added"} onClick={() => void addToPlanner()}>
          <span className="dh-action-icon">{plannerState === "added" ? <Check size={20} aria-hidden /> : <CalendarPlus size={20} aria-hidden />}</span>
          <span className="dh-action-text"><strong>{plannerState === "added" ? "Đã thêm vào Planner" : "Đặt lịch hôm nay"}</strong>
            <span>{plannerState === "saving" ? "Đang thêm…" : plannerState === "error" ? "Chưa thêm được, bấm để thử lại." : plannerState === "added" ? "Đánh dấu xong trong Planner để giữ chuỗi ngày học." : "Thêm “Dictation 15 phút” vào Planner hôm nay."}</span></span>
        </button>
      </section>

      <section className="dh-path" aria-labelledby="dh-path-title">
        <header className="dh-section-head">
          <div><span className="dh-kicker">IELTS SKILL LAB</span><h2 id="dh-path-title">Lộ trình 7 chặng</h2></div>
          <Link href={BASE}><MapIcon size={16} aria-hidden /> Bản đồ lộ trình & bài kiểm tra</Link>
        </header>
        {catalogError && <p className="dh-error" role="alert">{catalogError}</p>}
        {[{ title: "Nền tảng", hint: "Âm, số, câu ngắn", ids: ["F1", "F2", "F3"] }, { title: "IELTS Sections", hint: "Bốn phần của đề thi thật", ids: ["S1", "S2", "S3", "S4"] }].map((group) => (
          <div key={group.title} className="dh-group">
            <h3>{group.title}<small>{group.hint}</small></h3>
            <ol className={`dh-track dh-track-${group.ids.length}`}>
              {group.ids.map((id) => {
                const base = skillLabStages.find((stage) => stage.id === id)!;
                const stage = view?.stages.find((item) => item.id === id);
                if (!stage) return <li key={id} className="dh-stage is-loading"><span className="dh-skel dh-skel-node" /><span className="dh-skel dh-skel-line" /><span className="dh-skel dh-skel-line short" /></li>;
                const share = stage.count ? stage.done / stage.count : 0;
                const state = stage.count === 0 ? "soon" : stage.done >= stage.count ? "done" : stage.id === view?.suggested ? "suggested" : stage.started ? "active" : "open";
                const chip = { soon: "Đang tạo audio", done: "Hoàn thành", suggested: "Gợi ý cho bạn", active: "Đang học", open: "Sẵn sàng" }[state];
                return (
                  <li key={id} className={`dh-stage is-${state} is-${id.startsWith("F") ? "foundation" : "section"}`}>
                    {stage.count === 0 ? <div className="dh-stage-body" aria-disabled="true">
                      <div className="dh-stage-top"><Ring share={0}><b>{id}</b></Ring><span className="dh-chip">{chip}</span></div>
                      <strong>{base.label}</strong><span>{base.detail}</span>
                    </div> : <Link className="dh-stage-body" href={skillLabStageUrl(id)} aria-label={`${base.label}: ${base.detail}. ${stage.done}/${stage.count} bài xong`}>
                      <div className="dh-stage-top"><Ring share={share}>{state === "done" ? <Check size={18} aria-hidden /> : <b>{id}</b>}</Ring><span className="dh-chip">{chip}</span></div>
                      <strong>{base.label}</strong><span>{base.detail}</span>
                      <span className="dh-stage-foot"><span><b>{stage.done}</b>/{stage.count} bài · {stage.sentences.toLocaleString("vi-VN")} câu</span><ArrowRight size={16} aria-hidden /></span>
                    </Link>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      {banks.length > 0 && <section className="dh-banks" aria-labelledby="dh-banks-title">
        <header className="dh-section-head"><div><span className="dh-kicker">KHO MỞ RỘNG</span><h2 id="dh-banks-title">Thêm nguồn để nghe chép</h2></div></header>
        <div className="dh-bank-grid">
          {banks.map((bank) => (
            <Link key={bank.key} className={`dh-bank is-${bank.key}`} href={bank.href}>
              <span className="dh-bank-art" aria-hidden>{bank.key === "voa" ? <Headphones size={30} /> : <BookOpenCheck size={30} />}</span>
              <span className="dh-bank-text"><small>{bank.tag}</small><strong>{bank.name}</strong><span>{bank.description}</span></span>
              <span className="dh-bank-count">{bank.count === null ? <i className="dh-skel-text" /> : <><b>{bank.count.toLocaleString("vi-VN")}</b> {bank.unit}</>}<ArrowRight size={16} aria-hidden /></span>
            </Link>
          ))}
        </div>
      </section>}

      <aside className="dh-tips" aria-label="Phím tắt và quy tắc chấm">
        <span className="dh-tips-icon"><Keyboard size={18} aria-hidden /></span>
        <p><kbd>Enter</kbd> kiểm tra · <kbd>Ctrl</kbd> nghe lại · <kbd>Shift</kbd>+<kbd>Enter</kbd> xuống dòng</p>
        <p><Target size={15} aria-hidden /> Câu từ 6 từ trở xuống phải đúng 100%, câu dài hơn cần 80% và đúng từ trọng tâm.</p>
      </aside>
    </main>
  );
}
