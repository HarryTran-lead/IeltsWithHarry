"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Flag, Languages, LockKeyhole, Map, PenLine, RotateCcw, Search, Sprout, Star, Target, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import catalogJson from "@/data/grammar-editorial/catalog.json";
import { applyGrade, editorialId, grammarLevels, grammarTypeLabels, grammarWorlds, practiced, reviewedCount, type GrammarCatalogLesson, type GrammarGrade, type GrammarGuide, type GrammarLessonProgress, type GrammarMistake, type GrammarPracticeItem, type GrammarProgress, type GrammarResponse, type GrammarLevel } from "@/lib/grammar/types";
import "./grammar-garden.css";
import "./grammar-garden-layout.css";

const catalog = catalogJson as GrammarCatalogLesson[];
const ROOT = "/app/grammar";
const STORAGE = "ieltswithharry-grammar-v1";
const stages = ["guided", "independent", "mastery", "spaced_review"] as const;
const stageNames: Record<string, string> = { guided: "Có hướng dẫn", independent: "Tự luyện", mastery: "Vận dụng", spaced_review: "Ôn cách quãng" };
const lessonTotal = (lesson: GrammarCatalogLesson) => Object.values(lesson.counts).reduce((a, b) => a + b, 0);
const emptyLesson = (): GrammarLessonProgress => ({ theorySeen: false, responses: {}, updatedAt: new Date().toISOString() });

function useGrammarProgress() {
  const [progress, setProgress] = useState<GrammarProgress>({});
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [storageKey, setStorageKey] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      let db: ReturnType<typeof createClient> | null = null;
      let key = `${STORAGE}:demo`;
      if (!demoMode) {
        try {
          db = createClient();
          const { data, error } = await db.auth.getUser();
          if (error || !data.user) throw error ?? new Error("No authenticated user");
          key = `${STORAGE}:${data.user.id}`;
        } catch {
          if (active) { setSyncError("Không xác định được tài khoản để tải tiến độ. Vui lòng đăng nhập lại."); setReady(true); }
          return;
        }
      }
      let local: GrammarProgress = {};
      try { local = JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { /* ignore damaged cache */ }
      if (db) {
        try {
          const { data, error } = await db.from("grammar_study_progress").select("lesson_code,theory_seen,responses,updated_at");
          if (error) throw error;
          for (const row of data ?? []) {
            const remote = { theorySeen: row.theory_seen, responses: row.responses ?? {}, updatedAt: row.updated_at } as GrammarLessonProgress;
            if (!local[row.lesson_code] || remote.updatedAt > local[row.lesson_code].updatedAt) local[row.lesson_code] = remote;
          }
        } catch { if (active) setSyncError("Chưa tải được tiến độ từ tài khoản. Tiến độ trên thiết bị này vẫn có thể sử dụng."); }
      }
      if (active) { setStorageKey(key); setProgress(local); setReady(true); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(progress));
    if (demoMode || !Object.keys(progress).length) return;
    const timer = window.setTimeout(async () => {
      try {
        const db = createClient();
        const rows = Object.entries(progress).map(([lesson_code, value]) => ({
          lesson_code, theory_seen: value.theorySeen, responses: value.responses, updated_at: value.updatedAt,
        }));
        const { error } = await db.from("grammar_study_progress").upsert(rows, { onConflict: "user_id,lesson_code" });
        if (error) throw error;
        setSyncError("");
      } catch { setSyncError("Chưa đồng bộ được với tài khoản. Bài làm vẫn được lưu trên thiết bị này."); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [progress, ready, storageKey]);

  const update = useCallback((code: string, edit: (value: GrammarLessonProgress) => GrammarLessonProgress) => {
    setProgress((current) => {
      const value = edit(current[code] ?? emptyLesson());
      return { ...current, [code]: { ...value, updatedAt: new Date().toISOString() } };
    });
  }, []);
  return { progress, ready, syncError, update };
}

function countForLevel(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return { total: lessons.length, practiced: lessons.filter((lesson) => practiced(progress[lesson.code], lessonTotal(lesson))).length, started: lessons.filter((lesson) => progress[lesson.code]).length };
}
function nextLesson(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return lessons.find((lesson) => progress[lesson.code] && !practiced(progress[lesson.code], lessonTotal(lesson)))
    ?? lessons.find((lesson) => !practiced(progress[lesson.code], lessonTotal(lesson))) ?? lessons[0];
}
/** A lesson already started reopens at its first unanswered question. */
const lessonHref = (code: string, value?: GrammarLessonProgress) => `${ROOT}/lesson/${code}${value?.theorySeen || reviewedCount(value) ? "?resume=1" : ""}`;

/** Catalog groups now repeat each lesson's title, so a chapter is named by its first and last lesson unless they share a topic. */
function chapterName(lessons: GrammarCatalogLesson[]) {
  const groups = [...new Set(lessons.map((lesson) => lesson.group))];
  if (groups.length === 1 && lessons.length > 1) return groups[0];
  return lessons.length > 1 ? `${lessons[0].title} → ${lessons[lessons.length - 1].title}` : lessons[0]?.title ?? "";
}

function progressLabel(lesson: GrammarCatalogLesson, value?: GrammarLessonProgress) {
  const total = lessonTotal(lesson);
  const reviewed = reviewedCount(value);
  return reviewed >= total ? `Đã làm ${total}/${total}` : reviewed ? `Đã làm ${reviewed}/${total}` : value?.theorySeen ? "Đã học lý thuyết" : "Chưa bắt đầu";
}

export function GrammarGarden() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { progress, ready, syncError, update } = useGrammarProgress();
  const parts = pathname.split("/");
  const route = parts[3] ?? "";
  const level = grammarLevels.includes(parts[4] as GrammarLevel) ? parts[4] as GrammarLevel : "A1";
  const [query, setQuery] = useState("");
  return <div className="gg" id="che-do-hoc">
    {syncError && <div className="gg-sync" role="status">{syncError}</div>}
    {route === "lesson" ? (ready ? <LessonWorkspace key={parts[4]} code={parts[4]} progress={progress} update={update} initialTab={searchParams.get("tab") === "practice" ? "practice" : "theory"} initialStage={searchParams.get("stage") ?? "guided"} initialItem={searchParams.get("item") ?? ""} resume={searchParams.has("resume")} /> : <div className="gg-loading">Đang tải tiến độ…</div>)
      : route === "review" ? <ReviewPage progress={progress} />
      : route === "progress" ? <ProgressPage progress={progress} />
      : route === "tests" ? <TestsPage />
      : <><div className="gg-crumb"><Link href={ROOT}><Sprout size={17} /> Grammar</Link><ChevronRight size={15} /><span>{level}</span><a className="gg-world-switch" href="#gg-worlds"><Map size={16} /> Đổi cấp độ</a></div>
        <div className="gg-layout"><main className="gg-main"><Roadmap level={level} progress={progress} query={query} setQuery={setQuery} ready={ready} chapterQuery={searchParams.get("chapter")} /></main><aside className="gg-aside"><SidebarProgress level={level} progress={progress} /></aside></div></>}
  </div>;
}

function Roadmap({ level, progress, query, setQuery, ready, chapterQuery }: { level: GrammarLevel; progress: GrammarProgress; query: string; setQuery: (value: string) => void; ready: boolean; chapterQuery: string | null }) {
  const router = useRouter();
  const lessons = catalog.filter((lesson) => lesson.level === level);
  const chapters = Math.ceil(lessons.length / 5);
  const chapter = Math.min(chapters, Math.max(1, Math.floor(Number(chapterQuery) || 1)));
  const chapterLessons = lessons.slice((chapter - 1) * 5, chapter * 5);
  const completed = chapterLessons.filter((lesson) => practiced(progress[lesson.code], lessonTotal(lesson))).length;
  const world = grammarWorlds[level];
  const found = query.trim() ? lessons.filter((lesson) => `${lesson.code} ${lesson.title} ${lesson.group}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <><section className="gg-hero"><div className="gg-hero-copy"><span className="gg-eyebrow">WORLD {grammarLevels.indexOf(level) + 1} · {level}</span><h1>{world.name}</h1><p>Chương {chapter}: {chapterName(chapterLessons) || world.description}</p><div className="gg-hero-metric"><span>{completed}/{chapterLessons.length} bài đã làm đủ</span><span>{Math.round(completed / chapterLessons.length * 100)}%</span></div><div className="gg-meter"><span style={{ width: `${completed / chapterLessons.length * 100}%` }} /></div></div><div className="gg-hero-symbol" aria-hidden="true">{world.icon}</div></section>
    <div className="gg-roadmap-toolbar"><div><h2><BookOpen size={22} /> Hành trình chương {chapter}</h2><p>{chapterLessons.length} bài · {chapterLessons.reduce((sum, lesson) => sum + lessonTotal(lesson), 0)} câu luyện tập. Bấm một bài để bắt đầu.</p></div><div className="gg-chapter-controls"><Link href={`${ROOT}/level/${level}?chapter=${chapter - 1}`} aria-disabled={chapter === 1}><ChevronLeft size={18} /></Link><select aria-label="Chọn chương" value={chapter} onChange={(event) => router.push(`${ROOT}/level/${level}?chapter=${event.target.value}`)}>{Array.from({ length: chapters }, (_, index) => <option value={index + 1} key={index}>Chương {index + 1}</option>)}</select><Link href={`${ROOT}/level/${level}?chapter=${chapter + 1}`} aria-disabled={chapter === chapters}><ChevronRight size={18} /></Link></div></div>
    <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${level} (${lessons.length} bài)...`} aria-label="Tìm bài Grammar" />{query && <button onClick={() => setQuery("")}>Xóa</button>}</div>
    {query.trim() ? <div className="gg-results">{found.length ? found.map((lesson) => <Link key={lesson.code} href={lessonHref(lesson.code, progress[lesson.code])}><span>{lesson.code}</span><strong>{lesson.title}</strong><small>{progressLabel(lesson, progress[lesson.code])}</small><ArrowRight size={16} /></Link>) : <p>Không tìm thấy bài phù hợp.</p>}</div> : <div className="gg-map" aria-label={`Bản đồ chương ${chapter}`}><div className="gg-map-shade" />{chapterLessons.map((lesson, index) => <Link className={`gg-map-card gg-map-card-${index + 1} ${practiced(progress[lesson.code], lessonTotal(lesson)) ? "done" : ""}`} key={lesson.code} href={lessonHref(lesson.code, progress[lesson.code])}><span className="gg-map-icon">{practiced(progress[lesson.code], lessonTotal(lesson)) ? <Check size={25} /> : <BookOpen size={23} />}</span><span className="gg-map-label"><small>{lesson.code} · {lessonTotal(lesson)} câu</small><strong>{lesson.title}</strong><em>{progressLabel(lesson, progress[lesson.code])}</em></span><ChevronRight className="gg-map-chevron" size={17} /></Link>)}<Link className="gg-checkpoint" href={`${ROOT}/lesson/${chapterLessons[0]?.code}?tab=practice&stage=mastery`}><Target size={20} /><span><strong>Vận dụng trong bài</strong><small>Câu Mastery theo từng bài</small></span></Link></div>}
    <div className="gg-worlds" id="gg-worlds">{grammarLevels.map((item) => { const counts = countForLevel(item, progress); return <Link className={item === level ? "selected" : ""} href={`${ROOT}/level/${item}`} key={item}><span>{grammarWorlds[item].icon}</span><strong>{item}</strong><small>{grammarWorlds[item].name}<br />{ready ? `${counts.practiced}/${counts.total} bài đã làm đủ` : `${counts.total} bài`}</small></Link>; })}</div>
    <div className="gg-preview-note">Dữ liệu đang là bản nháp biên tập, chưa được xác nhận để cấp chứng nhận năng lực. Kết quả chỉ giúp tự luyện và tìm câu cần ôn.</div></>;
}

function SidebarProgress({ level, progress }: { level: GrammarLevel; progress: GrammarProgress }) {
  const counts = countForLevel(level, progress);
  const current = nextLesson(level, progress);
  const currentProgress = progress[current.code];
  const needsReview = Object.entries(progress).filter(([code]) => code.startsWith(level)).flatMap(([, entry]) => Object.entries(entry.responses)).filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW").length;
  return <><section className="gg-side-card"><h3>Tiến độ cấp độ {level}</h3><div className="gg-side-progress"><span>{counts.practiced}/{counts.total} bài đã làm đủ</span><strong>{Math.round(counts.practiced / counts.total * 100)}%</strong></div><div className="gg-meter"><span style={{ width: `${counts.practiced / counts.total * 100}%` }} /></div><div className="gg-side-stats"><div><Star size={22} /><strong>{counts.started}</strong><small>Bài đã mở</small></div><div><BookOpen size={22} /><strong>{counts.practiced}</strong><small>Đã làm đủ</small></div><div><Target size={22} /><strong>{needsReview}</strong><small>Cần ôn</small></div></div></section>
    <section className="gg-side-card"><div className="gg-side-head"><h3>Tiếp tục học</h3><Link href={`${ROOT}/progress`}>Xem tiến độ <ArrowRight size={14} /></Link></div><div className="gg-current"><span><BookOpen size={25} /></span><div><small>{current.code}</small><strong>{current.title}</strong><p>{current.formula}</p></div></div><Link className="gg-primary" href={lessonHref(current.code, currentProgress)}>Tiếp tục học <ArrowRight size={17} /></Link><div className="gg-steps"><div><BookOpen size={17} /><span>Lý thuyết</span><strong>{currentProgress?.theorySeen ? "Đã đọc" : "Chưa đọc"}</strong></div><div><PenLine size={17} /><span>Câu đã làm</span><strong>{reviewedCount(currentProgress)}/{lessonTotal(current)}</strong></div></div></section>
    <section className="gg-side-card"><h3>Sổ câu cần ôn</h3><p className="gg-side-foot">Những câu trả lời sai được đưa vào sổ ôn.</p><Link className="gg-primary" href={`${ROOT}/review`}>Mở sổ ôn <ArrowRight size={17} /></Link></section></>;
}

function LessonWorkspace({ code, progress, update, initialTab, initialStage, initialItem, resume }: { code: string; progress: GrammarProgress; update: (code: string, edit: (value: GrammarLessonProgress) => GrammarLessonProgress) => void; initialTab: "theory" | "practice"; initialStage: string; initialItem: string; resume: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"theory" | "practice">(initialItem || resume || initialStage !== "guided" ? "practice" : initialTab);
  const [stage, setStage] = useState(stages.includes(initialStage as typeof stages[number]) ? initialStage : "guided");
  const [data, setData] = useState<{ guide: GrammarGuide; items: GrammarPracticeItem[] } | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  // Progress is loaded before this mounts; the ref lets the fetch pick the resume point without refetching on every answer.
  const startProgress = useRef(progress[code]);
  useEffect(() => {
    let active = true;
    fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("Không tải được bài học."); return response.json(); }).then((result: { guide: GrammarGuide; items: GrammarPracticeItem[] }) => {
      if (!active) return;
      setData(result);
      const answered = (item: GrammarPracticeItem) => ["UNDERSTOOD", "NEED_REVIEW"].includes(startProgress.current?.responses[item.id]?.status ?? "");
      const found = result.items.find((item) => item.id === initialItem) ?? (resume ? result.items.find((item) => !answered(item)) : undefined);
      if (found) { setStage(found.stage); setIndex(result.items.filter((item) => item.stage === found.stage).findIndex((item) => item.id === found.id)); }
    }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [code, initialItem, resume]);
  const items = useMemo(() => data?.items.filter((item) => item.stage === stage) ?? [], [data, stage]);
  if (error && !data) return <div className="gg-error"><p>{error}</p><Link href={ROOT}>Về lộ trình</Link></div>;
  if (!data) return <div className="gg-loading">Đang tải bài học…</div>;
  const { guide } = data;
  const lesson = catalog.find((item) => item.code === code);
  const lessonProgress = progress[code];
  const current = items[index];
  const response = (current && lessonProgress?.responses[current.id]) || { answer: "", updatedAt: "" };
  const editResponse = (patch: Partial<GrammarResponse>) => {
    if (!current) return;
    update(code, (value) => ({ ...value, responses: { ...value.responses, [current.id]: { ...(value.responses[current.id] ?? { answer: "", updatedAt: "" }), ...patch, updatedAt: new Date().toISOString() } } }));
  };
  const recordGrade = (grade: GrammarGrade, answer: string) => {
    if (!current) return;
    update(code, (value) => ({ ...value, responses: { ...value.responses, [current.id]: applyGrade(value.responses[current.id] ?? { answer: "", updatedAt: "" }, answer, grade, current.prompt) } }));
  };
  const nextStage = stages[stages.indexOf(stage as typeof stages[number]) + 1];
  const nextStageItems = nextStage ? data.items.filter((item) => item.stage === nextStage).length : 0;
  const nextLabel = index < items.length - 1 ? "Câu tiếp" : nextStageItems ? `Sang phần ${stageNames[nextStage]}` : "Về lộ trình";
  const goNext = () => {
    if (index < items.length - 1) setIndex(index + 1);
    else if (nextStageItems) { setStage(nextStage); setIndex(0); }
    else router.push(`${ROOT}/level/${lesson?.level ?? "A1"}`);
  };
  const levelLessons = catalog.filter((item) => item.level === lesson?.level);
  const next = levelLessons[levelLessons.findIndex((item) => item.code === code) + 1];
  return <div className="gg-lesson"><div className="gg-crumb"><Link href={`${ROOT}/level/${lesson?.level ?? "A1"}`}><ArrowLeft size={16} /> {lesson?.level} · Lộ trình</Link><ChevronRight size={15} /><span>{code}</span></div>
    <div className="gg-lesson-head"><div><span className="gg-eyebrow">{code} · BẢN NHÁP BIÊN TẬP</span><h1>{guide.title}</h1><p>{guide.overview || guide.objectives[0]}</p></div><span className="gg-lesson-score">{reviewedCount(lessonProgress)}/{data.items.length} câu đã làm</span></div>
    <div className="gg-lesson-tabs"><button className={tab === "theory" ? "active" : ""} onClick={() => setTab("theory")}><BookOpen size={17} /> Lý thuyết</button><button className={tab === "practice" ? "active" : ""} onClick={() => setTab("practice")}><PenLine size={17} /> Luyện tập · {data.items.length} câu</button></div>
    {tab === "theory" ? <Theory guide={guide} onDone={() => { update(code, (value) => ({ ...value, theorySeen: true })); setTab("practice"); }} />
      : <div className="gg-practice"><div className="gg-stage-tabs">{stages.map((item) => { const stageItems = data.items.filter((question) => question.stage === item); const done = stageItems.filter((question) => ["UNDERSTOOD", "NEED_REVIEW"].includes(lessonProgress?.responses[question.id]?.status ?? "")).length; return <button key={item} className={stage === item ? "active" : ""} onClick={() => { setStage(item); setIndex(0); }}>{stageNames[item]} <small>{done}/{stageItems.length}</small></button>; })}</div>
        {current && <><div className="gg-practice-top"><div><span className="gg-eyebrow">{stageNames[stage]} · {grammarTypeLabels[current.type] ?? current.type}</span><h2>Câu {index + 1} / {items.length}</h2></div><div className="gg-practice-bar"><span style={{ width: `${(index + 1) / items.length * 100}%` }} /></div></div>
          <QuestionCard key={current.id} code={code} item={current} response={response} guided={stage === "guided"} nextLabel={nextLabel}
            onAnswer={editResponse} onGraded={recordGrade} onNext={goNext}
            onRetry={() => editResponse({ answer: "", order: [], retrying: true })}
            onSkip={() => { if (!response.status) editResponse({ status: "SKIPPED" }); goNext(); }} />
          <div className="gg-practice-nav"><button disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} /> Câu trước</button><select value={index} onChange={(event) => setIndex(Number(event.target.value))} aria-label="Chọn câu luyện tập">{items.map((item, position) => { const status = lessonProgress?.responses[item.id]?.status; return <option key={item.id} value={position}>Câu {position + 1}{status === "NEED_REVIEW" ? " · cần ôn" : status === "UNDERSTOOD" ? " ✓" : ""}</option>; })}</select><button onClick={goNext}>{nextLabel} <ChevronRight size={16} /></button></div></>}</div>}
    <div className="gg-lesson-bottom"><Link href={`${ROOT}/review`}><Flag size={16} /> Sổ ôn</Link>{next && <Link href={`${ROOT}/lesson/${next.code}`}>Bài tiếp: {next.title} <ArrowRight size={16} /></Link>}</div></div>;
}

function MistakePair({ mistake }: { mistake: GrammarMistake }) {
  return <div className="gg-mistake"><span className="gg-bad"><X size={14} aria-label="Sai" /> {mistake.wrong}</span>{mistake.correct && <span className="gg-good"><Check size={14} aria-label="Đúng" /> {mistake.correct}</span>}{mistake.why && <small>{mistake.why}</small>}</div>;
}

function Theory({ guide, onDone }: { guide: GrammarGuide; onDone: () => void }) {
  return <div className="gg-theory">
    <div className="gg-callout"><strong>Mục tiêu</strong><ul>{guide.objectives.map((objective, i) => <li key={i}>{objective}</li>)}</ul></div>
    <div className="gg-guide-grid">{guide.sections.map((section, position) => <article key={position}><span>{String(position + 1).padStart(2, "0")}</span><h3>{section.heading}</h3>
      {section.formula && <p className="gg-formula">{section.formula}</p>}
      {section.explanation && <p>{section.explanation}</p>}
      {section.examples.map((example, i) => <p className="gg-example" key={i}><b>{example.en}</b>{example.vi && <span>{example.vi}</span>}</p>)}
      {section.points.length > 0 && <ul className="gg-points">{section.points.map((point, i) => <li key={i}>{point.text}{point.en && <span className="gg-example"><b>{point.en}</b>{point.vi && <span>{point.vi}</span>}</span>}</li>)}</ul>}
      {section.table && <div className="gg-table-wrap"><table className="gg-table"><thead><tr>{section.table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
      {section.mistake && <MistakePair mistake={section.mistake} />}
      {section.note && <p className="gg-note">{section.note}</p>}
    </article>)}</div>
    {guide.mistakes.length > 0 && <div className="gg-extra-notes"><h3>Lỗi thường gặp</h3>{guide.mistakes.map((mistake, i) => <MistakePair key={i} mistake={mistake} />)}</div>}
    {guide.caveats.length > 0 && <div className="gg-extra-notes"><h3>Lưu ý</h3><ul className="gg-points">{guide.caveats.map((caveat, i) => <li key={i}>{caveat}</li>)}</ul></div>}
    <div className="gg-theory-action"><button className="gg-primary" onClick={onDone}>Đã đọc lý thuyết · Luyện tập <ArrowRight size={17} /></button></div>
  </div>;
}

/** Same normalisation the server applies for case, apostrophes and final punctuation, used only to mark options. */
const sameAnswer = (a = "", b = "") => {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ").replace(/[‘’ʼ`]/g, "'").replace(/[.!?]+$/, "").toLowerCase();
  return clean(a) === clean(b);
};

function QuestionCard({ code, item, response, guided, nextLabel, onAnswer, onGraded, onNext, onRetry, onSkip }: {
  code: string; item: GrammarPracticeItem; response: GrammarResponse; guided: boolean; nextLabel: string;
  onAnswer: (patch: Partial<GrammarResponse>) => void; onGraded: (grade: GrammarGrade, answer: string) => void;
  onNext: () => void; onRetry: () => void; onSkip: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const [justGraded, setJustGraded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const graded = Boolean(response.referenceAnswer) && !response.retrying;
  const order = response.order ?? [];
  const ordering = item.chunks.length > 0;
  const answer = ordering ? order.map((position) => item.chunks[position]).join(" ") : response.answer;
  const tone = response.correct === true ? "right" : response.correct === false ? "wrong" : "neutral";

  async function submit() {
    if (!answer.trim() || checking || graded) return;
    setChecking(true);
    try {
      const result = await fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, answer }) });
      if (!result.ok) throw new Error("Không chấm được câu trả lời. Hãy thử lại.");
      onGraded(await result.json(), answer);
      setJustGraded(true);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được câu trả lời."); }
    finally { setChecking(false); }
  }

  // Keep the result and the next step in view; put the cursor back in the answer box for typed questions on desktop.
  useEffect(() => {
    if (graded && justGraded) { resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); continueRef.current?.focus({ preventScroll: true }); }
    else if (!graded && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [graded, justGraded]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement;
      if (event.key === "Enter") {
        if (target.closest("button, select, a, textarea")) return;
        event.preventDefault();
        if (graded) onNext(); else void submit();
      } else if (item.options && !graded && /^[1-9]$/.test(event.key) && !target.closest("input, textarea, select")) {
        const option = item.options[Number(event.key) - 1];
        if (option) onAnswer({ answer: option });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pick = (next: number[]) => onAnswer({ order: next, answer: next.map((position) => item.chunks[position]).join(" ") });
  const optionState = (option: string) => !graded ? (response.answer === option ? "selected" : "")
    : sameAnswer(option, response.referenceAnswer) ? "correct" : option === response.answer ? "wrong" : "";
  const missedFirst = graded && response.first?.correct === false && response.correct === true;

  return <>
    <div className="gg-question">
      {item.instruction && <small className="gg-instruction">{item.instruction}</small>}
      <p>{item.prompt}</p>
      {item.translation ? (showTranslation || graded ? <blockquote>{item.translation}</blockquote> : <button type="button" className="gg-reveal" onClick={() => setShowTranslation(true)}><Languages size={15} aria-hidden="true" /> Xem nghĩa tiếng Việt</button>)
        : code.startsWith("C2-") && <small>Bản dịch tiếng Việt đang được bổ sung.</small>}
      {item.hint && guided && <p className="gg-hint"><small>Gợi ý: {item.hint}</small></p>}
    </div>
    {item.options ? <div className="gg-options" role="group" aria-label="Chọn đáp án">{item.options.map((option, i) => { const state = optionState(option); return <button key={i} className={state} disabled={graded} aria-pressed={response.answer === option} onClick={() => onAnswer({ answer: option })}><span className="gg-option-key" aria-hidden="true">{i + 1}</span><span>{option}</span>{state === "correct" && <Check size={17} aria-label="Đáp án đúng" />}{state === "wrong" && <X size={17} aria-label="Bạn chọn" />}</button>; })}</div>
      : ordering ? <><span className="gg-answer-label">Câu của bạn</span><div className={`gg-tray ${graded ? `is-${tone}` : ""}`}>{order.length ? order.map((position, slot) => <button key={slot} disabled={graded} onClick={() => pick(order.filter((_, other) => other !== slot))} aria-label={`Bỏ cụm ${item.chunks[position]}`}>{item.chunks[position]}</button>) : <span>Bấm các cụm bên dưới theo đúng thứ tự.</span>}</div>
        {!graded && <div className="gg-chunks">{item.chunks.map((chunk, position) => <button key={position} disabled={order.includes(position)} onClick={() => pick([...order, position])}>{chunk}</button>)}{order.length > 0 && <button className="gg-chunks-clear" onClick={() => pick([])}>Làm lại</button>}</div>}</>
      : <><label className="gg-answer-label" htmlFor="grammar-answer">Câu trả lời của bạn</label><input ref={inputRef} id="grammar-answer" className={`gg-answer-input ${graded ? `is-${tone}` : ""}`} value={response.answer} readOnly={graded} onChange={(event) => onAnswer({ answer: event.target.value })} placeholder={item.type === "error_correction" ? "Viết lại câu đúng…" : "Nhập đáp án rồi nhấn Enter"} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" /></>}
    {!graded && <div className="gg-question-actions"><button disabled={!answer.trim() || checking} className="gg-primary" onClick={() => void submit()}>{checking ? "Đang kiểm tra…" : "Kiểm tra"}</button><button className="gg-secondary" onClick={onSkip}>Để sau</button><span className="gg-keys">{item.options ? `Phím 1–${item.options.length} để chọn · ` : ""}Enter để kiểm tra</span></div>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    <div ref={resultRef} className="gg-result" aria-live="polite">{graded && <div className={`gg-reference is-${tone}`}>
      <strong className="gg-verdict">{tone === "right" ? <><Check size={18} aria-hidden="true" /> Chính xác!</> : tone === "wrong" ? <><X size={18} aria-hidden="true" /> Chưa đúng</> : "Tự đối chiếu với đáp án mẫu"}</strong>
      {tone !== "right" && <p><b>Đáp án:</b> {response.referenceAnswer}</p>}
      {tone === "wrong" && !item.options && <p><b>Bạn trả lời:</b> {response.answer}</p>}
      {response.feedback && <p>{response.feedback}</p>}
      {response.explanation && <p><b>Vì sao:</b> {response.explanation}</p>}
      {missedFirst && <p className="gg-first-note">Lần đầu bạn trả lời chưa đúng, nên câu này vẫn nằm trong Sổ ôn. Làm đúng vào một ngày khác để đưa nó ra.</p>}
      <div className="gg-result-actions"><button ref={continueRef} className="gg-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button><button className="gg-secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Thử lại</button></div>
      <small>Kết quả dùng cho tự luyện trên dữ liệu biên tập, chưa phải chứng nhận năng lực.</small>
    </div>}</div>
  </>;
}

function ReviewPage({ progress }: { progress: GrammarProgress }) {
  const [query, setQuery] = useState("");
  const flagged = Object.entries(progress).flatMap(([code, value]) => Object.entries(value.responses).filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW").map(([itemId, response]) => ({ code, itemId, response, lesson: catalog.find((item) => item.code === code) })));
  const filtered = flagged.filter((item) => `${item.code} ${item.lesson?.title} ${item.response.prompt ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">ÔN TẬP</span><h1>Sổ câu cần ôn</h1><p>Câu bạn trả lời sai được lưu ở đây. Câu rời sổ khi bạn làm đúng vào một ngày khác.</p><div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo bài hoặc nội dung câu…" aria-label="Tìm câu cần ôn" /></div>
    {filtered.length ? <div className="gg-results">{filtered.map((item) => { const wrong = item.response.first?.correct === false ? item.response.first.answer : item.response.answer; return <Link className="gg-review-row" key={item.itemId} href={`${ROOT}/lesson/${item.code}?item=${encodeURIComponent(item.itemId)}`}><span>{item.code}</span><div><strong>{item.response.prompt ?? item.lesson?.title}</strong><small>{item.lesson?.title}</small>{(wrong || item.response.referenceAnswer) && <p>{wrong && <span className="gg-bad"><X size={13} aria-label="Bạn trả lời" /> {wrong}</span>}{item.response.referenceAnswer && <span className="gg-good"><Check size={13} aria-label="Đáp án" /> {item.response.referenceAnswer}</span>}</p>}</div><ArrowRight size={16} /></Link>; })}</div>
      : <div className="gg-empty"><Flag size={28} /><h2>{flagged.length ? "Không có câu phù hợp" : "Sổ ôn đang trống"}</h2><p>Câu trả lời sai trong lúc luyện tập sẽ tự vào đây.</p><Link className="gg-primary" href={ROOT}>Xem lộ trình <ArrowRight size={16} /></Link></div>}</div>;
}
function ProgressPage({ progress }: { progress: GrammarProgress }) {
  const responses = Object.values(progress).flatMap((value) => Object.entries(value.responses).filter(([id]) => editorialId(id)).map(([, response]) => response));
  const dates = new Set(responses.filter((response) => response.status).map((response) => response.updatedAt.slice(0, 10)));
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">TIẾN ĐỘ</span><h1>Hành trình Grammar</h1><p>Điểm luyện tập từ bản nháp biên tập chưa dùng để mở khóa hoặc chứng nhận cấp độ.</p><div className="gg-summary"><div><strong>{Object.values(progress).filter((value) => value.theorySeen).length}</strong><span>Bài đã học lý thuyết</span></div><div><strong>{responses.filter((response) => response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW").length}</strong><span>Câu đã làm</span></div><div><strong>{dates.size}</strong><span>Ngày có hoạt động</span></div></div><div className="gg-progress-levels">{grammarLevels.map((level) => { const value = countForLevel(level, progress); return <Link key={level} href={`${ROOT}/level/${level}`}><span className="gg-world-icon">{grammarWorlds[level].icon}</span><div><strong>{level} · {grammarWorlds[level].name}</strong><small>{value.practiced}/{value.total} bài làm đủ · {value.started} bài đã mở</small><div className="gg-meter"><span style={{ width: `${value.practiced / value.total * 100}%` }} /></div></div><ArrowRight size={17} /></Link>; })}</div></div>;
}
function TestsPage() {
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><div className="gg-empty"><LockKeyhole size={30} /><h1>Vận dụng theo từng bài</h1><p>Mỗi bài có giai đoạn Mastery trong phần luyện tập. Dữ liệu đang biên tập, kết quả chưa dùng để chứng nhận năng lực.</p><Link className="gg-primary" href={ROOT}>Chọn bài học <ArrowRight size={16} /></Link></div></div>;
}
