"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, ClipboardCheck, Compass, RotateCcw } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { clockNow } from "@/lib/grammar/schedule";
import { grammarLevels, grammarWorlds, type GrammarLessonProgress, type GrammarLevel, type GrammarPracticeItem, type GrammarProgress } from "@/lib/grammar/types";
import { catalog, lessonDone, ROOT } from "./grammar-catalog";
import type { GrammarUpdate } from "./grammar-progress";
import { PracticeSession, SessionSummary, sessionScore, type SessionEntry, type SessionResult } from "./practice-session";

export const CHAPTER = 5;
const PLACEMENT_KEY = "ieltswithharry-grammar-placement";
const PLACEMENT_PER_LEVEL = 4;
/** Three of four right in a level moves placement up a level. */
const PLACEMENT_PASS = 0.75;
const TEST_PER_LESSON = 3;
export const TEST_PASS = 0.8;

export type Placement = { level: GrammarLevel; at: string; scores: Partial<Record<GrammarLevel, { correct: number; graded: number }>> };

const shuffle = <T,>(items: T[]) => items.map((item) => [Math.random(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
export const levelChapters = (level: GrammarLevel) => {
  const lessons = catalog.filter((lesson) => lesson.level === level);
  return Array.from({ length: Math.ceil(lessons.length / CHAPTER) }, (_, index) => lessons.slice(index * CHAPTER, (index + 1) * CHAPTER));
};

async function lessonItems(code: string) {
  const response = await fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được câu hỏi.");
  return (await response.json()).items as GrammarPracticeItem[];
}

/** Placement is a per-device hint, read without an effect so the roadmap can open at the suggested level. */
const subscribe = (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); };
function readPlacement() { try { return window.localStorage.getItem(PLACEMENT_KEY); } catch { return null; } }
export function usePlacement(): Placement | null {
  const raw = useSyncExternalStore(subscribe, readPlacement, () => null);
  try { return raw ? JSON.parse(raw) as Placement : null; } catch { return null; }
}
function savePlacement(placement: Placement) {
  try { window.localStorage.setItem(PLACEMENT_KEY, JSON.stringify(placement)); window.dispatchEvent(new StorageEvent("storage", { key: PLACEMENT_KEY })); } catch { /* storage blocked: the result still shows on screen */ }
}

/** Answers in placement stay in memory: they are not lesson practice and must not fill the review list. */
function useScratchProgress() {
  const [progress, setProgress] = useState<GrammarProgress>({});
  const update: GrammarUpdate = useCallback((code, edit) => setProgress((current) => {
    const value = edit(current[code] ?? { theorySeen: false, responses: {}, updatedAt: "" });
    return { ...current, [code]: { ...value, updatedAt: new Date().toISOString() } };
  }), []);
  return { progress, update };
}

type PlacementView = { type: "intro" } | { type: "loading"; level: GrammarLevel } | { type: "block"; id: number; level: GrammarLevel; entries: SessionEntry[] } | { type: "result"; placement: Placement };

export function PlacementPage() {
  const saved = usePlacement();
  const { progress, update } = useScratchProgress();
  const [view, setView] = useState<PlacementView>({ type: "intro" });
  const [error, setError] = useState("");
  const scores = useRef<Placement["scores"]>({});
  const blocks = useRef(0);

  async function startBlock(level: GrammarLevel) {
    setView({ type: "loading", level });
    setError("");
    try {
      const lessons = shuffle(catalog.filter((lesson) => lesson.level === level)).slice(0, PLACEMENT_PER_LEVEL);
      const items = await Promise.all(lessons.map(async (lesson) => {
        const pool = (await lessonItems(lesson.code)).filter((item) => item.stage === "mastery");
        const pick = shuffle(pool)[0];
        return pick ? [{ code: lesson.code, item: pick }] : [];
      }));
      blocks.current += 1;
      setView({ type: "block", id: blocks.current, level, entries: items.flat() });
      window.scrollTo({ top: 0 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được câu hỏi."); setView({ type: "intro" }); }
  }

  function finishBlock(level: GrammarLevel, result: SessionResult) {
    const score = sessionScore(result);
    scores.current = { ...scores.current, [level]: { correct: score.correct, graded: score.graded } };
    const next = grammarLevels[grammarLevels.indexOf(level) + 1];
    const passed = score.graded > 0 && score.correct / score.graded >= PLACEMENT_PASS;
    if (passed && next) { void startBlock(next); return; }
    const placement: Placement = { level, at: clockNow(), scores: scores.current };
    savePlacement(placement);
    setView({ type: "result", placement });
  }

  const back = <Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link>;
  if (view.type === "loading") return <div className="gg-subpage">{back}<div className="gg-loading">{view.level === "A1" ? "Đang chuẩn bị câu hỏi A1…" : `Bạn đã qua cấp trước. Đang chuẩn bị câu hỏi ${view.level}…`}</div></div>;
  if (view.type === "block") return <div className="gg-lesson gg-focus"><div className="gg-practice"><PracticeSession key={view.id} entries={view.entries} progress={progress} update={update} requeue={false}
    title={`Bài xếp lớp · Cấp ${view.level}`} label={(entry) => `${entry.code.slice(0, 2)} · ${catalog.find((lesson) => lesson.code === entry.code)?.title ?? ""}`}
    onFinish={(result) => finishBlock(view.level, result)} /></div></div>;
  if (view.type === "result") return <div className="gg-subpage">{back}<PlacementResult placement={view.placement} onRetry={() => { scores.current = {}; void startBlock("A1"); }} /></div>;
  return <div className="gg-subpage">{back}<span className="gg-eyebrow">BÀI XẾP LỚP</span><h1>Bắt đầu từ cấp nào?</h1>
    <p>Khoảng 10 phút. Mỗi cấp có {PLACEMENT_PER_LEVEL} câu Vận dụng lấy ngẫu nhiên từ các bài. Đúng ít nhất 3/4 thì lên cấp tiếp theo; dừng ở cấp đầu tiên bạn còn hổng.</p>
    <div className="gg-test-intro"><Sticker name="compass" size={72} tilt={-6} pop={false} /><ul><li>Không tính vào Sổ ôn hay tiến độ bài học.</li><li>Kết quả chỉ để gợi ý điểm bắt đầu, không phải chứng nhận trình độ.</li><li>Có thể làm lại bất cứ lúc nào.</li></ul>
      <button className="gg-primary" onClick={() => void startBlock("A1")}>Bắt đầu bài xếp lớp <ArrowRight size={16} /></button></div>
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    {saved && <p className="gg-test-saved">Lần trước ({new Date(saved.at).toLocaleDateString("vi-VN")}) gợi ý bắt đầu ở <Link href={`${ROOT}/level/${saved.level}`}>{saved.level} · {grammarWorlds[saved.level].name}</Link>.</p>}
  </div>;
}

function PlacementResult({ placement, onRetry }: { placement: Placement; onRetry: () => void }) {
  const world = grammarWorlds[placement.level];
  return <section className="gg-summary-card">
    <Sticker name={world.sticker as StickerName} size={72} tilt={-6} pop={false} />
    <span className="gg-eyebrow">KẾT QUẢ XẾP LỚP</span>
    <h2>Gợi ý bắt đầu ở {placement.level} · {world.name}</h2>
    <p className="gg-summary-score">{world.description}</p>
    <div className="gg-placement-levels">{grammarLevels.map((level) => { const score = placement.scores[level]; return <div key={level} className={level === placement.level ? "is-target" : score ? "" : "is-skipped"}><strong>{level}</strong><span>{score ? `${score.correct}/${score.graded}` : "—"}</span></div>; })}</div>
    <div className="gg-summary-note">Cấp gợi ý là cấp đầu tiên bạn đúng dưới 3/4 câu. Các bài ở cấp thấp hơn vẫn mở để ôn khi cần.</div>
    <div className="gg-summary-actions"><Link className="gg-primary" href={`${ROOT}/level/${placement.level}`}>Vào lộ trình {placement.level} <ArrowRight size={16} /></Link><button className="gg-secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Làm lại</button></div>
  </section>;
}

type TestView = { type: "list" } | { type: "loading" } | { type: "session"; id: number; chapter: number; entries: SessionEntry[] } | { type: "summary"; chapter: number; result: SessionResult; passed: boolean };

export function ChapterTestsPage({ progress, update, initialLevel }: { progress: GrammarProgress; update: GrammarUpdate; initialLevel: GrammarLevel }) {
  const [level, setLevel] = useState(initialLevel);
  const [view, setView] = useState<TestView>({ type: "list" });
  const [error, setError] = useState("");
  const sessions = useRef(0);
  const chapters = levelChapters(level);

  async function start(chapter: number) {
    setView({ type: "loading" });
    setError("");
    try {
      const lessons = chapters[chapter - 1];
      const picks = await Promise.all(lessons.map(async (lesson) => shuffle((await lessonItems(lesson.code)).filter((item) => item.stage === "mastery")).slice(0, TEST_PER_LESSON).map((item) => ({ code: lesson.code, item }))));
      sessions.current += 1;
      setView({ type: "session", id: sessions.current, chapter, entries: shuffle(picks.flat()) });
      window.scrollTo({ top: 0 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được bài kiểm tra."); setView({ type: "list" }); }
  }

  function finish(chapter: number, result: SessionResult) {
    const score = sessionScore(result);
    const share = score.graded ? score.correct / score.graded : 0;
    const passed = score.graded > 0 && share >= TEST_PASS;
    const first = chapters[chapter - 1][0].code;
    if (score.graded) update(first, (value) => {
      const best = Math.max(share, value.chapterTest?.best ?? 0);
      return { ...value, chapterTest: { best, passed: passed || Boolean(value.chapterTest?.passed), at: clockNow() } };
    });
    setView({ type: "summary", chapter, result, passed });
  }

  const back = <Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link>;
  if (view.type === "loading") return <div className="gg-subpage">{back}<div className="gg-loading">Đang chuẩn bị bài kiểm tra…</div></div>;
  if (view.type === "session") return <div className="gg-lesson gg-focus"><div className="gg-practice"><PracticeSession key={view.id} entries={view.entries} progress={progress} update={update} requeue={false}
    title={`Kiểm tra chặng ${view.chapter} · ${level}`} label={(entry) => `${entry.code} · ${catalog.find((lesson) => lesson.code === entry.code)?.title ?? ""}`}
    onFinish={(result) => finish(view.chapter, result)} /></div></div>;
  if (view.type === "summary") return <div className="gg-subpage">{back}<SessionSummary result={view.result} progress={progress} title={view.passed ? `Đạt chặng ${view.chapter}` : `Chưa đạt chặng ${view.chapter}`}
    note={view.passed ? "Đạt từ 80% câu đúng. Câu sai đã vào Sổ ôn." : "Cần 80% câu đúng để đạt chặng. Ôn các câu sai rồi làm lại; câu sai đã vào Sổ ôn."}>
    {chapters[view.chapter] && view.passed && <button className="gg-primary" onClick={() => void start(view.chapter + 1)}>Kiểm tra chặng {view.chapter + 1} <ArrowRight size={16} /></button>}
    {!view.passed && <Link className="gg-primary" href={`${ROOT}/review`}>Ôn câu sai <ArrowRight size={16} /></Link>}
    <button className="gg-secondary" onClick={() => setView({ type: "list" })}>Về danh sách kiểm tra</button>
  </SessionSummary></div>;

  return <div className="gg-subpage">{back}<span className="gg-eyebrow">KIỂM TRA</span><h1>Kiểm tra cuối chặng</h1>
    <p>Mỗi chặng gồm 5 bài. Bài kiểm tra có {CHAPTER * TEST_PER_LESSON} câu Vận dụng trộn từ cả 5 bài, mỗi câu chấm một lần. Đạt khi đúng từ 80%.</p>
    <Link className="gg-placement-cta" href={`${ROOT}/placement`}><Compass size={20} aria-hidden="true" /><span><strong>Chưa biết bắt đầu từ đâu?</strong><small>Làm bài xếp lớp khoảng 10 phút để được gợi ý cấp độ.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
    <nav className="gg-levels" aria-label="Chọn cấp độ">{grammarLevels.map((item) => <button type="button" className={item === level ? "selected" : ""} aria-pressed={item === level} key={item} onClick={() => setLevel(item)}><Sticker name={grammarWorlds[item].sticker as StickerName} size={30} pop={false} /><span><strong>{item}</strong><small>{levelChapters(item).length} chặng</small></span></button>)}</nav>
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    <div className="gg-tests">{chapters.map((chunk, index) => {
      const learned = chunk.filter((lesson) => lessonDone(lesson, progress[lesson.code])).length;
      const result: GrammarLessonProgress["chapterTest"] = progress[chunk[0].code]?.chapterTest;
      return <article key={index} className={result?.passed ? "is-passed" : ""}>
        <div><span className="gg-chapter-name">Chặng {index + 1}</span><strong>{chunk[0].title} → {chunk[chunk.length - 1].title}</strong><small>{learned}/{chunk.length} bài đã học xong{learned < chunk.length ? " · nên học xong trước khi kiểm tra" : ""}</small></div>
        {result && <span className={`gg-test-badge ${result.passed ? "is-passed" : ""}`}>{result.passed ? "Đã đạt" : "Cao nhất"} · {Math.round(result.best * 100)}%</span>}
        <button className={learned === chunk.length ? "gg-primary" : "gg-secondary"} onClick={() => void start(index + 1)}><ClipboardCheck size={15} aria-hidden="true" /> {result ? "Làm lại" : "Làm bài"} · {chunk.length * TEST_PER_LESSON} câu</button>
      </article>;
    })}</div>
  </div>;
}
