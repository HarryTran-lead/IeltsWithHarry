"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, ClipboardCheck, Compass, Flag, LockKeyhole, Newspaper, PenLine, RotateCcw, Search, Sprout, Volume2, X, ChevronRight } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { speakText } from "@/lib/vocabulary/pronounce";
import { editorialId, grammarLevels, grammarWorlds, reviewedCount, type GrammarCatalogLesson, type GrammarExample, type GrammarGuide, type GrammarLessonProgress, type GrammarMistake, type GrammarPracticeItem, type GrammarProgress, type GrammarReview, type GrammarLevel } from "@/lib/grammar/types";
import { answered, clockNow, dueLessons, flaggedQuestions, formatDue, isDue, mainStages, mainStagesDone, MIXED_REVIEW_SIZE, openStage, REVIEW_PASS, scheduleAfterLearn, scheduleAfterReview, SESSION_SIZE, spacedQueue, stageQueue } from "@/lib/grammar/schedule";
import { catalog, lessonDone, lessonHref, lessonTotal, nextLesson, ROOT } from "./grammar-catalog";
import { useGrammarProgress, type GrammarUpdate } from "./grammar-progress";
import { GrammarToday } from "./grammar-today";
import { CHAPTER, ChapterTestsPage } from "./grammar-tests";
import { PracticeSession, resetForSession, SessionSummary, sessionScore, type SessionEntry, type SessionResult } from "./practice-session";
import { GRAMMAR_PASS_PERCENT, isLevelOpen } from "@/lib/grammar/gate";
import { GrammarUnlockPage, LockedLevel, useGrammarUnlocks } from "./grammar-unlock";
import "./grammar-tokens.css";
import "./grammar-garden.css";
import "./grammar-garden-layout.css";
import "./grammar-garden-v3.css";

const stages = ["guided", "independent", "mastery", "spaced_review"] as const;
const stageNames: Record<string, string> = { guided: "Có hướng dẫn", independent: "Tự luyện", mastery: "Vận dụng", spaced_review: "Ôn cách quãng" };
const worldSticker = (level: GrammarLevel) => grammarWorlds[level].sticker as StickerName;

function countForLevel(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return { total: lessons.length, practiced: lessons.filter((lesson) => lessonDone(lesson, progress[lesson.code])).length, started: lessons.filter((lesson) => progress[lesson.code]).length };
}

function progressLabel(lesson: GrammarCatalogLesson, value?: GrammarLessonProgress) {
  const total = lessonTotal(lesson);
  const reviewed = reviewedCount(value);
  return value?.review ? "Đã học xong" : reviewed >= total ? `Đã làm ${total}/${total}` : reviewed ? `Đã làm ${reviewed}/${total} câu` : value?.theorySeen ? "Đã học lý thuyết" : "Chưa bắt đầu";
}

export function GrammarGarden() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { progress, ready, syncError, update } = useGrammarProgress();
  const gate = useGrammarUnlocks();
  const parts = pathname.split("/");
  const route = parts[3] ?? "";
  const level = grammarLevels.includes(parts[4] as GrammarLevel) ? parts[4] as GrammarLevel : "A1";
  const testLevel = grammarLevels.includes(searchParams.get("level") as GrammarLevel) ? searchParams.get("level") as GrammarLevel : level;
  if (!gate.ready) return <div className="gg gg-loading">Đang kiểm tra cấp độ đã mở…</div>;
  return <div className="gg" id="che-do-hoc">
    {syncError && <div className="gg-sync" role="status">{syncError}</div>}
    {gate.error && <div className="gg-sync" role="alert">{gate.error}</div>}
    {route === "lesson" ? (!isLevelOpen(parts[4]?.split("-")[0] as GrammarLevel, gate.unlocked) ? <LockedLevel level={parts[4]?.split("-")[0] as GrammarLevel} unlocked={gate.unlocked} /> : ready ? <LessonWorkspace key={parts[4]} code={parts[4]} progress={progress} update={update} initialTab={searchParams.get("tab") === "practice" ? "practice" : "theory"} initialStage={searchParams.get("stage") ?? "guided"} initialItem={searchParams.get("item") ?? ""} resume={searchParams.has("resume")} /> : <div className="gg-loading">Đang tải tiến độ…</div>)
      : route === "review" ? <ReviewPage progress={progress} update={update} />
      : route === "progress" ? <ProgressPage progress={progress} ready={ready} unlocked={gate.unlocked} />
      : route === "tests" ? (isLevelOpen(testLevel, gate.unlocked) ? <ChapterTestsPage key={testLevel} progress={progress} update={update} initialLevel={testLevel} unlocked={gate.unlocked} /> : <LockedLevel level={testLevel} unlocked={gate.unlocked} />)
      : route === "placement" ? <GrammarUnlockPage targetParam={searchParams.get("target")} unlocked={gate.unlocked} onUnlock={gate.unlock} />
      : !isLevelOpen(level, gate.unlocked) ? <LockedLevel level={level} unlocked={gate.unlocked} />
      : <><div className="gg-crumb"><Link href={ROOT}><Sprout size={17} /> Grammar</Link><ChevronRight size={15} /><span>{level}</span></div>
        <div className="gg-layout"><main className="gg-main">{ready && <GrammarToday progress={progress} level={level} />}<Roadmap level={level} progress={progress} ready={ready} chapterQuery={searchParams.get("chapter")} unlocked={gate.unlocked} /></main><aside className="gg-aside"><SidebarProgress level={level} progress={progress} /></aside></div></>}
  </div>;
}

function Roadmap({ level, progress, ready, chapterQuery, unlocked }: { level: GrammarLevel; progress: GrammarProgress; ready: boolean; chapterQuery: string | null; unlocked: GrammarLevel[] }) {
  const [query, setQuery] = useState("");
  const lessons = catalog.filter((lesson) => lesson.level === level);
  const world = grammarWorlds[level];
  const counts = countForLevel(level, progress);
  const current = nextLesson(level, progress);
  const nextLevel = grammarLevels[grammarLevels.indexOf(level) + 1];
  const now = clockNow();
  const chapters = Array.from({ length: Math.ceil(lessons.length / CHAPTER) }, (_, index) => lessons.slice(index * CHAPTER, (index + 1) * CHAPTER));
  const openChapter = Number(chapterQuery) || Math.floor(lessons.indexOf(current) / CHAPTER) + 1;
  const found = query.trim() ? lessons.filter((lesson) => `${lesson.code} ${lesson.title} ${lesson.group}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const node = (lesson: GrammarCatalogLesson, number: number) => {
    const value = progress[lesson.code];
    const done = lessonDone(lesson, value);
    const due = isDue(value?.review, now);
    const state = done ? "done" : lesson.code === current.code ? "current" : value ? "started" : "";
    return <li key={lesson.code} className={`gg-node-row ${state}`}><Link href={due ? `${ROOT}/lesson/${lesson.code}?stage=spaced_review` : lessonHref(lesson.code, value)}>
      <span className="gg-node" aria-hidden="true">{done ? <Check size={18} /> : number}</span>
      <span className="gg-node-text"><small>{lesson.code} · {lessonTotal(lesson)} câu</small><strong>{lesson.title}</strong><em>{progressLabel(lesson, value)}</em></span>
      {due ? <span className="gg-node-badge is-due"><CalendarClock size={13} aria-hidden="true" /> Đến hạn ôn</span> : state === "current" ? <span className="gg-node-badge">{value ? "Học tiếp" : "Bắt đầu"}</span> : null}
      <ChevronRight className="gg-node-chevron" size={17} aria-hidden="true" />
    </Link></li>;
  };
  return <>
    {ready && nextLevel && !isLevelOpen(nextLevel, unlocked) && <Link className="gg-placement-cta" href={`${ROOT}/placement?target=${nextLevel}`}><Compass size={20} aria-hidden="true" /><span><strong>Muốn lên cấp {nextLevel}?</strong><small>Làm đúng ít nhất 16/20 câu của cấp {level} để mở khóa.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>}
    <section className="gg-hero gg-hero-garden">
      <div className="gg-hero-copy"><span className="gg-eyebrow">WORLD {grammarLevels.indexOf(level) + 1} · {level}</span><h1>{world.name}</h1><p>{world.description}</p>
        <div className="gg-hero-metric"><span>{counts.practiced}/{counts.total} bài đã học xong</span><span>{Math.round(counts.practiced / counts.total * 100)}%</span></div><div className="gg-meter"><span style={{ width: `${counts.practiced / counts.total * 100}%` }} /></div></div>
      <Sticker name={worldSticker(level)} size={84} tilt={-6} float className="gg-hero-sticker" />
    </section>
    <nav className="gg-levels" id="gg-worlds" aria-label="Chọn cấp độ">{grammarLevels.map((item) => { const value = countForLevel(item, progress); const open = isLevelOpen(item, unlocked); return <Link className={`${item === level ? "selected" : ""} ${open ? "" : "is-locked"}`} aria-current={item === level ? "page" : undefined} href={open ? `${ROOT}/level/${item}` : `${ROOT}/placement?target=${item}`} key={item}>{open ? <Sticker name={worldSticker(item)} size={30} pop={false} /> : <LockKeyhole size={24} aria-hidden="true" />}<span><strong>{item}</strong><small>{open ? ready ? `${value.practiced}/${value.total}` : `${value.total} bài` : "Chưa mở"}</small></span></Link>; })}</nav>
    <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${level} (${lessons.length} bài)...`} aria-label="Tìm bài Grammar" />{query && <button onClick={() => setQuery("")}>Xóa</button>}</div>
    {query.trim() ? <ol className="gg-path">{found.length ? found.map((lesson) => node(lesson, lessons.indexOf(lesson) + 1)) : <p className="gg-path-empty">Không tìm thấy bài phù hợp.</p>}</ol>
      : <div className="gg-chapters">{chapters.map((chunk, index) => {
        const done = chunk.filter((lesson) => lessonDone(lesson, progress[lesson.code])).length;
        return <details className="gg-chapter" key={index} open={index + 1 === openChapter || chunk.some((lesson) => progress[lesson.code] && !lessonDone(lesson, progress[lesson.code]))}>
          <summary><span className="gg-chapter-name">Chặng {index + 1}</span><span className="gg-chapter-range">{chunk[0].title} → {chunk[chunk.length - 1].title}</span><span className="gg-chapter-count">{done}/{chunk.length} bài</span><span className="gg-meter" aria-hidden="true"><span style={{ width: `${done / chunk.length * 100}%` }} /></span></summary>
          <ol className="gg-path">{chunk.map((lesson, position) => node(lesson, index * CHAPTER + position + 1))}</ol>
          <Link className={`gg-chapter-test ${progress[chunk[0].code]?.chapterTest?.passed ? "is-passed" : ""}`} href={`${ROOT}/tests?level=${level}`}><ClipboardCheck size={17} aria-hidden="true" /><span><strong>Kiểm tra chặng {index + 1}</strong><small>{progress[chunk[0].code]?.chapterTest ? `Cao nhất ${Math.round(progress[chunk[0].code]!.chapterTest!.best * 100)}%${progress[chunk[0].code]!.chapterTest!.passed ? " · Đã đạt" : ""}` : `${chunk.length * 3} câu trộn từ ${chunk.length} bài`}</small></span><ChevronRight size={16} aria-hidden="true" /></Link>
        </details>;
      })}</div>}
    <div className="gg-preview-note">A1 mở sẵn. Mỗi cấp tiếp theo yêu cầu đạt ít nhất {GRAMMAR_PASS_PERCENT}% trong bài kiểm tra 20 câu của cấp trước. Câu hỏi đang biên tập; kết quả chỉ dùng để mở lộ trình học, không phải chứng nhận năng lực.</div>
  </>;
}

function SidebarProgress({ level, progress }: { level: GrammarLevel; progress: GrammarProgress }) {
  const counts = countForLevel(level, progress);
  const needsReview = Object.entries(progress).filter(([code]) => code.startsWith(level)).flatMap(([, entry]) => Object.entries(entry.responses)).filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW").length;
  const due = dueLessons(progress, clockNow()).filter((code) => code.startsWith(level)).length;
  return <section className="gg-side-card"><h3>Tiến độ cấp độ {level}</h3><div className="gg-side-progress"><span>{counts.practiced}/{counts.total} bài đã học xong</span><strong>{Math.round(counts.practiced / counts.total * 100)}%</strong></div><div className="gg-meter"><span style={{ width: `${counts.practiced / counts.total * 100}%` }} /></div>
    <div className="gg-side-stats"><div><strong>{counts.started}</strong><small>Bài đã mở</small></div><div><strong>{due}</strong><small>Đến hạn ôn</small></div><div><strong>{needsReview}</strong><small>Câu cần ôn</small></div></div>
    <Link className="gg-side-link" href={`${ROOT}/progress`}>Xem tiến độ chi tiết <ArrowRight size={14} /></Link></section>;
}

type SessionKind = "stage" | "spaced" | "retry" | "item" | "check";
type LessonView =
  | { type: "session"; id: number; kind: SessionKind; stage: string; entries: SessionEntry[] }
  | { type: "summary"; kind: SessionKind; stage: string; result: SessionResult; review?: GrammarReview; learned: boolean }
  | { type: "locked" };

function LessonWorkspace({ code, progress, update, initialTab, initialStage, initialItem, resume }: { code: string; progress: GrammarProgress; update: GrammarUpdate; initialTab: "theory" | "practice"; initialStage: string; initialItem: string; resume: boolean }) {
  const [tab, setTab] = useState<"theory" | "practice">(initialItem || resume || initialStage !== "guided" ? "practice" : initialTab);
  const [data, setData] = useState<{ guide: GrammarGuide; items: GrammarPracticeItem[] } | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<LessonView | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const sessions = useRef(0);
  // Progress is loaded before this mounts; the ref lets the fetch pick the starting session without refetching on every answer.
  const startProgress = useRef(progress);

  const begin = useCallback((kind: SessionKind, stage: string, picked: GrammarPracticeItem[], current: GrammarProgress) => {
    const entries = picked.map((item) => ({ code, item }));
    resetForSession(update, entries, current);
    sessions.current += 1;
    setView({ type: "session", id: sessions.current, kind, stage, entries });
    window.scrollTo({ top: 0 });
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
  const markRead = () => update(code, (value) => ({ ...value, theorySeen: true }));
  const quickCheck = () => {
    markRead();
    setTab("practice");
    const picked = stageQueue(items, "guided", lessonProgress, 2);
    if (items.some((item) => item.stage === "guided" && !answered(lessonProgress, item.id))) begin("check", "guided", picked, progress);
    else startStage(openStage(items, lessonProgress));
  };

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

  const rules = ruleOpen && <div className="gg-drawer" role="dialog" aria-modal="true" aria-label={`Quy tắc ${guide.title}`}>
    <button className="gg-drawer-backdrop" aria-label="Đóng quy tắc" onClick={() => setRuleOpen(false)} />
    <div className="gg-drawer-panel"><div className="gg-drawer-head"><strong>{guide.title}</strong><button onClick={() => setRuleOpen(false)} aria-label="Đóng quy tắc"><X size={18} /></button></div><Theory guide={guide} compact /></div>
  </div>;

  // A running session takes the whole card: no lesson header or tabs, just the question and its action bar.
  if (view?.type === "session") return <div className="gg-lesson gg-focus">
    <div className="gg-practice"><PracticeSession key={view.id} entries={view.entries} progress={progress} update={update}
      title={`${code} · ${guide.title}`} label={(entry) => view.kind === "check" ? "Kiểm tra nhanh" : stageNames[entry.item.stage] ?? ""}
      onRule={() => setRuleOpen(true)} onFinish={(result) => { setRuleOpen(false); finish(view.kind, view.stage, result); }} /></div>
    {rules}
  </div>;

  const reviewState = lessonProgress?.review;
  const spacedLabel = reviewState ? (isDue(reviewState, clockNow()) ? "Đến hạn" : `Mở ${formatDue(reviewState.due, clockNow())}`) : "Chưa mở";

  return <div className="gg-lesson"><div className="gg-crumb"><Link href={`${ROOT}/level/${lesson?.level ?? "A1"}`}><ArrowLeft size={16} /> {lesson?.level} · Lộ trình</Link><ChevronRight size={15} /><span>{code}</span></div>
    <div className="gg-lesson-head"><div><span className="gg-eyebrow">{code} · BẢN NHÁP BIÊN TẬP</span><h1>{guide.title}</h1><p>{guide.overview || guide.objectives[0]}</p></div><span className="gg-lesson-score">{reviewedCount(lessonProgress)}/{items.length} câu đã làm</span></div>
    <div className="gg-lesson-tabs"><button className={tab === "theory" ? "active" : ""} onClick={() => setTab("theory")}><BookOpen size={17} /> Lý thuyết</button><button className={tab === "practice" ? "active" : ""} onClick={openPractice}><PenLine size={17} /> Luyện tập · {items.length} câu</button></div>
    {tab === "theory" ? <Theory code={code} guide={guide} onCheck={quickCheck} onPractice={() => { markRead(); setTab("practice"); startStage(openStage(items, lessonProgress)); }} />
      : <div className="gg-practice">
        <div className="gg-stage-tabs">{stages.map((stage) => { const stageItems = items.filter((question) => question.stage === stage); const done = stageItems.filter((question) => answered(lessonProgress, question.id)).length; const active = view?.type === "summary" ? view.stage === stage : view?.type === "locked" && stage === "spaced_review"; return <button key={stage} className={active ? "active" : ""} onClick={() => stage === "spaced_review" ? beginSpaced(items, progress) : startStage(stage)}>{stageNames[stage]} <small>{stage === "spaced_review" ? spacedLabel : `${done}/${stageItems.length}`}</small></button>; })}</div>
        {view?.type === "locked" && <div className="gg-empty gg-locked"><LockKeyhole size={28} /><h2>Ôn cách quãng {reviewState ? `mở ${formatDue(reviewState.due, clockNow())}` : "chưa mở"}</h2><p>{reviewState ? "Ôn đúng hạn giúp bạn nhớ lâu hơn ôn dồn. Bài này sẽ tự xuất hiện trong mục Hôm nay khi đến hạn." : "Làm hết ba phần Có hướng dẫn, Tự luyện và Vận dụng để mở lịch ôn cho bài này."}</p><button className="gg-primary" onClick={() => startStage(openStage(items, lessonProgress))}>Luyện tiếp bài này <ArrowRight size={16} /></button></div>}
        {view?.type === "summary" && <LessonSummary code={code} view={view} items={items} progress={progress} next={next}
          onStage={startStage} onSpaced={() => beginSpaced(items, progress)} onTheory={() => setTab("theory")}
          onRetry={(entries) => begin("retry", view.stage, entries.map((entry) => entry.item), progress)} />}
        {!view && <div className="gg-empty"><PenLine size={28} /><h2>Sẵn sàng luyện tập</h2><button className="gg-primary" onClick={() => startStage(openStage(items, lessonProgress))}>Bắt đầu buổi học <ArrowRight size={16} /></button></div>}
      </div>}
    <div className="gg-lesson-bottom"><Link href={`${ROOT}/review`}><Flag size={16} /> Sổ ôn</Link>{next && <Link href={`${ROOT}/lesson/${next.code}`}>Bài tiếp: {next.title} <ArrowRight size={16} /></Link>}</div>
    {rules}</div>;
}

function LessonSummary({ code, view, items, progress, next, onStage, onSpaced, onRetry, onTheory }: {
  code: string; view: Extract<LessonView, { type: "summary" }>; items: GrammarPracticeItem[]; progress: GrammarProgress; next?: GrammarCatalogLesson;
  onStage: (stage: string) => void; onSpaced: () => void; onRetry: (entries: SessionEntry[]) => void; onTheory: () => void;
}) {
  const now = clockNow();
  const lessonProgress = progress[code];
  const score = sessionScore(view.result);
  const teachingLeft = !mainStagesDone(items, lessonProgress);
  const stage = openStage(items, lessonProgress);
  const left = items.filter((item) => item.stage === stage && !answered(lessonProgress, item.id)).length;
  const passed = score.graded ? score.correct / score.graded >= REVIEW_PASS : true;
  if (view.kind === "check") {
    const allRight = score.graded > 0 && score.correct === score.graded;
    return <SessionSummary result={view.result} progress={progress} title="Kiểm tra nhanh" note={allRight ? "Bạn đã nắm quy tắc chính. Vào luyện tập để làm chắc hơn." : "Có câu chưa đúng. Đọc lại quy tắc liên quan trước khi luyện sẽ đỡ sai lặp lại."}>
      <button className="gg-primary" onClick={() => onStage(stage)}>Bắt đầu luyện tập <ArrowRight size={16} /></button>
      {!allRight && <button className="gg-secondary" onClick={onTheory}><BookOpen size={14} aria-hidden="true" /> Đọc lại lý thuyết</button>}
    </SessionSummary>;
  }
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

/**
 * Words of the rule's formula ("had + V3", "I/you/he…") that also appear in an example are highlighted there,
 * and so are words carrying a two-to-four letter suffix the formula names ("noun + -es" marks "boxes").
 */
const formulaNoise = new Set(["subject", "verb", "noun", "nouns", "object", "pronoun", "plural", "singular", "past", "present", "simple", "participle", "adjective", "adverb", "clause", "base", "form", "infinitive", "consonant", "vowel", "some", "ending", "vary", "the", "a", "an"]);
function highlight(sentence: string, formula: string): ReactNode {
  const lower = formula.toLowerCase();
  const suffixes = [...lower.matchAll(/-([a-z]{2,4})\b/g)].map((match) => match[1]);
  const words = new Set((lower.replace(/-[a-z]{1,4}\b/g, " ").match(/[a-z']+/g) ?? []).filter((word) => word.length > 1 && !formulaNoise.has(word)));
  if (!words.size && !suffixes.length) return sentence;
  const marked = (word: string) => words.has(word.toLowerCase()) || suffixes.some((suffix) => word.length > suffix.length + 1 && word.toLowerCase().endsWith(suffix));
  return sentence.split(/(\b[A-Za-z']+\b)/).map((part, index) => /^[A-Za-z']+$/.test(part) && marked(part) ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>);
}

function Example({ example, formula }: { example: GrammarExample; formula: string }) {
  return <p className="gg-example"><span className="gg-example-line"><b>{highlight(example.en, formula)}</b><button type="button" className="gg-say" onClick={() => speakText(example.en)} aria-label={`Nghe câu ${example.en}`}><Volume2 size={15} /></button></span>{example.vi && <span>{example.vi}</span>}</p>;
}

function Theory({ code, guide, compact = false, onCheck, onPractice }: { code?: string; guide: GrammarGuide; compact?: boolean; onCheck?: () => void; onPractice?: () => void }) {
  return <div className={`gg-theory ${compact ? "is-compact" : ""}`}>
    {!compact && guide.objectives.length > 0 && <div className="gg-callout"><strong>Mục tiêu</strong><ul>{guide.objectives.map((objective, i) => <li key={i}>{objective}</li>)}</ul></div>}
    <div className="gg-rules">{guide.sections.map((section, position) => <article key={position} className="gg-rule"><span className="gg-rule-number">{String(position + 1).padStart(2, "0")}</span><div>
      <h3>{section.heading}</h3>
      {section.formula && <p className="gg-formula">{section.formula}</p>}
      {section.explanation && <p className="gg-rule-text">{section.explanation}</p>}
      {section.examples.map((example, i) => <Example key={i} example={example} formula={section.formula} />)}
      {section.points.length > 0 && <ul className="gg-points">{section.points.map((point, i) => <li key={i}>{point.text}{point.en && <Example example={{ en: point.en, vi: point.vi }} formula={section.formula || point.text} />}</li>)}</ul>}
      {section.table && <div className="gg-table-wrap"><table className="gg-table"><thead><tr>{section.table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} data-label={section.table!.columns[j]}>{cell}</td>)}</tr>)}</tbody></table></div>}
      {section.mistake && <MistakePair mistake={section.mistake} />}
      {section.note && <p className="gg-note">{section.note}</p>}
    </div></article>)}</div>
    {guide.mistakes.length > 0 && <div className="gg-extra-notes"><h3>Lỗi thường gặp</h3>{guide.mistakes.map((mistake, i) => <MistakePair key={i} mistake={mistake} />)}</div>}
    {guide.caveats.length > 0 && <div className="gg-extra-notes"><h3>Lưu ý</h3><ul className="gg-points">{guide.caveats.map((caveat, i) => <li key={i}>{caveat}</li>)}</ul></div>}
    {!compact && code && connectorLessons.has(code) && <Link className="gg-news-link" href={`${ROOT}/live`}><Newspaper size={20} aria-hidden="true" /><span><strong>Luyện thêm trên tin thật</strong><small>Điền từ nối còn thiếu trong các bài Daily News, có chấm đáp án.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>}
    {!compact && code && /^[BC]/.test(code) && <IeltsApply code={code} />}
    {!compact && <div className="gg-theory-action"><div><strong>Đọc xong rồi?</strong><span>Trả lời 2 câu để chắc mình đã hiểu quy tắc.</span></div><button className="gg-secondary" onClick={onPractice}>Vào luyện tập</button><button className="gg-primary" onClick={onCheck}>Kiểm tra nhanh 2 câu <ArrowRight size={17} /></button></div>}
  </div>;
}

/** Lessons about linking ideas, where the Daily News connector drill is the natural next step. */
const connectorLessons = new Set(["A1-30", "B1-32", "B2-18", "B2-29", "C1-27", "C2-09", "C2-20"]);
const ieltsTopics = ["giáo dục", "công nghệ", "môi trường", "sức khỏe", "công việc", "cuộc sống đô thị", "du lịch", "truyền thông", "gia đình", "giao thông"];

/** A writing prompt that puts the lesson's structure into an IELTS answer; the draft stays on this device. */
function IeltsApply({ code }: { code: string }) {
  const lesson = catalog.find((item) => item.code === code);
  const key = `ieltswithharry-grammar-ielts:${code}`;
  const [draft, setDraft] = useState(() => { try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; } });
  if (!lesson) return null;
  const topic = ieltsTopics[catalog.indexOf(lesson) % ieltsTopics.length];
  const save = (value: string) => { setDraft(value); try { window.localStorage.setItem(key, value); } catch { /* storage blocked: keep the draft on screen */ } };
  return <section className="gg-ielts">
    <div className="gg-ielts-head"><Sticker name="pencil" size={40} tilt={-6} pop={false} /><div><span className="gg-eyebrow">DÙNG TRONG IELTS</span><h3>Viết 1–2 câu về chủ đề {topic}</h3></div></div>
    <p>Tiêu chí Grammatical Range &amp; Accuracy xem bạn dùng cấu trúc đa dạng và chính xác đến đâu. Viết một câu cho Writing Task 2 hoặc Speaking Part 3 có dùng <b>{lesson.title}</b>.</p>
    <p className="gg-ielts-model"><span>Công thức</span><code>{lesson.formula}</code><span>Câu mẫu của bài</span><em>{lesson.example}</em></p>
    <textarea value={draft} onChange={(event) => save(event.target.value)} rows={3} placeholder={`Ví dụ: một câu về ${topic} có dùng ${lesson.title}…`} aria-label="Câu IELTS của bạn" />
    <ul className="gg-ielts-check"><li>Câu có đúng công thức ở trên không?</li><li>Có mắc lỗi nào trong mục “Lỗi thường gặp” không?</li><li>Câu có trả lời đúng ý chủ đề, không chỉ để khoe cấu trúc?</li></ul>
    <small>Câu của bạn chỉ lưu trên thiết bị này và không được chấm tự động.</small>
  </section>;
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
      window.scrollTo({ top: 0 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được câu ôn."); setView({ type: "list" }); }
  }

  const header = <><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">ÔN TẬP</span><h1>Sổ câu cần ôn</h1></>;
  if (view.type === "loading") return <div className="gg-subpage">{header}<div className="gg-loading">Đang chuẩn bị câu ôn…</div></div>;
  if (view.type === "session") return <div className="gg-lesson gg-focus"><div className="gg-practice"><PracticeSession key={view.id} entries={view.entries} progress={progress} update={update}
    title="Ôn câu sai" label={(entry) => `${entry.code} · ${catalog.find((lesson) => lesson.code === entry.code)?.title ?? ""}`} onFinish={(result) => setView({ type: "summary", result })} /></div></div>;
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
      : <div className="gg-empty"><Sticker name="check" size={60} tilt={-6} pop={false} /><h2>{flagged.length ? "Không có câu phù hợp" : "Sổ ôn đang trống"}</h2><p>Câu trả lời sai trong lúc luyện tập sẽ tự vào đây.</p><Link className="gg-primary" href={ROOT}>Xem lộ trình <ArrowRight size={16} /></Link></div>}</div>;
}

const WEEKS = 8;
const DAY = 86_400_000;
const startOfWeek = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.getTime(); };
const shortDate = (time: number) => new Date(time).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });

function ProgressPage({ progress, ready, unlocked }: { progress: GrammarProgress; ready: boolean; unlocked: GrammarLevel[] }) {
  const now = clockNow();
  const nowTime = new Date(now).getTime();
  const responses = Object.values(progress).flatMap((value) => Object.entries(value.responses).filter(([id]) => editorialId(id)).map(([, response]) => response));
  const firsts = responses.map((response) => response.first).filter((first): first is NonNullable<typeof first> => Boolean(first) && first!.correct !== null);
  const firstRight = firsts.filter((first) => first.correct).length;
  const learned = catalog.filter((lesson) => lessonDone(lesson, progress[lesson.code])).length;
  const due = dueLessons(progress, now);
  const thisWeek = startOfWeek(nowTime);
  const weeks = Array.from({ length: WEEKS }, (_, index) => {
    const start = thisWeek - (WEEKS - 1 - index) * 7 * DAY;
    const inWeek = firsts.filter((first) => { const time = new Date(first.at).getTime(); return time >= start && time < start + 7 * DAY; });
    return { start, total: inWeek.length, right: inWeek.filter((first) => first.correct).length };
  });
  const activity = new Map<string, number>();
  for (const response of responses) if (response.status && response.status !== "SKIPPED") { const key = new Date(response.updatedAt).toDateString(); activity.set(key, (activity.get(key) ?? 0) + 1); }
  const days = Array.from({ length: WEEKS * 7 }, (_, index) => { const time = thisWeek - (WEEKS - 1) * 7 * DAY + index * DAY; return { time, count: time > nowTime ? -1 : activity.get(new Date(time).toDateString()) ?? 0 }; });
  const shade = (count: number) => count < 0 ? "future" : count === 0 ? "l0" : count < 5 ? "l1" : count < 15 ? "l2" : count < 30 ? "l3" : "l4";
  const weakest = Object.entries(progress).map(([code, value]) => ({ code, lesson: catalog.find((item) => item.code === code), open: Object.entries(value.responses).filter(([id, response]) => editorialId(id) && response.status === "NEED_REVIEW").length }))
    .filter((row) => row.lesson && row.open > 0).sort((a, b) => b.open - a.open).slice(0, 5);
  const latest = [...weeks].reverse().find((week) => week.total);
  return <div className="gg-subpage gg-progress"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">TIẾN ĐỘ</span><h1>Hành trình Grammar</h1><p>Muốn mở cấp tiếp theo, hãy đạt ít nhất {GRAMMAR_PASS_PERCENT}% trong bài kiểm tra của cấp trước. Điểm luyện tập từng bài không thay thế bài kiểm tra này.</p>
    {!ready ? <div className="gg-loading">Đang tải tiến độ…</div> : <>
      <div className="gg-stat-tiles">
        <div><strong>{learned}</strong><span>Bài đã học xong</span></div>
        <div><strong>{responses.filter((response) => response.status === "UNDERSTOOD" || response.status === "NEED_REVIEW").length}</strong><span>Câu đã làm</span></div>
        <div><strong>{firsts.length ? `${Math.round(firstRight / firsts.length * 100)}%` : "—"}</strong><span>Đúng ngay lần đầu</span></div>
        <Link href={due.length ? `${ROOT}/lesson/${due[0]}?stage=spaced_review` : ROOT}><strong>{due.length}</strong><span>Bài đến hạn ôn</span></Link>
      </div>
      <div className="gg-progress-grid">
        <section className="gg-panel"><h2>Đúng ngay lần đầu theo tuần</h2><p className="gg-panel-sub">{latest ? `Tuần gần nhất có bài: ${latest.right}/${latest.total} câu (${Math.round(latest.right / latest.total * 100)}%)` : "Làm vài buổi để thấy biểu đồ."}</p>
          <div className="gg-bars" role="img" aria-label="Tỉ lệ đúng ngay lần đầu trong 8 tuần gần đây">{weeks.map((week) => { const share = week.total ? week.right / week.total : 0; const tip = week.total ? `Tuần ${shortDate(week.start)}: ${week.right}/${week.total} đúng (${Math.round(share * 100)}%)` : `Tuần ${shortDate(week.start)}: chưa làm`; return <div className="gg-bar" key={week.start} title={tip} tabIndex={0} aria-label={tip}><span className={week.total ? "" : "is-empty"} style={{ height: week.total ? `${Math.max(share * 100, 4)}%` : "3px" }} /><small>{shortDate(week.start)}</small></div>; })}</div>
          <table className="gg-sr-only"><caption>Tỉ lệ đúng ngay lần đầu theo tuần</caption><tbody>{weeks.map((week) => <tr key={week.start}><th>{shortDate(week.start)}</th><td>{week.total ? `${week.right}/${week.total}` : "chưa làm"}</td></tr>)}</tbody></table>
        </section>
        <section className="gg-panel"><h2>Ngày học trong 8 tuần</h2><p className="gg-panel-sub">{activity.size} ngày có làm bài</p>
          <div className="gg-heat" role="img" aria-label={`${activity.size} ngày có làm bài trong 8 tuần`}>{days.map((day) => <span key={day.time} className={shade(day.count)} title={day.count < 0 ? "" : `${shortDate(day.time)}: ${day.count} câu`} />)}</div>
          <div className="gg-heat-legend"><span>Ít</span><i className="l0" /><i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" /><span>Nhiều</span></div>
        </section>
      </div>
      {weakest.length > 0 && <section className="gg-panel"><h2>Bài còn nhiều câu sai</h2><div className="gg-weak">{weakest.map((row) => <Link key={row.code} href={`${ROOT}/lesson/${row.code}?resume=1`}><span>{row.code}</span><strong>{row.lesson!.title}</strong><small>{row.open} câu cần ôn</small><ArrowRight size={15} /></Link>)}</div><Link className="gg-side-link" href={`${ROOT}/review`}>Mở Sổ ôn <ArrowRight size={14} /></Link></section>}
      <div className="gg-progress-levels">{grammarLevels.map((level) => { const value = countForLevel(level, progress); const levelDue = due.filter((code) => code.startsWith(level)).length; const open = isLevelOpen(level, unlocked); return <Link key={level} href={open ? `${ROOT}/level/${level}` : `${ROOT}/placement?target=${level}`}>{open ? <Sticker name={worldSticker(level)} size={40} pop={false} /> : <LockKeyhole size={30} aria-hidden="true" />}<div><strong>{level} · {grammarWorlds[level].name}</strong><small>{open ? `${value.practiced}/${value.total} bài học xong · ${value.started} bài đã mở${levelDue ? ` · ${levelDue} bài đến hạn ôn` : ""}` : "Chưa mở · kiểm tra lên cấp"}</small><div className="gg-meter"><span style={{ width: `${value.practiced / value.total * 100}%` }} /></div></div><ArrowRight size={17} /></Link>; })}</div>
    </>}</div>;
}
