"use client";
/*
 * Writing Task 2 Lab: 36 guided lessons (M112–M113 via the M123 package). The roadmap reuses the
 * Listening Lab layout so the self-study labs read as one product. It opens with a "start here" guide
 * and only the learner's current stage expanded, so a newcomer sees where to begin without scrolling 36 cards.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Eye, Lightbulb, ListChecks, PenLine, Play, Sparkles } from "lucide-react";
import { stageAbout } from "@/lib/writing-task2/guides";
import { TASK2_API, TASK2_BASE, drillSaved, essaySaved, questionTypeLabels, stageInfo, stageOrder, type Task2LessonSummary, type Task2Stage, type Task2State } from "@/lib/writing-task2/types";
import { CourseHome, CourseModulePage } from "./task2-course";
import { LessonPage } from "./task2-lesson";
import { loadAllTask2States } from "./task2-state";
import "@/features/listening/listening-lab.css";
import "./writing-task2.css";

export function WritingTask2Lab() {
  const parts = usePathname().split("/").filter(Boolean);
  if (parts[3] === "course") return parts[4] ? <CourseModulePage key={parts[4]} id={decodeURIComponent(parts[4])} /> : <LabHome />;
  return parts[3] ? <LessonPage key={parts[3]} id={decodeURIComponent(parts[3])} /> : <LabHome />;
}

/** The lab's two halves: the R01–R16 skills course (default) and the 36 prompt-based lessons. */
function LabHome() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "luyen-de" ? "lessons" : "course";
  const show = (next: "course" | "lessons") => router.replace(next === "lessons" ? `${TASK2_BASE}?tab=luyen-de` : TASK2_BASE, { scroll: false });
  return <div className="ll-page ll-roadmap t2-lab">
    <div className="t2-lab-tabs" role="tablist" aria-label="Writing Task 2 Lab">
      <button type="button" role="tab" aria-selected={tab === "course"} onClick={() => show("course")}><b>Khoá kỹ năng</b><small>16 chặng R01–R16</small></button>
      <button type="button" role="tab" aria-selected={tab === "lessons"} onClick={() => show("lessons")}><b>Luyện đề</b><small>36 bài theo đề</small></button>
    </div>
    {tab === "course" ? <CourseHome onLessons={() => show("lessons")}/> : <RoadmapPage />}
  </div>;
}

const themeStyle = (stage: Task2Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;
const typeLabel = (type: string) => questionTypeLabels[type] ?? type;
const levelKey = "writing-task2-level";

type LessonProgress = { drills: number; essay: boolean; started: boolean };
function progressOf(state: Task2State | undefined, stage: Task2Stage): LessonProgress {
  if (!state) return { drills: 0, essay: false, started: false };
  const drills = Object.keys(state.saved).filter((id) => drillSaved(state, id)).length;
  return { drills, essay: essaySaved(state, stage), started: drills > 0 || Boolean(state.essay.trim()) || Object.values(state.answers).some((text) => text.trim()) || Object.keys(state.peeked).length > 0 };
}
const complete = (lesson: Task2LessonSummary, progress: LessonProgress) => progress.essay && progress.drills >= lesson.drill_count;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

const howItWorks = [
  { icon: BookOpen, title: "Hiểu đề", text: "Đề hỏi gì, bẫy ở đâu, sẽ viết những câu nào." },
  { icon: Lightbulb, title: "Học cách làm", text: "Các bước tư duy và câu mẫu trước khi tự viết." },
  { icon: Sparkles, title: "Luyện từng câu", text: "Mỗi câu có cách làm, gợi ý 3 bậc, đáp án mẫu." },
  { icon: PenLine, title: "Viết và tự kiểm", text: "Ghép các câu đã viết thành bài, so với bài mẫu." },
];

function RoadmapPage() {
  const [lessons, setLessons] = useState<Task2LessonSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, Task2State>>({});
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [level, setLevel] = useState<Task2Stage | "">("");
  const [opened, setOpened] = useState<Partial<Record<Task2Stage, boolean>>>({});

  useEffect(() => {
    let alive = true;
    void getJson<{ lessons: Task2LessonSummary[] }>(TASK2_API).then(async ({ lessons: list }) => {
      if (!alive) return;
      try { const saved = localStorage.getItem(levelKey); if (saved && stageOrder.includes(saved as Task2Stage)) setLevel(saved as Task2Stage); } catch { /* no saved level */ }
      setLessons(list);
      const saved = await loadAllTask2States(list.map((lesson) => lesson.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const progress = useMemo(() => Object.fromEntries((lessons ?? []).map((lesson) => [lesson.id, progressOf(states[lesson.id], lesson.stage)])), [lessons, states]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lesson of lessons ?? []) counts.set(lesson.question_type, (counts.get(lesson.question_type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [lessons]);

  if (error) return <p className="ll-error" role="alert">{error}</p>;
  if (!lessons) return <><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></>;

  const number = (id: string) => String(lessons.findIndex((lesson) => lesson.id === id) + 1).padStart(2, "0");
  const done = lessons.filter((lesson) => complete(lesson, progress[lesson.id])).length;
  const anyStarted = lessons.some((lesson) => progress[lesson.id].started);
  const firstOpenIn = (stage: Task2Stage) => lessons.find((lesson) => lesson.stage === stage && !complete(lesson, progress[lesson.id]));
  const next = lessons.find((lesson) => progress[lesson.id].started && !complete(lesson, progress[lesson.id]))
    ?? (level && !anyStarted ? firstOpenIn(level) : undefined)
    ?? lessons.find((lesson) => !complete(lesson, progress[lesson.id])) ?? lessons[0];
  const drillsSaved = lessons.reduce((sum, lesson) => sum + progress[lesson.id].drills, 0);
  const essays = lessons.filter((lesson) => progress[lesson.id].essay).length;
  const visible = (lesson: Task2LessonSummary) => typeFilter === "all" || lesson.question_type === typeFilter;
  const isOpen = (stage: Task2Stage) => opened[stage] ?? (typeFilter !== "all" || stage === next.stage);

  function pickLevel(stage: Task2Stage) {
    setLevel(stage);
    try { localStorage.setItem(levelKey, stage); } catch { /* the choice still applies on this visit */ }
    setOpened((current) => ({ ...current, [stage]: true }));
    requestAnimationFrame(() => document.getElementById(`chang-${stageOrder.indexOf(stage) + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <>
    <header className="ll-hero t2-hero">
      <div className="ll-hero-copy">
        <h1>Viết Task 2 theo lộ trình, <em>từng bước một.</em></h1>
        <div className="ll-hero-actions">
          <Link className="ll-cta" href={`${TASK2_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{progress[next.id].started ? "Học tiếp" : done ? "Bài tiếp theo" : "Bắt đầu học"}</b><small>Bài {number(next.id)} · {next.topic} · {stageInfo[next.stage].name}</small></span>
            <ArrowRight size={18}/>
          </Link>
          <span className="ll-draft-pill" title="Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi chính thức">Thử nghiệm</span>
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={lessons.length}/><div><strong>Bài đã hoàn thành</strong><span>Còn {lessons.length - done} bài</span></div></div>
        <dl><div><dt>Câu luyện đã làm</dt><dd>{drillsSaved}</dd></div><div><dt>Bài viết đã lưu</dt><dd>{essays}</dd></div><div><dt>Có bài mẫu</dt><dd>{lessons.filter((lesson) => lesson.has_model_essay).length}</dd></div></dl>
      </div>
    </header>

    {!anyStarted && <section className="t2-start" aria-labelledby="t2-start-title">
      <div className="t2-start-how">
        <span className="ll-kicker">Bắt đầu ở đây</span>
        <h2 id="t2-start-title">Mỗi bài học đi qua 4 bước</h2>
        <ol>{howItWorks.map((item, i) => <li key={item.title}><span><item.icon size={17}/></span><div><b>{i + 1}. {item.title}</b><small>{item.text}</small></div></li>)}</ol>
        <p><Eye size={14}/> Bí ở câu nào cũng được xem đáp án mẫu. Xem xong, tự viết lại bằng lời của bạn mới tính là đã làm.</p>
      </div>
      <div className="t2-start-level">
        <h3>Bạn đang ở mức nào?</h3>
        <div role="radiogroup" aria-label="Chọn mức bắt đầu">{stageOrder.map((stage) => <button key={stage} type="button" role="radio" aria-checked={level === stage} style={themeStyle(stage)} onClick={() => pickLevel(stage)}>
          <b>{stageInfo[stage].name}</b><span>{stageAbout[stage].who_vi}</span>
        </button>)}</div>
        <small>Chưa chắc thì chọn Nền tảng. Bài dễ quá thì chuyển chặng lúc nào cũng được.</small>
      </div>
    </section>}

    <section className="ll-journey t2-journey" aria-labelledby="t2-journey-title">
      <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ lộ trình</span><h2 id="t2-journey-title">4 chặng, {lessons.length} bài</h2></div><small>Mức 1.0–7.5+ là mức luyện nội bộ, không phải band IELTS.</small></div>
      <ol className="ll-track-map">{stageOrder.map((stage, index) => {
        const units = lessons.filter((lesson) => lesson.stage === stage);
        const count = units.filter((lesson) => complete(lesson, progress[lesson.id])).length;
        const here = next.stage === stage;
        return <li key={stage} style={themeStyle(stage)} className={`${here ? "is-here" : ""} ${units.length && count === units.length ? "is-done" : ""}`}>
          <a href={`#chang-${index + 1}`} onClick={() => setOpened((current) => ({ ...current, [stage]: true }))}>
            <span className="ll-node">{units.length && count === units.length ? <Check size={16} strokeWidth={3}/> : index + 1}</span>
            <b>{stageInfo[stage].name}</b><small>{units[0]?.target_range} · {units.length} bài</small>
            <i aria-label={`${count}/${units.length} bài hoàn thành`}>{units.map((lesson) => <em key={lesson.id} className={complete(lesson, progress[lesson.id]) ? "is-on" : ""}/>)}</i>
            {here && <span className="ll-here">Bạn ở đây</span>}
          </a>
        </li>;
      })}</ol>
    </section>

    <div className="ll-typebar" role="group" aria-label="Lọc theo dạng đề">
      <span><ListChecks size={16}/> Dạng đề</span>
      <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tất cả<small>{lessons.length}</small></button>
      {typeCounts.map(([type, count]) => <button type="button" key={type} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{typeLabel(type)}<small>{count}</small></button>)}
    </div>

    {stageOrder.map((stage, index) => {
      const all = lessons.filter((lesson) => lesson.stage === stage);
      const units = all.filter(visible);
      if (!units.length) return null;
      const count = all.filter((lesson) => complete(lesson, progress[lesson.id])).length;
      const open = isOpen(stage);
      return <section className={`ll-stage t2-stage ${open ? "is-open" : ""}`} id={`chang-${index + 1}`} key={stage} style={themeStyle(stage)}>
        <header>
          <button type="button" className="t2-stage-toggle" aria-expanded={open} aria-controls={`chang-${index + 1}-list`} onClick={() => setOpened((current) => ({ ...current, [stage]: !open }))}>
            <span className="ll-stage-tag">Chặng {index + 1}</span>
            <h2>{stageInfo[stage].name}<small>{all[0].target_range}</small></h2>
            <span className="t2-stage-learn">{stageAbout[stage].learn_vi}</span>
            <span className="ll-stage-progress"><i><em style={{ width: `${(count / all.length) * 100}%` }}/></i>{count}/{all.length} xong</span>
            <ChevronDown className="t2-stage-chevron" size={18}/>
          </button>
        </header>
        {open && <div className="ll-grid" id={`chang-${index + 1}-list`}>{units.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} number={number(lesson.id)} progress={progress[lesson.id]} isNext={lesson.id === next.id}/>)}</div>}
      </section>;
    })}

    <aside className="ll-note"><Sparkles size={16}/><p>Đề và bài mẫu là tài liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Tiến độ ở đây không quy đổi sang band.</p></aside>
  </>;
}

function LessonCard({ lesson, number, progress, isNext }: { lesson: Task2LessonSummary; number: string; progress: LessonProgress; isNext: boolean }) {
  const done = complete(lesson, progress);
  const status = done ? { label: "Hoàn thành", cls: "is-done" } : isNext ? { label: progress.started ? "Đang học" : "Tiếp theo", cls: "is-next" } : progress.started ? { label: "Đang học", cls: "is-tried" } : null;
  return <Link href={`${TASK2_BASE}/${lesson.id}`} className={`ll-card ${isNext ? "is-next" : ""} ${done ? "is-done" : ""}`}>
    <div className="ll-card-top"><span className="ll-number">{number}</span>{status && <span className={`ll-status ${status.cls}`}>{status.label}</span>}</div>
    <strong>{lesson.topic}</strong>
    <p className="t2-card-prompt">{lesson.prompt_vi ?? lesson.prompt}</p>
    <div className="ll-card-types"><span>{typeLabel(lesson.question_type)}</span>{lesson.has_model_essay && <span className="t2-chip-model">Có bài mẫu</span>}{lesson.enriched && <span className="t2-chip-rich">Soạn chi tiết</span>}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label={`${progress.drills}/${lesson.drill_count} câu luyện, bài viết ${progress.essay ? "đã lưu" : "chưa lưu"}`}>
        {Array.from({ length: lesson.drill_count }, (_, index) => <i key={index} className={`t2-pip ${index < progress.drills ? "is-pass" : ""}`}/>)}
        <i className={`t2-pip-essay ${progress.essay ? "is-pass" : ""}`} title="Bài viết"/>
      </span>
      <small><Clock3 size={12}/> {lesson.minutes} phút</small>
      <ArrowRight size={16}/>
    </div>
  </Link>;
}

function Ring({ value, total }: { value: number; total: number }) {
  return <span className="ll-ring is-hero" role="img" aria-label={`${value}/${total} bài hoàn thành`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/>{value > 0 && <circle cx="22" cy="22" r="19" strokeDasharray={`${(value / total) * 119.4} 119.4`}/>}</svg>
    <span><b>{value}</b><small>/{total}</small></span>
  </span>;
}
