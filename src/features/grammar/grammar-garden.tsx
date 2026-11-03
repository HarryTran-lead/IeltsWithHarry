"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Flag, LockKeyhole, Map, PenLine, RotateCcw, Search, Sprout, Star, Target, X } from "lucide-react";
import { editorialId, grammarLevels, grammarWorlds, practiced, reviewedCount, type GrammarCatalogLesson, type GrammarGuide, type GrammarLessonProgress, type GrammarMistake, type GrammarPracticeItem, type GrammarProgress, type GrammarReview, type GrammarLevel } from "@/lib/grammar/types";
import { answered, clockNow, flaggedQuestions, formatDue, isDue, mainStages, mainStagesDone, MIXED_REVIEW_SIZE, openStage, REVIEW_PASS, scheduleAfterLearn, scheduleAfterReview, SESSION_SIZE, spacedQueue, stageQueue } from "@/lib/grammar/schedule";
import { catalog, lessonHref, lessonTotal, ROOT } from "./grammar-catalog";
import { useGrammarProgress, type GrammarUpdate } from "./grammar-progress";
import { GrammarToday } from "./grammar-today";
import { PracticeSession, resetForSession, SessionSummary, sessionScore, type SessionEntry, type SessionResult } from "./practice-session";
import "./grammar-garden.css";
import "./grammar-garden-layout.css";

const stages = ["guided", "independent", "mastery", "spaced_review"] as const;
const stageNames: Record<string, string> = { guided: "Có hướng dẫn", independent: "Tự luyện", mastery: "Vận dụng", spaced_review: "Ôn cách quãng" };
function countForLevel(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return { total: lessons.length, practiced: lessons.filter((lesson) => practiced(progress[lesson.code], lessonTotal(lesson))).length, started: lessons.filter((lesson) => progress[lesson.code]).length };
}
/** Catalog groups now repeat each lesson's title, so a chapter is named by its first and last lesson unless they share a topic. */
function chapterName(lessons: GrammarCatalogLesson[]) {
  const groups = [...new Set(lessons.map((lesson) => lesson.group))];
  if (groups.length === 1 && lessons.length > 1) return groups[0];
  return lessons.length > 1 ? `${lessons[0].title} → ${lessons[lessons.length - 1].title}` : lessons[0]?.title ?? "";
}

function progressLabel(lesson: GrammarCatalogLesson, value?: GrammarLessonProgress) {
  const total = lessonTotal(lesson);
  const reviewed = reviewedCount(value);
  return value?.review ? "Đã học xong" : reviewed >= total ? `Đã làm ${total}/${total}` : reviewed ? `Đã làm ${reviewed}/${total}` : value?.theorySeen ? "Đã học lý thuyết" : "Chưa bắt đầu";
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
      : route === "review" ? <ReviewPage progress={progress} update={update} />
      : route === "progress" ? <ProgressPage progress={progress} />
      : route === "tests" ? <TestsPage />
      : <><div className="gg-crumb"><Link href={ROOT}><Sprout size={17} /> Grammar</Link><ChevronRight size={15} /><span>{level}</span><a className="gg-world-switch" href="#gg-worlds"><Map size={16} /> Đổi cấp độ</a></div>
        <div className="gg-layout"><main className="gg-main">{ready && <GrammarToday progress={progress} level={level} />}<Roadmap level={level} progress={progress} query={query} setQuery={setQuery} ready={ready} chapterQuery={searchParams.get("chapter")} /></main><aside className="gg-aside"><SidebarProgress level={level} progress={progress} /></aside></div></>}
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
  return <><section className="gg-hero"><div className="gg-hero-copy"><span className="gg-eyebrow">WORLD {grammarLevels.indexOf(level) + 1} · {level}</span><h1>{world.name}</h1><p>Chương {chapter}: {chapterName(chapterLessons) || world.description}</p><div className="gg-hero-metric"><span>{completed}/{chapterLessons.length} bài đã học xong</span><span>{Math.round(completed / chapterLessons.length * 100)}%</span></div><div className="gg-meter"><span style={{ width: `${completed / chapterLessons.length * 100}%` }} /></div></div><div className="gg-hero-symbol" aria-hidden="true">{world.icon}</div></section>
    <div className="gg-roadmap-toolbar"><div><h2><BookOpen size={22} /> Hành trình chương {chapter}</h2><p>{chapterLessons.length} bài · {chapterLessons.reduce((sum, lesson) => sum + lessonTotal(lesson), 0)} câu luyện tập. Bấm một bài để bắt đầu.</p></div><div className="gg-chapter-controls"><Link href={`${ROOT}/level/${level}?chapter=${chapter - 1}`} aria-disabled={chapter === 1}><ChevronLeft size={18} /></Link><select aria-label="Chọn chương" value={chapter} onChange={(event) => router.push(`${ROOT}/level/${level}?chapter=${event.target.value}`)}>{Array.from({ length: chapters }, (_, index) => <option value={index + 1} key={index}>Chương {index + 1}</option>)}</select><Link href={`${ROOT}/level/${level}?chapter=${chapter + 1}`} aria-disabled={chapter === chapters}><ChevronRight size={18} /></Link></div></div>
    <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${level} (${lessons.length} bài)...`} aria-label="Tìm bài Grammar" />{query && <button onClick={() => setQuery("")}>Xóa</button>}</div>
    {query.trim() ? <div className="gg-results">{found.length ? found.map((lesson) => <Link key={lesson.code} href={lessonHref(lesson.code, progress[lesson.code])}><span>{lesson.code}</span><strong>{lesson.title}</strong><small>{progressLabel(lesson, progress[lesson.code])}</small><ArrowRight size={16} /></Link>) : <p>Không tìm thấy bài phù hợp.</p>}</div> : <div className="gg-map" aria-label={`Bản đồ chương ${chapter}`}><div className="gg-map-shade" />{chapterLessons.map((lesson, index) => <Link className={`gg-map-card gg-map-card-${index + 1} ${practiced(progress[lesson.code], lessonTotal(lesson)) ? "done" : ""}`} key={lesson.code} href={lessonHref(lesson.code, progress[lesson.code])}><span className="gg-map-icon">{practiced(progress[lesson.code], lessonTotal(lesson)) ? <Check size={25} /> : <BookOpen size={23} />}</span><span className="gg-map-label"><small>{lesson.code} · {lessonTotal(lesson)} câu</small><strong>{lesson.title}</strong><em>{progressLabel(lesson, progress[lesson.code])}</em></span><ChevronRight className="gg-map-chevron" size={17} /></Link>)}<Link className="gg-checkpoint" href={`${ROOT}/lesson/${chapterLessons[0]?.code}?tab=practice&stage=mastery`}><Target size={20} /><span><strong>Vận dụng trong bài</strong><small>Câu Mastery theo từng bài</small></span></Link></div>}
    <div className="gg-worlds" id="gg-worlds">{grammarLevels.map((item) => { const counts = countForLevel(item, progress); return <Link className={item === level ? "selected" : ""} href={`${ROOT}/level/${item}`} key={item}><span>{grammarWorlds[item].icon}</span><strong>{item}</strong><small>{grammarWorlds[item].name}<br />{ready ? `${counts.practiced}/${counts.total} bài đã học xong` : `${counts.total} bài`}</small></Link>; })}</div>
    <div className="gg-preview-note">Dữ liệu đang là bản nháp biên tập, chưa được xác nhận để cấp chứng nhận năng lực. Kết quả chỉ giúp tự luyện và tìm câu cần ôn.</div></>;
}

function SidebarProgress({ level, progress }: { level: GrammarLevel; progress: GrammarProgress }) {
  const counts = countForLevel(level, progress);
  const needsReview = Object.entries(progress).filter(([code]) => code.startsWith(level)).flatMap(([, entry]) => Object.entries(entry.responses)).filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW").length;
  return <section className="gg-side-card"><h3>Tiến độ cấp độ {level}</h3><div className="gg-side-progress"><span>{counts.practiced}/{counts.total} bài đã học xong</span><strong>{Math.round(counts.practiced / counts.total * 100)}%</strong></div><div className="gg-meter"><span style={{ width: `${counts.practiced / counts.total * 100}%` }} /></div><div className="gg-side-stats"><div><Star size={22} /><strong>{counts.started}</strong><small>Bài đã mở</small></div><div><BookOpen size={22} /><strong>{counts.practiced}</strong><small>Đã học xong</small></div><div><Target size={22} /><strong>{needsReview}</strong><small>Cần ôn</small></div></div></section>;
}

type SessionKind = "stage" | "spaced" | "retry" | "item";
type LessonView =
  | { type: "session"; id: number; kind: SessionKind; stage: string; entries: SessionEntry[] }
  | { type: "summary"; kind: SessionKind; stage: string; result: SessionResult; review?: GrammarReview; learned: boolean }
  | { type: "locked" };

function LessonWorkspace({ code, progress, update, initialTab, initialStage, initialItem, resume }: { code: string; progress: GrammarProgress; update: GrammarUpdate; initialTab: "theory" | "practice"; initialStage: string; initialItem: string; resume: boolean }) {
  const [tab, setTab] = useState<"theory" | "practice">(initialItem || resume || initialStage !== "guided" ? "practice" : initialTab);
  const [data, setData] = useState<{ guide: GrammarGuide; items: GrammarPracticeItem[] } | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<LessonView | null>(null);
  const sessions = useRef(0);
  // Progress is loaded before this mounts; the ref lets the fetch pick the starting session without refetching on every answer.
  const startProgress = useRef(progress);

  const begin = useCallback((kind: SessionKind, stage: string, picked: GrammarPracticeItem[], current: GrammarProgress) => {
    const entries = picked.map((item) => ({ code, item }));
    resetForSession(update, entries, current);
    sessions.current += 1;
    setView({ type: "session", id: sessions.current, kind, stage, entries });
  }, [code, update]);
  const beginSpaced = useCallback((items: GrammarPracticeItem[], current: GrammarProgress) => {
    if (!isDue(current[code]?.review, clockNow())) { setView({ type: "locked" }); return; }
    begin("spaced", "spaced_review", spacedQueue(items, current[code]), current);
  }, [begin, code]);

  useEffect(() => {
    let active = true;
    fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("Không tải được bài học."); return response.json(); }).then((result: { guide: GrammarGuide; items: GrammarPracticeItem[] }) => {
      if (!active) return;
      setData(result);
      const current = startProgress.current;
      const found = result.items.find((item) => item.id === initialItem);
      if (found) begin("item", found.stage, [found], current);
      else if (initialStage === "spaced_review") beginSpaced(result.items, current);
      else if (initialItem || resume || initialTab === "practice" || initialStage !== "guided") {
        const stage = mainStages.includes(initialStage as typeof mainStages[number]) && initialStage !== "guided" ? initialStage : openStage(result.items, current[code]);
        begin("stage", stage, stageQueue(result.items, stage, current[code]), current);
      }
    }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [code, initialItem, initialStage, initialTab, resume, begin, beginSpaced]);

  if (error && !data) return <div className="gg-error"><p>{error}</p><Link href={ROOT}>Về lộ trình</Link></div>;
  if (!data) return <div className="gg-loading">Đang tải bài học…</div>;
  const { guide, items } = data;
  const lesson = catalog.find((item) => item.code === code);
  const lessonProgress = progress[code];
  const levelLessons = catalog.filter((item) => item.level === lesson?.level);
  const next = levelLessons[levelLessons.findIndex((item) => item.code === code) + 1];
  const startStage = (stage: string) => begin("stage", stage, stageQueue(items, stage, lessonProgress), progress);
  const openPractice = () => { setTab("practice"); if (!view) startStage(openStage(items, lessonProgress)); };

  function finish(kind: SessionKind, stage: string, result: SessionResult) {
    const now = clockNow();
    const score = sessionScore(result);
    let review = lessonProgress?.review;
    const learned = !review && mainStagesDone(items, lessonProgress);
    if (learned) review = scheduleAfterLearn(now);
    else if (kind === "spaced" && review && score.answered) review = scheduleAfterReview(review, score.graded ? score.correct / score.graded : 1, now);
    if (review !== lessonProgress?.review) update(code, (value) => ({ ...value, review }));
    setView({ type: "summary", kind, stage, result, review, learned });
  }

  const reviewState = lessonProgress?.review;
  const spacedLabel = reviewState ? (isDue(reviewState, clockNow()) ? "Đến hạn" : `Mở ${formatDue(reviewState.due, clockNow())}`) : "Chưa mở";

  return <div className="gg-lesson"><div className="gg-crumb"><Link href={`${ROOT}/level/${lesson?.level ?? "A1"}`}><ArrowLeft size={16} /> {lesson?.level} · Lộ trình</Link><ChevronRight size={15} /><span>{code}</span></div>
    <div className="gg-lesson-head"><div><span className="gg-eyebrow">{code} · BẢN NHÁP BIÊN TẬP</span><h1>{guide.title}</h1><p>{guide.overview || guide.objectives[0]}</p></div><span className="gg-lesson-score">{reviewedCount(lessonProgress)}/{items.length} câu đã làm</span></div>
    <div className="gg-lesson-tabs"><button className={tab === "theory" ? "active" : ""} onClick={() => setTab("theory")}><BookOpen size={17} /> Lý thuyết</button><button className={tab === "practice" ? "active" : ""} onClick={openPractice}><PenLine size={17} /> Luyện tập · {items.length} câu</button></div>
    {tab === "theory" ? <Theory guide={guide} onDone={() => { update(code, (value) => ({ ...value, theorySeen: true })); setTab("practice"); startStage(openStage(items, lessonProgress)); }} />
      : <div className="gg-practice">
        <div className="gg-stage-tabs">{stages.map((stage) => { const stageItems = items.filter((question) => question.stage === stage); const done = stageItems.filter((question) => answered(lessonProgress, question.id)).length; const active = view?.type === "session" ? view.stage === stage : view?.type === "summary" ? view.stage === stage : view?.type === "locked" && stage === "spaced_review"; return <button key={stage} className={active ? "active" : ""} onClick={() => stage === "spaced_review" ? beginSpaced(items, progress) : startStage(stage)}>{stageNames[stage]} <small>{stage === "spaced_review" ? spacedLabel : `${done}/${stageItems.length}`}</small></button>; })}</div>
        {view?.type === "session" && <PracticeSession key={view.id} entries={view.entries} progress={progress} update={update}
          label={(entry) => stageNames[entry.item.stage] ?? ""} onFinish={(result) => finish(view.kind, view.stage, result)} />}
        {view?.type === "locked" && <div className="gg-empty gg-locked"><LockKeyhole size={28} /><h2>Ôn cách quãng {reviewState ? `mở ${formatDue(reviewState.due, clockNow())}` : "chưa mở"}</h2><p>{reviewState ? "Ôn đúng hạn giúp bạn nhớ lâu hơn ôn dồn. Bài này sẽ tự xuất hiện trong mục Hôm nay khi đến hạn." : "Làm hết ba phần Có hướng dẫn, Tự luyện và Vận dụng để mở lịch ôn cho bài này."}</p><button className="gg-primary" onClick={() => startStage(openStage(items, lessonProgress))}>Luyện tiếp bài này <ArrowRight size={16} /></button></div>}
        {view?.type === "summary" && <LessonSummary code={code} view={view} items={items} progress={progress} next={next}
          onStage={startStage} onSpaced={() => beginSpaced(items, progress)}
          onRetry={(entries) => begin("retry", view.stage, entries.map((entry) => entry.item), progress)} />}
        {!view && <div className="gg-empty"><PenLine size={28} /><h2>Sẵn sàng luyện tập</h2><button className="gg-primary" onClick={() => startStage(openStage(items, lessonProgress))}>Bắt đầu buổi học <ArrowRight size={16} /></button></div>}
      </div>}
    <div className="gg-lesson-bottom"><Link href={`${ROOT}/review`}><Flag size={16} /> Sổ ôn</Link>{next && <Link href={`${ROOT}/lesson/${next.code}`}>Bài tiếp: {next.title} <ArrowRight size={16} /></Link>}</div></div>;
}

function LessonSummary({ code, view, items, progress, next, onStage, onSpaced, onRetry }: {
  code: string; view: Extract<LessonView, { type: "summary" }>; items: GrammarPracticeItem[]; progress: GrammarProgress; next?: GrammarCatalogLesson;
  onStage: (stage: string) => void; onSpaced: () => void; onRetry: (entries: SessionEntry[]) => void;
}) {
  const now = clockNow();
  const lessonProgress = progress[code];
  const score = sessionScore(view.result);
  const teachingLeft = !mainStagesDone(items, lessonProgress);
  const stage = openStage(items, lessonProgress);
  const left = items.filter((item) => item.stage === stage && !answered(lessonProgress, item.id)).length;
  const passed = score.graded ? score.correct / score.graded >= REVIEW_PASS : true;
  const note = view.learned && view.review ? <>Bạn đã học xong ba phần của bài. Lần ôn cách quãng đầu tiên: <b>{formatDue(view.review.due, now)}</b>.</>
    : view.kind === "spaced" && view.review ? (passed ? <>Bài đã vững hơn. Lần ôn tiếp theo: <b>{formatDue(view.review.due, now)}</b>.</> : <>Dưới 80% câu đúng ngay lần đầu, bài sẽ quay lại <b>{formatDue(view.review.due, now)}</b>.</>)
      : view.kind === "retry" ? "Câu làm đúng hôm nay vẫn nằm trong Sổ ôn cho đến khi bạn làm đúng vào một ngày khác." : undefined;
  return <SessionSummary result={view.result} progress={progress} title={view.kind === "spaced" ? "Xong lượt ôn cách quãng" : view.kind === "retry" ? "Xong phần ôn câu sai" : `Xong buổi ${stageNames[view.stage] ?? ""}`} note={note}>
    {teachingLeft ? <button className="gg-primary" onClick={() => onStage(stage)}>Buổi tiếp theo · {stageNames[stage]} · {Math.min(left, SESSION_SIZE)} câu <ArrowRight size={16} /></button>
      : isDue(lessonProgress?.review, now) ? <button className="gg-primary" onClick={onSpaced}>Ôn cách quãng ngay <ArrowRight size={16} /></button>
        : next ? <Link className="gg-primary" href={lessonHref(next.code, progress[next.code])}>Bài tiếp: {next.title} <ArrowRight size={16} /></Link> : null}
    {score.wrong.length > 0 && <button className="gg-secondary" onClick={() => onRetry(score.wrong)}><RotateCcw size={14} aria-hidden="true" /> Làm lại {score.wrong.length} câu sai</button>}
    <Link className="gg-secondary" href={`${ROOT}/level/${code.slice(0, 2)}`}>Về lộ trình</Link>
  </SessionSummary>;
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

type ReviewView = { type: "list" } | { type: "loading" } | { type: "session"; id: number; entries: SessionEntry[] } | { type: "summary"; result: SessionResult };

function ReviewPage({ progress, update }: { progress: GrammarProgress; update: GrammarUpdate }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ReviewView>({ type: "list" });
  const [error, setError] = useState("");
  const sessions = useRef(0);
  const flagged = flaggedQuestions(progress).map((item) => ({ ...item, lesson: catalog.find((lesson) => lesson.code === item.code) }));
  const filtered = flagged.filter((item) => `${item.code} ${item.lesson?.title} ${item.response.prompt ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  async function startMixed() {
    const picks = flaggedQuestions(progress).slice(0, MIXED_REVIEW_SIZE);
    if (!picks.length) return;
    setView({ type: "loading" });
    setError("");
    try {
      const codes = [...new Set(picks.map((pick) => pick.code))];
      const lessons = await Promise.all(codes.map(async (code) => {
        const response = await fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được câu ôn.");
        return [code, (await response.json()).items as GrammarPracticeItem[]] as const;
      }));
      const byCode = Object.fromEntries(lessons);
      const entries = picks.flatMap((pick) => { const item = byCode[pick.code]?.find((question) => question.id === pick.id); return item ? [{ code: pick.code, item }] : []; });
      resetForSession(update, entries, progress);
      sessions.current += 1;
      setView({ type: "session", id: sessions.current, entries });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được câu ôn."); setView({ type: "list" }); }
  }

  const header = <><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">ÔN TẬP</span><h1>Sổ câu cần ôn</h1></>;
  if (view.type === "loading") return <div className="gg-subpage">{header}<div className="gg-loading">Đang chuẩn bị câu ôn…</div></div>;
  if (view.type === "session") return <div className="gg-subpage">{header}<div className="gg-practice"><PracticeSession key={view.id} entries={view.entries} progress={progress} update={update}
    label={(entry) => `${entry.code} · ${catalog.find((lesson) => lesson.code === entry.code)?.title ?? ""}`} onFinish={(result) => setView({ type: "summary", result })} /></div></div>;
  if (view.type === "summary") return <div className="gg-subpage">{header}<SessionSummary result={view.result} progress={progress} title="Xong buổi ôn câu sai"
    note="Câu làm đúng sẽ rời Sổ ôn nếu lần sai gần nhất không phải hôm nay. Câu vừa sai hôm nay sẽ chờ bạn ôn vào ngày khác.">
    {flagged.length > 0 && <button className="gg-primary" onClick={() => void startMixed()}>Ôn {Math.min(flagged.length, MIXED_REVIEW_SIZE)} câu tiếp <ArrowRight size={16} /></button>}
    <button className="gg-secondary" onClick={() => setView({ type: "list" })}>Về Sổ ôn</button>
  </SessionSummary></div>;

  return <div className="gg-subpage">{header}<p>Câu bạn trả lời sai được lưu ở đây. Câu rời sổ khi bạn làm đúng vào một ngày khác.</p>
    {flagged.length > 0 && <div className="gg-review-start"><div><strong>{flagged.length} câu đang chờ ôn</strong><span>Một buổi gồm {Math.min(flagged.length, MIXED_REVIEW_SIZE)} câu cũ nhất, trộn từ nhiều bài.</span></div><button className="gg-primary" onClick={() => void startMixed()}>Ôn {Math.min(flagged.length, MIXED_REVIEW_SIZE)} câu <ArrowRight size={16} /></button></div>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo bài hoặc nội dung câu…" aria-label="Tìm câu cần ôn" /></div>
    {filtered.length ? <div className="gg-results">{filtered.map((item) => { const wrong = item.response.lastWrong ?? (item.response.first?.correct === false ? item.response.first.answer : item.response.answer); return <Link className="gg-review-row" key={`${item.code}:${item.id}`} href={`${ROOT}/lesson/${item.code}?item=${encodeURIComponent(item.id)}`}><span>{item.code}</span><div><strong>{item.response.prompt ?? item.lesson?.title}</strong><small>{item.lesson?.title}</small>{(wrong || item.response.referenceAnswer) && <p>{wrong && <span className="gg-bad"><X size={13} aria-label="Bạn trả lời" /> {wrong}</span>}{item.response.referenceAnswer && <span className="gg-good"><Check size={13} aria-label="Đáp án" /> {item.response.referenceAnswer}</span>}</p>}</div><ArrowRight size={16} /></Link>; })}</div>
      : <div className="gg-empty"><Flag size={28} /><h2>{flagged.length ? "Không có câu phù hợp" : "Sổ ôn đang trống"}</h2><p>Câu trả lời sai trong lúc luyện tập sẽ tự vào đây.</p><Link className="gg-primary" href={ROOT}>Xem lộ trình <ArrowRight size={16} /></Link></div>}</div>;
}

function ProgressPage({ progress }: { progress: GrammarProgress }) {
  const responses = Object.values(progress).flatMap((value) => Object.entries(value.responses).filter(([id]) => editorialId(id)).map(([, response]) => response));
  const dates = new Set(responses.filter((response) => response.status).map((response) => response.updatedAt.slice(0, 10)));
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">TIẾN ĐỘ</span><h1>Hành trình Grammar</h1><p>Điểm luyện tập từ bản nháp biên tập chưa dùng để mở khóa hoặc chứng nhận cấp độ.</p><div className="gg-summary"><div><strong>{Object.values(progress).filter((value) => value.theorySeen).length}</strong><span>Bài đã học lý thuyết</span></div><div><strong>{responses.filter((response) => response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW").length}</strong><span>Câu đã làm</span></div><div><strong>{dates.size}</strong><span>Ngày có hoạt động</span></div></div><div className="gg-progress-levels">{grammarLevels.map((level) => { const value = countForLevel(level, progress); return <Link key={level} href={`${ROOT}/level/${level}`}><span className="gg-world-icon">{grammarWorlds[level].icon}</span><div><strong>{level} · {grammarWorlds[level].name}</strong><small>{value.practiced}/{value.total} bài học xong · {value.started} bài đã mở</small><div className="gg-meter"><span style={{ width: `${value.practiced / value.total * 100}%` }} /></div></div><ArrowRight size={17} /></Link>; })}</div></div>;
}
function TestsPage() {
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><div className="gg-empty"><LockKeyhole size={30} /><h1>Vận dụng theo từng bài</h1><p>Mỗi bài có giai đoạn Mastery trong phần luyện tập. Dữ liệu đang biên tập, kết quả chưa dùng để chứng nhận năng lực.</p><Link className="gg-primary" href={ROOT}>Chọn bài học <ArrowRight size={16} /></Link></div></div>;
}
