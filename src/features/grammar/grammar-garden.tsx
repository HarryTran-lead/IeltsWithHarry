"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardCheck, Flag, LockKeyhole, Map, PenLine, Search, Sprout, Star, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import catalogJson from "@/data/grammar/catalog.json";
import { grammarLevels, grammarWorlds, practiced, reviewedCount, type GrammarCatalogLesson, type GrammarGuide, type GrammarLessonProgress, type GrammarPracticeItem, type GrammarProgress, type GrammarResponse, type GrammarLevel } from "@/lib/grammar/types";
import "./grammar-garden.css";

const catalog = catalogJson as GrammarCatalogLesson[];
const ROOT = "/app/grammar";
const STORAGE = "ieltswithharry-grammar-v1";
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
  return { total: lessons.length, practiced: lessons.filter((lesson) => practiced(progress[lesson.code])).length, started: lessons.filter((lesson) => progress[lesson.code]).length };
}

function nextLesson(level: GrammarLevel, progress: GrammarProgress) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  const active = lessons.filter((lesson) => progress[lesson.code] && !practiced(progress[lesson.code]))
    .sort((a, b) => progress[b.code].updatedAt.localeCompare(progress[a.code].updatedAt))[0];
  return active ?? lessons.find((lesson) => !practiced(progress[lesson.code])) ?? lessons[0];
}

function progressLabel(value?: GrammarLessonProgress) {
  if (practiced(value)) return "Đã luyện 30/30";
  const reviewed = reviewedCount(value);
  if (reviewed) return `Đã đối chiếu ${reviewed}/30`;
  return value?.theorySeen ? "Đã học lý thuyết" : "Chưa bắt đầu";
}

export function GrammarGarden() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { progress, ready, syncError, update } = useGrammarProgress();
  const parts = pathname.split("/");
  const route = parts[3] ?? "";
  const level = grammarLevels.includes(parts[4] as GrammarLevel) ? parts[4] as GrammarLevel : "A1";
  const lessonCode = route === "lesson" ? parts[4] : "";
  const [query, setQuery] = useState("");

  return <div className="gg" id="che-do-hoc">
    {syncError && <div className="gg-sync" role="status">{syncError}</div>}
    {route === "lesson" ? <LessonWorkspace key={lessonCode} code={lessonCode} progress={progress} update={update} initialTab={searchParams.get("tab") === "practice" ? "practice" : "theory"} initialItem={searchParams.get("item") ?? ""} />
      : route === "review" ? <ReviewPage progress={progress} />
      : route === "progress" ? <ProgressPage progress={progress} />
      : route === "tests" ? <UnavailableTest />
      : <>
        <div className="gg-crumb"><Link href={ROOT}><Sprout size={17} /> Grammar</Link><ChevronRight size={15} /><span>{level}</span><button className="gg-world-switch" onClick={() => document.getElementById("gg-worlds")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Map size={16} /> Đổi thế giới</button></div>
        <div className="gg-layout">
          <main className="gg-main">
            <Roadmap level={level} progress={progress} query={query} setQuery={setQuery} ready={ready} router={router} chapterQuery={searchParams.get("chapter")} />
          </main>
          <aside className="gg-aside"><SidebarProgress level={level} progress={progress} /></aside>
        </div>
      </>}
  </div>;
}

function Roadmap({ level, progress, query, setQuery, ready, router, chapterQuery }: {
  level: GrammarLevel; progress: GrammarProgress; query: string; setQuery: (value: string) => void; ready: boolean;
  router: ReturnType<typeof useRouter>; chapterQuery: string | null;
}) {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  const chapters = Math.ceil(lessons.length / 5);
  const chapter = Math.min(chapters, Math.max(1, Math.floor(Number(chapterQuery) || 1)));
  const chapterLessons = lessons.slice((chapter - 1) * 5, chapter * 5);
  const completed = chapterLessons.filter((lesson) => practiced(progress[lesson.code])).length;
  const world = grammarWorlds[level];
  const found = query.trim() ? lessons.filter((lesson) => `${lesson.code} ${lesson.title} ${lesson.group}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const goChapter = (value: number) => router.push(`${ROOT}/level/${level}?chapter=${value}`);
  return <>
    <section className="gg-hero">
      <div className="gg-hero-copy"><span className="gg-eyebrow">WORLD {grammarLevels.indexOf(level) + 1} · {level}</span><h1>{world.name}</h1><p>Chương {chapter}: {chapterLessons[0]?.group ?? world.description}</p><div className="gg-hero-metric"><span>{completed}/5 bài đã luyện đủ</span><span>{Math.round(completed / 5 * 100)}%</span></div><div className="gg-meter"><span style={{ width: `${completed / 5 * 100}%` }} /></div></div>
      <div className="gg-hero-symbol" aria-hidden="true">{world.icon}</div>
    </section>
    <div className="gg-roadmap-toolbar"><div><h2><BookOpen size={22} /> Hành trình chương {chapter}</h2><p>Chọn bài để xem lý thuyết và tự đối chiếu 30 hoạt động.</p></div><div className="gg-chapter-controls"><button disabled={chapter === 1} onClick={() => goChapter(chapter - 1)} aria-label="Chương trước"><ChevronLeft size={18} /></button><select aria-label="Chọn chương" value={chapter} onChange={(event) => goChapter(Number(event.target.value))}>{Array.from({ length: chapters }, (_, index) => <option value={index + 1} key={index}>Chương {index + 1}</option>)}</select><button disabled={chapter === chapters} onClick={() => goChapter(chapter + 1)} aria-label="Chương sau"><ChevronRight size={18} /></button></div></div>
    <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${level} (${lessons.length} bài)...`} aria-label="Tìm bài Grammar" />{query && <button onClick={() => setQuery("")}>Xóa</button>}</div>
    {query.trim() ? <div className="gg-results">{found.length ? found.map((lesson) => <Link key={lesson.code} href={`${ROOT}/lesson/${lesson.code}`}><span>{lesson.code}</span><strong>{lesson.title}</strong><small>{progressLabel(progress[lesson.code])}</small><ArrowRight size={16} /></Link>) : <p>Không tìm thấy bài phù hợp.</p>}</div> : <div className="gg-map" aria-label={`Bản đồ chương ${chapter}`}>
      <div className="gg-map-shade" />
      {chapterLessons.map((lesson, index) => <Link className={`gg-map-card gg-map-card-${index + 1} ${practiced(progress[lesson.code]) ? "done" : ""} ${index === chapterLessons.findIndex((item) => !practiced(progress[item.code])) ? "current" : ""}`} key={lesson.code} href={`${ROOT}/lesson/${lesson.code}`}>
        <span className="gg-map-icon">{practiced(progress[lesson.code]) ? <Check size={25} /> : <BookOpen size={23} />}</span><span className="gg-map-label"><small>BÀI {String((chapter - 1) * 5 + index + 1).padStart(2, "0")}</small><strong>{lesson.title}</strong><em>{progressLabel(progress[lesson.code])}</em></span><ChevronRight className="gg-map-chevron" size={17} />
      </Link>)}
      <div className="gg-checkpoint"><LockKeyhole size={20} /><span><strong>Kiểm tra chương</strong><small>Chưa có đề khách quan được duyệt</small></span></div>
    </div>}
    <div className="gg-worlds" id="gg-worlds">{grammarLevels.map((item) => { const counts = countForLevel(item, progress); return <Link className={item === level ? "selected" : ""} href={`${ROOT}/level/${item}`} key={item}><span>{grammarWorlds[item].icon}</span><strong>{item}</strong><small>{grammarWorlds[item].name}<br />{ready ? `${counts.practiced}/${counts.total} bài đã luyện` : `${counts.total} bài`}</small></Link>; })}</div>
    <div className="gg-preview-note">Bài tự luận được tự đối chiếu, không chấm điểm tự động hay mở khóa cấp độ. Kiểm tra có điểm sẽ mở khi có ngân hàng câu khách quan.</div>
  </>;
}

function SidebarProgress({ level, progress }: { level: GrammarLevel; progress: GrammarProgress }) {
  const counts = countForLevel(level, progress);
  const current = nextLesson(level, progress);
  const currentProgress = progress[current.code];
  const needsReview = Object.values(progress).flatMap((entry) => Object.values(entry.responses)).filter((response) => response.status === "NEED_REVIEW").length;
  const tasks = [
    { text: `Đọc lý thuyết ${current.code}`, done: Boolean(currentProgress?.theorySeen), href: `${ROOT}/lesson/${current.code}` },
    { text: `Tự đối chiếu 5 câu của ${current.code}`, done: reviewedCount(currentProgress) >= 5, href: `${ROOT}/lesson/${current.code}?tab=practice` },
    { text: `Luyện đủ 30 câu của ${current.code}`, done: practiced(currentProgress), href: `${ROOT}/lesson/${current.code}?tab=practice` },
  ];
  return <>
    <section className="gg-side-card"><h3>Tiến độ cấp độ {level}</h3><div className="gg-side-progress"><span>{counts.practiced}/{counts.total} bài đã luyện đủ</span><strong>{Math.round(counts.practiced / counts.total * 100)}%</strong></div><div className="gg-meter"><span style={{ width: `${counts.practiced / counts.total * 100}%` }} /></div><div className="gg-side-stats"><div><Star size={22} /><strong>{counts.started}</strong><small>Bài đã mở</small></div><div><BookOpen size={22} /><strong>{counts.practiced}</strong><small>Đã luyện đủ</small></div><div><Target size={22} /><strong>{needsReview}</strong><small>Cần ôn</small></div></div></section>
    <section className="gg-side-card"><div className="gg-side-head"><h3>Nhiệm vụ hôm nay</h3><Link href={`${ROOT}/progress`}>Xem tiến độ <ArrowRight size={14} /></Link></div><div className="gg-tasks">{tasks.map((task) => <Link href={task.href} key={task.text}><span className={task.done ? "checked" : ""}>{task.done && <Check size={12} />}</span>{task.text}</Link>)}</div><p className="gg-side-foot">Nhiệm vụ cập nhật theo bài làm thực tế.</p></section>
    <section className="gg-side-card"><h3>Bài học hiện tại</h3><div className="gg-current"><span><BookOpen size={25} /></span><div><small>{current.code}</small><strong>{current.title}</strong><p>{current.formula}</p></div></div><Link className="gg-primary" href={`${ROOT}/lesson/${current.code}`}>Tiếp tục học <ArrowRight size={17} /></Link><div className="gg-steps"><div><BookOpen size={17} /><span>Lý thuyết</span><strong>{currentProgress?.theorySeen ? "1/1" : "0/1"}</strong></div><div><PenLine size={17} /><span>Luyện tự đối chiếu</span><strong>{reviewedCount(currentProgress)}/30</strong></div><div><ClipboardCheck size={17} /><span>Kiểm tra có điểm</span><strong>Chưa mở</strong></div></div></section>
  </>;
}

function LessonWorkspace({ code, progress, update, initialTab, initialItem }: { code: string; progress: GrammarProgress; update: (code: string, edit: (value: GrammarLessonProgress) => GrammarLessonProgress) => void; initialTab: "theory" | "practice"; initialItem: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<{ guide: GrammarGuide; items: GrammarPracticeItem[] } | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`).then(async (response) => { if (!response.ok) throw new Error("Không tải được bài học."); return response.json(); }).then((result) => { if (active) { setData(result); const initialIndex = result.items.findIndex((item: GrammarPracticeItem) => item.item_id === initialItem); if (initialIndex >= 0) setIndex(initialIndex); } }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [code, initialItem]);
  if (error) return <div className="gg-error"><p>{error}</p><Link href={ROOT}>Về lộ trình</Link></div>;
  if (!data) return <div className="gg-loading">Đang tải bài học…</div>;
  const { guide, items } = data;
  const lessonProgress = progress[code];
  const current = items[index];
  const response = lessonProgress?.responses[current?.item_id] ?? { answer: "", updatedAt: "" };
  function editResponse(patch: Partial<GrammarResponse>) {
    update(code, (value) => ({ ...value, responses: { ...value.responses, [current.item_id]: { ...response, ...patch, updatedAt: new Date().toISOString() } } }));
  }
  const levelLessons = catalog.filter((lesson) => lesson.level === guide.level);
  const next = levelLessons[levelLessons.findIndex((lesson) => lesson.code === code) + 1];
  return <div className="gg-lesson">
    <div className="gg-crumb"><Link href={`${ROOT}/level/${guide.level}`}><ArrowLeft size={16} /> {guide.level} · Lộ trình</Link><ChevronRight size={15} /><span>{code}</span></div>
    <div className="gg-lesson-head"><div><span className="gg-eyebrow">{code} · {guide.group}</span><h1>{guide.title}</h1><p>{guide.formula}</p></div><span className="gg-lesson-score">{reviewedCount(lessonProgress)}/30 câu đã đối chiếu</span></div>
    <div className="gg-lesson-tabs"><button className={tab === "theory" ? "active" : ""} onClick={() => { setTab("theory"); router.replace(`${ROOT}/lesson/${code}`); }}><BookOpen size={17} /> Lý thuyết</button><button className={tab === "practice" ? "active" : ""} onClick={() => { setTab("practice"); router.replace(`${ROOT}/lesson/${code}?tab=practice`); }}><PenLine size={17} /> Luyện tập · 30 câu</button></div>
    {tab === "theory" ? <div className="gg-theory"><div className="gg-callout"><strong>Ví dụ</strong><p>{guide.example}</p><small>{guide.translation}</small></div><div className="gg-guide-grid">{guide.guide.filter((section) => !section.title.includes("Nguyên tắc chấm")).map((section, position) => <article key={position}><span>{String(position + 1).padStart(2, "0")}</span><h3>{section.title.replace(/^\d+\.\s*/, "")}</h3><p>{section.body}</p></article>)}</div><div className="gg-theory-action"><button className="gg-primary" onClick={() => { update(code, (value) => ({ ...value, theorySeen: true })); setTab("practice"); router.replace(`${ROOT}/lesson/${code}?tab=practice`); }}>{lessonProgress?.theorySeen ? "Tiếp tục luyện tập" : "Đã đọc lý thuyết · Luyện tập"} <ArrowRight size={17} /></button></div></div>
      : <div className="gg-practice"><div className="gg-practice-top"><div><span className="gg-eyebrow">TỰ ĐỐI CHIẾU · KHÔNG CHẤM ĐIỂM</span><h2>Câu {index + 1} / {items.length}</h2></div><div className="gg-practice-bar"><span style={{ width: `${(index + 1) / items.length * 100}%` }} /></div></div><div className="gg-question"><p>{current.question}</p>{current.source_english && <blockquote>{current.source_english}<small>{current.source_vietnamese}</small></blockquote>}</div><label className="gg-answer-label" htmlFor="grammar-answer">Câu trả lời của bạn</label><textarea id="grammar-answer" value={response.answer} onChange={(event) => editResponse({ answer: event.target.value, revealed: false, status: undefined })} placeholder="Viết câu trả lời hoặc cách bạn hiểu quy tắc ở đây…" rows={5} /><div className="gg-question-actions"><button disabled={!response.answer.trim() || response.revealed} className="gg-primary" onClick={() => editResponse({ revealed: true })}>Xem đáp án tham khảo</button><button className="gg-secondary" onClick={() => editResponse({ status: "SKIPPED", revealed: false })}>Để sau</button></div>
      {response.revealed && <div className="gg-reference"><span>ĐÁP ÁN THAM KHẢO</span><p>{current.reference_answer}</p><strong>Giải thích</strong><p>{current.answer_explanation}</p><small>Câu trả lời khác mẫu có thể vẫn đúng. Bạn tự đối chiếu ý nghĩa và cấu trúc; hệ thống không tự chấm câu mở.</small><div className="gg-review-actions"><button onClick={() => editResponse({ status: "UNDERSTOOD" })} className={response.status === "UNDERSTOOD" ? "selected" : ""}><Check size={16} /> Đã hiểu</button><button onClick={() => editResponse({ status: "NEED_REVIEW" })} className={response.status === "NEED_REVIEW" ? "selected" : ""}><Flag size={16} /> Cần ôn lại</button></div></div>}
      {response.status === "SKIPPED" && <p className="gg-skip-note">Đã để sau. Bạn có thể quay lại câu này bất cứ lúc nào.</p>}
      <div className="gg-practice-nav"><button disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} /> Câu trước</button><select value={index} onChange={(event) => setIndex(Number(event.target.value))} aria-label="Chọn câu luyện tập">{items.map((item, position) => <option key={item.item_id} value={position}>Câu {position + 1}{lessonProgress?.responses[item.item_id]?.status ? " ✓" : ""}</option>)}</select><button onClick={() => index < items.length - 1 ? setIndex(index + 1) : router.push(`${ROOT}/level/${guide.level}`)}>{index < items.length - 1 ? "Câu tiếp" : "Về lộ trình"} <ChevronRight size={16} /></button></div></div>}
    <div className="gg-lesson-bottom"><Link href={`${ROOT}/review`}><Flag size={16} /> Sổ ôn</Link>{next && <Link href={`${ROOT}/lesson/${next.code}`}>Bài tiếp: {next.title} <ArrowRight size={16} /></Link>}</div>
  </div>;
}

function ReviewPage({ progress }: { progress: GrammarProgress }) {
  const [query, setQuery] = useState("");
  const flagged = Object.entries(progress).flatMap(([code, value]) => Object.entries(value.responses).filter(([, response]) => response.status === "NEED_REVIEW").map(([itemId]) => ({ code, itemId, lesson: catalog.find((item) => item.code === code) })));
  const filtered = flagged.filter((item) => `${item.code} ${item.lesson?.title}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">ÔN TẬP</span><h1>Sổ câu cần ôn</h1><p>Những câu bạn tự đánh dấu “Cần ôn lại” sẽ xuất hiện ở đây.</p><div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bài cần ôn…" /></div>{filtered.length ? <div className="gg-results">{filtered.map((item) => <Link key={item.itemId} href={`${ROOT}/lesson/${item.code}?tab=practice&item=${encodeURIComponent(item.itemId)}`}><span>{item.code}</span><strong>{item.lesson?.title}</strong><small>{item.itemId}</small><ArrowRight size={16} /></Link>)}</div> : <div className="gg-empty"><Flag size={28} /><h2>{flagged.length ? "Không có câu phù hợp" : "Sổ ôn đang trống"}</h2><p>Trong lúc luyện tập, chọn “Cần ôn lại” sau khi xem lời giải.</p><Link className="gg-primary" href={ROOT}>Xem lộ trình <ArrowRight size={16} /></Link></div>}</div>;
}

function ProgressPage({ progress }: { progress: GrammarProgress }) {
  const dates = new Set(Object.values(progress).flatMap((value) => [value.theorySeen ? value.updatedAt.slice(0, 10) : "", ...Object.values(value.responses).filter((response) => response.status).map((response) => response.updatedAt.slice(0, 10))]).filter(Boolean));
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">TIẾN ĐỘ</span><h1>Hành trình Grammar</h1><p>Tiến độ thể hiện bài đã học và câu đã tự đối chiếu. Chưa có điểm Mastery vì ngân hàng trắc nghiệm đang chờ duyệt.</p><div className="gg-summary"><div><strong>{Object.values(progress).filter((value) => value.theorySeen).length}</strong><span>Bài đã học lý thuyết</span></div><div><strong>{Object.values(progress).reduce((sum, value) => sum + reviewedCount(value), 0)}</strong><span>Câu đã đối chiếu</span></div><div><strong>{dates.size}</strong><span>Ngày có hoạt động</span></div></div><div className="gg-progress-levels">{grammarLevels.map((level) => { const value = countForLevel(level, progress); return <Link key={level} href={`${ROOT}/level/${level}`}><span className="gg-world-icon">{grammarWorlds[level].icon}</span><div><strong>{level} · {grammarWorlds[level].name}</strong><small>{value.practiced}/{value.total} bài luyện đủ · {value.started} bài đã mở</small><div className="gg-meter"><span style={{ width: `${value.practiced / value.total * 100}%` }} /></div></div><ArrowRight size={17} /></Link>; })}</div></div>;
}

function UnavailableTest() {
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><div className="gg-empty"><LockKeyhole size={30} /><h1>Bài kiểm tra đang chờ duyệt</h1><p>Gói hiện tại chỉ gồm bài luyện tự đối chiếu. Bài kiểm tra có điểm sẽ mở khi có câu khách quan và đáp án được biên tập, kiểm định.</p><Link className="gg-primary" href={ROOT}>Học theo lộ trình <ArrowRight size={16} /></Link></div></div>;
}
