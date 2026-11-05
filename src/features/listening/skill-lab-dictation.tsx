"use client";
/*
 * IELTS Skill Lab dictation bank (M16.2): 300 staged lessons from Foundation drills to Section 4.
 * Lessons arrive without transcript or answers; every check is graded by /api/dictation/skill-lab.
 * Each turn has its own Gemini TTS clip, so replay covers exactly one turn with a real length.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Gauge, Headphones, Info, ListChecks, Pause, Play, RotateCcw, Search, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { wordDifferences } from "@/lib/listening/youtube";
import { loadPracticeResults, savePracticeResult, type PracticeResult } from "@/features/learning/practice-results";
import type { CatalogEntry, GradedQuestion, LessonVocabulary, PublicLesson, PublicQuestion } from "@/lib/dictation-skill-lab/lessons";
import { skillLabStages, skillLabStageOf, skillLabStageUrl } from "@/lib/dictation-skill-lab/stages";
import "./voa-dictation.css";
import "./skill-lab-dictation.css";

type Mode = "dictation" | "practice" | "ielts";
type Review = { transcript: { turn_id: string; speaker_id: string; text_en: string; translation_vi: string }[]; vocabulary: LessonVocabulary[] };
type DictationResult = { turn_id: string; accuracy: number; correct: boolean; reference_text: string; translation_vi: string; skipped?: boolean };
type Draft = { mode: Mode; answers: Record<string, string>; results: Record<string, GradedQuestion>; submitted: boolean; played: boolean; selectedTurn?: number; review?: Review | null;
  dictationAnswers?: Record<string, string>; dictationResults?: Record<string, DictationResult>; dictationTurn?: number; practiceTurn?: number };

const BASE = "/app/dictation/banks/skill-lab";
const SLUG = (id: string) => `skill-lab:${id}`;
const draftKey = (id: string) => `skill-lab-dictation:v1:${id}`;
const formats: Record<string, string> = { micro_drill: "Micro drill", sentence_drill: "Sentence drill", mini_conversation: "Hội thoại ngắn", section_bridge: "Section bridge", section_practice: "Section practice" };
const accents: Record<string, string> = { british: "Anh", australian: "Úc", american: "Mỹ", new_zealand: "New Zealand" };
const typeLabels: Record<string, string> = {
  dictation: "Chép chính tả", gap_fill: "Điền từ còn thiếu", word_choice: "Chọn từ nghe được", mcq: "Trắc nghiệm", matching: "Nối thông tin",
  map_labelling: "Gắn nhãn sơ đồ", form_completion: "Form completion", note_completion: "Note completion", table_completion: "Table completion",
  sentence_completion: "Sentence completion", summary_completion: "Summary completion", short_answer: "Short answer",
};
const reasons: Record<string, string> = { empty_answer: "Bạn chưa nhập câu trả lời.", word_limit_exceeded: "Vượt giới hạn số từ của đề.", not_in_accepted_answers: "Chưa khớp đáp án." };
const speeds = [0.75, 0.9, 1, 1.15];
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
function maskedAnswer(reference: string, typed: string) {
  const heard = new Set(normalize(typed).split(" "));
  let first = true;
  return reference.replace(/[\p{L}\p{N}]+/gu, (word) => {
    if (first) { first = false; return word; }
    return heard.has(normalize(word)) ? word : "•".repeat(Math.min(word.length, 12));
  });
}

function readDraft(id: string): Draft | null {
  try { return JSON.parse(window.localStorage.getItem(draftKey(id)) ?? "null") as Draft | null; } catch { return null; }
}
function writeDraft(id: string, draft: Draft) {
  try { window.localStorage.setItem(draftKey(id), JSON.stringify(draft)); } catch { /* Practice still works without storage. */ }
}

async function loadResults(ids: string[]): Promise<Record<string, PracticeResult>> {
  if (demoMode) {
    const found = await loadPracticeResults(ids.map(SLUG));
    return Object.fromEntries(Object.entries(found).map(([slug, result]) => [slug.slice(10), result]));
  }
  const { data } = await createClient().from("package_practice_results").select("lesson_slug,correct,checked,total").like("lesson_slug", "skill-lab:%");
  return Object.fromEntries((data ?? []).map((row) => [row.lesson_slug.slice(10), { correct: row.correct, checked: row.checked, total: row.total }]));
}

export function SkillLabDictation() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const lessonId = parts[4] && parts[4] !== "stage" ? parts[4] : undefined;
  const catalogStage = parts[4] === "stage" ? parts[5] : "all";
  return lessonId ? <SkillLabLesson key={lessonId} lessonId={decodeURIComponent(lessonId)} /> : <SkillLabCatalog stageId={catalogStage} />;
}

function SkillLabCatalog({ stageId }: { stageId: string }) {
  const router = useRouter();
  const [lessons, setLessons] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Record<string, PracticeResult>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [last, setLast] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/dictation/skill-lab").then(async (response) => {
      const data = await response.json().catch(() => ({})) as { lessons?: CatalogEntry[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.lessons) { setError(data.error ?? "Không tải được kho bài."); setLessons([]); return; }
      setLessons(data.lessons);
      try { setLast(window.localStorage.getItem("skill-lab-last-lesson") ?? ""); } catch { /* optional */ }
      loadResults(data.lessons.map((lesson) => lesson.lesson_id)).then((found) => { if (alive) setResults(found); }).catch(() => undefined);
    });
    return () => { alive = false; };
  }, []);

  const progress = (id: string) => {
    const result = results[id];
    if (!result || !result.checked) return "new";
    return result.checked >= result.total ? "done" : "started";
  };
  const stage = skillLabStages.find((item) => item.id === stageId);
  const visible = (lessons ?? []).filter((lesson) => lesson.audio_ready && (!stage || skillLabStageOf(lesson.lesson_id) === stage.id)
    && (status === "all" || progress(lesson.lesson_id) === status)
    && `${lesson.lesson_id} ${lesson.title} ${lesson.topic}`.toLowerCase().includes(query.trim().toLowerCase()));
  const ready = (lessons ?? []).filter((lesson) => lesson.audio_ready && (!stage || skillLabStageOf(lesson.lesson_id) === stage.id));
  const next = ready.find((lesson) => lesson.lesson_id === last) ?? ready.find((lesson) => progress(lesson.lesson_id) !== "done");

  return (
    <div className="voa-lab sld-lab">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>{stage ? `${stage.label} IELTS` : "IELTS Skill Lab"}</span></nav>
      <header className="voa-bank-hero">
        <div><span className="voa-eyebrow">IELTS SKILL LAB</span><h1>{stage ? `${stage.label} IELTS` : "Lộ trình nghe chép IELTS"}</h1>
          <p>{stage ? `${stage.detail}. Chọn bài có audio và luyện từng lượt nghe.` : "Chọn một chặng IELTS từ màn Dictation để luyện nghe từng lượt."}</p></div>
        {next && <button type="button" className="voa-primary-button" onClick={() => router.push(`${BASE}/${next.lesson_id}`)}>{next.lesson_id === last ? "Tiếp tục bài đang học" : "Bắt đầu bài tiếp theo"} <ArrowRight size={17} /></button>}
      </header>
      <p className="sld-draft-note"><Info size={15} /> Bản nháp M16.2: audio do Gemini TTS tạo và chưa được giáo viên nghe duyệt. Điểm ở đây là điểm luyện tập, không quy đổi ra Band IELTS.</p>
      {error ? <section className="voa-surface sld-empty"><h2>Chưa mở được kho</h2><p>{error}</p></section> : (
        <section className="voa-library sld-catalog-library">
            <div className="sld-filter-bar">
              <label className="sld-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã, tên bài, chủ đề" aria-label="Tìm bài" /></label>
              <label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tất cả</option><option value="new">Chưa học</option><option value="started">Đang học</option><option value="done">Đã nộp đủ</option></select></label>
            </div>
            {lessons === null ? <p className="sld-muted">Đang tải kho bài…</p> : !visible.length ? <p className="sld-muted">Không có bài phù hợp bộ lọc.</p> : (
              <div className="sld-grid">
                {visible.map((lesson) => {
                  const result = results[lesson.lesson_id];
                  const state = progress(lesson.lesson_id);
                  return (
                    <button type="button" key={lesson.lesson_id} className={`sld-card voa-surface sld-${state}`} disabled={!lesson.audio_ready} onClick={() => router.push(`${BASE}/${lesson.lesson_id}`)}>
                      <span className="sld-card-top"><span className="sld-code">{lesson.lesson_id}</span><span className="sld-pill">{lesson.level}</span></span>
                      <strong>{lesson.title}</strong>
                      <span className="sld-card-meta">{lesson.topic} · {formats[lesson.content_format] ?? lesson.content_format}</span>
                      <span className="sld-card-foot">
                        <span>{lesson.questions} câu · {lesson.turns} lượt{lesson.duration_ms ? ` · ${clock(lesson.duration_ms)}` : ""}</span>
                        <span>{!lesson.audio_ready ? "Đang tạo audio" : result?.checked ? `${result.correct}/${result.total} đúng` : "Chưa học"}</span>
                      </span>
                      {result?.checked ? <span className="sld-meter" aria-hidden><span style={{ width: `${Math.round((result.checked / Math.max(result.total, 1)) * 100)}%` }} /></span> : null}
                    </button>
                  );
                })}
              </div>
            )}
        </section>
      )}
    </div>
  );
}

function SkillLabLesson({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement>(null);
  const continuous = useRef(false);
  const current = useRef<number | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lesson, setLesson] = useState<PublicLesson | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("dictation");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, GradedQuestion>>({});
  const [dictationAnswers, setDictationAnswers] = useState<Record<string, string>>({});
  const [dictationResults, setDictationResults] = useState<Record<string, DictationResult>>({});
  const [showDictationAnswer, setShowDictationAnswer] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [played, setPlayed] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [dictationTurn, setDictationTurn] = useState(0);
  const [practiceTurn, setPracticeTurn] = useState(0);
  const [restored, setRestored] = useState(false);
  const turnPanelRef = useRef<HTMLElement>(null);
  const dictationFeedbackRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const nextTurnButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/dictation/skill-lab/${encodeURIComponent(lessonId)}`).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { lesson?: PublicLesson; error?: string };
      if (!alive) return;
      if (!response.ok || !data.lesson) { setError(data.error ?? "Không tải được bài."); return; }
      const loadedLesson = data.lesson;
      setLesson(loadedLesson);
      const draft = readDraft(lessonId);
      if (draft) {
        const clampTurn = (value: number) => Math.max(0, Math.min(loadedLesson.turns.length - 1, value));
        setMode("dictation"); setAnswers(draft.answers ?? {}); setResults(draft.results ?? {});
        setDictationAnswers(draft.dictationAnswers ?? {}); setDictationResults(draft.dictationResults ?? {});
        setSubmitted(Boolean(draft.submitted)); setPlayed(Boolean(draft.played)); setReview(draft.review ?? null);
        const savedDictationTurn = clampTurn(draft.dictationTurn ?? (draft.mode === "dictation" ? draft.selectedTurn ?? 0 : 0));
        setSelectedTurn(savedDictationTurn);
        setDictationTurn(savedDictationTurn);
        setPracticeTurn(clampTurn(draft.practiceTurn ?? (draft.mode === "practice" ? draft.selectedTurn ?? 0 : 0)));
      }
      setRestored(true);
      try { window.localStorage.setItem("skill-lab-last-lesson", lessonId); } catch { /* optional */ }
    });
    return () => { alive = false; };
  }, [lessonId]);

  useEffect(() => { if (restored) writeDraft(lessonId, { mode, answers, results, dictationAnswers, dictationResults, submitted, played, selectedTurn, dictationTurn, practiceTurn, review }); }, [restored, lessonId, mode, answers, results, dictationAnswers, dictationResults, submitted, played, selectedTurn, dictationTurn, practiceTurn, review]);
  useEffect(() => () => { if (gapTimer.current) clearTimeout(gapTimer.current); audio.current?.pause(); }, []);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

  const turnIndex = useMemo(() => new Map((lesson?.turns ?? []).map((turn, index) => [turn.turn_id, index])), [lesson]);
  const speakers = useMemo(() => Object.fromEntries((lesson?.speakers ?? []).map((speaker) => [speaker.speaker_id, speaker])), [lesson]);
  const examLocked = mode === "ielts" && !submitted;
  const activeTurn = lesson?.turns[selectedTurn];
  const activeDictationResult = activeTurn ? dictationResults[activeTurn.turn_id] : undefined;
  const activeQuestions = mode === "practice" && activeTurn
    ? lesson.questions.filter((question) => question.evidence_turn_ids.at(-1) === activeTurn.turn_id)
    : mode === "ielts" ? lesson?.questions ?? [] : [];

  const stop = useCallback(() => {
    continuous.current = false;
    current.current = null;
    if (gapTimer.current) clearTimeout(gapTimer.current);
    audio.current?.pause();
    setPlaying(null); setPlayingAll(false);
  }, []);

  function chooseTurn(index: number) {
    if (!lesson || busy || index < 0 || index >= lesson.turns.length) return;
    stop();
    setSelectedTurn(index);
    if (mode === "dictation") setDictationTurn(index);
    if (mode === "practice") setPracticeTurn(index);
    setShowDictationAnswer(false);
    turnPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => playButtonRef.current?.focus({ preventScroll: true }), 0);
  }

  function play(index: number, all = false) {
    const player = audio.current;
    const turn = lesson?.turns[index];
    if (!player || !turn?.audio_url) return;
    if (gapTimer.current) clearTimeout(gapTimer.current);
    continuous.current = all;
    setPlayingAll(all);
    current.current = index;
    player.src = turn.audio_url;
    player.playbackRate = speed;
    setPlaying(index);
    void player.play().catch(() => { setPlaying(null); setError("Trình duyệt chưa phát được audio. Hãy bấm phát lại."); });
  }
  /** Reads the playing turn from a ref: a state value could be stale between the pause and ended events. */
  function ended() {
    const index = current.current;
    if (index === null || !lesson) return;
    if (continuous.current && index + 1 < lesson.turns.length) {
      gapTimer.current = setTimeout(() => play(index + 1, true), 450);
      return;
    }
    if (continuous.current && mode === "ielts") setPlayed(true);
    continuous.current = false;
    current.current = null;
    setPlaying(null); setPlayingAll(false);
    if (mode === "practice" || mode === "dictation") {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(mode === "dictation" ? ".sld-dictation-answer" : ".sld-questions [data-sld-answer]:not(:disabled)")?.focus({ preventScroll: true });
      }, 0);
    }
  }

  async function checkDictation(skip = false) {
    if (!lesson || !activeTurn || busy) return;
    const turnId = activeTurn.turn_id;
    const answer = skip ? "" : dictationAnswers[turnId] ?? "";
    if (!skip && !answer.trim()) return;
    setBusy(`dictation:${turnId}`); setError("");
    try {
      const response = await fetch(`/api/dictation/skill-lab/${lesson.lesson_id}/dictation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turn_id: turnId, answer }),
      });
      const data = await response.json().catch(() => ({})) as DictationResult & { error?: string };
      if (!response.ok || !data.reference_text) throw new Error(data.error ?? "Không kiểm tra được câu chép.");
      setDictationResults((current) => ({ ...current, [turnId]: { ...data, skipped: skip } }));
      setShowDictationAnswer(skip || data.correct);
      window.setTimeout(() => {
        dictationFeedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        dictationFeedbackRef.current?.focus({ preventScroll: true });
      }, 0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không kiểm tra được câu chép."); }
    finally { setBusy(""); }
  }

  async function grade(questionIds?: string[]) {
    if (!lesson) return;
    setBusy(questionIds ? questionIds.join(",") : "all"); setError("");
    try {
      const response = await fetch(`/api/dictation/skill-lab/${lesson.lesson_id}/grade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, answers, ...(questionIds ? { question_ids: questionIds } : {}) }),
      });
      const data = await response.json().catch(() => ({})) as { results?: GradedQuestion[]; error?: string } & Partial<Review>;
      if (!response.ok || !data.results) throw new Error(data.error ?? "Không chấm được bài.");
      const next = { ...results, ...Object.fromEntries(data.results.map((item) => [item.question_id, item])) };
      setResults(next);
      if (!questionIds) { setSubmitted(true); setReview({ transcript: data.transcript ?? [], vocabulary: data.vocabulary ?? [] }); stop(); }
      else if (mode === "practice") {
        const remaining = activeQuestions.find((question) => !next[question.question_id]);
        window.setTimeout(() => {
          if (remaining) document.querySelector<HTMLElement>(`[data-sld-question="${remaining.question_id}"] [data-sld-answer]:not(:disabled)`)?.focus();
          else (selectedTurn < lesson.turns.length - 1 ? nextTurnButtonRef : submitButtonRef).current?.focus();
        }, 0);
      }
      const checked = Object.keys(next).length;
      const correct = Object.values(next).filter((item) => item.correct).length;
      void savePracticeResult(SLUG(lesson.lesson_id), { correct, checked, total: lesson.questions.length }).catch(() => undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài."); }
    finally { setBusy(""); }
  }

  function restart(nextMode: Mode) {
    stop();
    setMode(nextMode); setAnswers({}); setResults({}); setSubmitted(false); setPlayed(false); setSelectedTurn(nextMode === "dictation" ? dictationTurn : 0); setPracticeTurn(0); setReview(null);
    if (nextMode === "ielts") setSpeed(1);
    setShowDictationAnswer(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeMode(nextMode: Mode) {
    if (nextMode === mode) return;
    if (nextMode === "ielts" || mode === "ielts") { restart(nextMode); return; }
    stop(); setMode(nextMode); setSelectedTurn(nextMode === "dictation" ? dictationTurn : practiceTurn); setShowDictationAnswer(false);
  }

  if (error && !lesson) return <div className="voa-lab sld-lab"><nav className="voa-breadcrumb"><Link href={BASE}><ArrowLeft size={14} /> IELTS Skill Lab</Link></nav><section className="voa-surface sld-empty"><h2>Chưa mở được bài</h2><p>{error}</p></section></div>;
  if (!lesson) return <div className="voa-lab sld-lab"><p className="sld-muted">Đang tải bài…</p></div>;

  const correctCount = Object.values(results).filter((item) => item.correct).length;
  const checkedCount = Object.keys(results).length;
  const maps = [...new Set(activeQuestions.map((question) => question.map_url).filter(Boolean))] as string[];
  const totalMs = lesson.turns.reduce((sum, turn) => sum + (turn.duration_ms ?? 0), 0);
  const revealDictation = showDictationAnswer || Boolean(activeDictationResult?.skipped || activeDictationResult?.correct);

  return (
    <div className={`voa-lab sld-lab${mode === "dictation" ? " sld-dictation-view" : ""}`}>
      <header className="voa-lesson-header">
        <div>
          <button type="button" className="voa-lesson-back" onClick={() => { stop(); router.push(skillLabStageUrl(skillLabStageOf(lesson.lesson_id))); }}><ArrowLeft size={15} /> {skillLabStages.find((stage) => stage.id === skillLabStageOf(lesson.lesson_id))?.label} IELTS</button>
          <h1>{lesson.title}</h1>
          <p>{[lesson.lesson_id, lesson.level, lesson.section ? `Section ${lesson.section}` : "Foundation", lesson.topic, formats[lesson.content_format] ?? lesson.content_format]
            .filter((part, index, parts) => parts.indexOf(part) === index).join(" · ")}</p>
        </div>
        <div className="sld-mode" role="group" aria-label="Chọn chức năng học">
          <button type="button" aria-pressed={mode === "dictation"} className={mode === "dictation" ? "active" : ""} onClick={() => changeMode("dictation")}><Headphones size={15} /> Nghe & chép</button>
          <button type="button" aria-pressed={mode === "practice"} className={mode === "practice" ? "active" : ""} onClick={() => changeMode("practice")}><ListChecks size={15} /> Luyện tập</button>
          <button type="button" aria-pressed={mode === "ielts"} className={mode === "ielts" ? "active" : ""} onClick={() => changeMode("ielts")}><Play size={15} /> Làm bài một lần</button>
        </div>
      </header>

      <div className="voa-info-banner"><Info size={15} /><span>{mode === "dictation"
        ? "Nghe từng lượt, chép câu và kiểm tra ngay."
        : mode === "practice" ? "Luyện tập: trả lời các dạng câu hỏi theo từng lượt nghe, kiểm tra ngay và nghe lại tùy ý."
          : "Làm bài một lần: audio phát liền một lượt, không nghe lại và không xem đáp án trước khi nộp. Chấm theo đúng đáp án và giới hạn số từ."}</span></div>
      {mode !== "dictation" && lesson.learning_objectives_vi.length > 0 && <ul className="sld-goals">{lesson.learning_objectives_vi.map((goal) => <li key={goal}><Check size={14} /> {goal}</li>)}</ul>}

      <section ref={turnPanelRef} className="sld-player voa-surface" aria-label={mode === "ielts" ? "Bài nghe" : "Lượt nghe hiện tại"}>
        <audio ref={audio} preload="none" onEnded={ended} />
        <div className="sld-player-row">
          {examLocked ? (
            <button type="button" className="voa-primary-button" disabled={played || playing !== null} onClick={() => play(0, true)}>
              <Play size={16} /> {played ? "Đã phát hết (1 lần)" : playing !== null ? `Đang phát lượt ${playing + 1}/${lesson.turns.length}` : "Phát bài nghe"}
            </button>
          ) : playing !== null && (playingAll || mode !== "ielts") ? (
            <button type="button" className="voa-primary-button" onClick={stop}><Pause size={16} /> Dừng</button>
          ) : (
            <button ref={playButtonRef} type="button" className="voa-primary-button" onClick={() => mode === "ielts" ? play(0, true) : play(selectedTurn)}><Play size={16} /> {mode === "ielts" ? "Phát cả bài" : `Nghe lượt ${activeTurn?.turn_id ?? ""}`}</button>
          )}
          <span className="sld-muted">{mode !== "ielts" ? `Lượt ${selectedTurn + 1}/${lesson.turns.length} · ${clock(activeTurn?.duration_ms ?? 0)}` : `${lesson.turns.length} lượt · ${clock(totalMs)}`} · giọng {[...new Set(lesson.speakers.map((speaker) => accents[speaker.accent] ?? speaker.accent))].join(", ")}</span>
          <label className="sld-speed"><Gauge size={15} /> Tốc độ
            <select value={speed} disabled={examLocked} onChange={(event) => setSpeed(Number(event.target.value))}>{speeds.map((value) => <option key={value} value={value}>{value}×</option>)}</select>
          </label>
        </div>
      </section>

      {/* Static SVG plans from the lesson package; next/image adds nothing for vector files. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {mode !== "dictation" && maps.map((url) => <figure key={url} className="sld-map voa-surface"><img src={url} alt="Sơ đồ cho câu hỏi gắn nhãn" /><figcaption>Sơ đồ dùng cho các câu Map labelling</figcaption></figure>)}
      {error && <p className="sld-error" role="alert">{error}</p>}

      {mode === "practice" && activeTurn && <div className="sld-turn-heading"><div><span className="voa-eyebrow">LUYỆN TẬP · LƯỢT {selectedTurn + 1}/{lesson.turns.length}</span><h2>{activeTurn.turn_id}{lesson.speakers.length > 1 ? ` · ${speakers[activeTurn.speaker_id]?.label ?? activeTurn.speaker_id}` : ""}</h2><p>{activeQuestions.length ? `${activeQuestions.length} câu hỏi cho lượt này. Nghe và kiểm tra trước khi sang lượt tiếp.` : "Lượt này không có câu hỏi riêng. Nghe xong hãy chuyển sang lượt tiếp."}</p></div></div>}
      {mode === "dictation" && activeTurn && <section className="sld-dictation voa-surface" aria-label={`Chép lượt ${activeTurn.turn_id}`}>
        <div className="sld-dictation-heading"><label htmlFor="sld-dictation-answer">Nghe & chép · {activeTurn.turn_id}</label><span>Lượt {selectedTurn + 1}/{lesson.turns.length}</span></div>
        <textarea id="sld-dictation-answer" className="sld-dictation-answer" rows={2} value={dictationAnswers[activeTurn.turn_id] ?? ""} spellCheck={false} autoComplete="off" placeholder="Gõ câu bạn nghe được…"
          onChange={(event) => { const value = event.target.value; setDictationAnswers((current) => ({ ...current, [activeTurn.turn_id]: value })); setDictationResults((current) => { const next = { ...current }; delete next[activeTurn.turn_id]; return next; }); setShowDictationAnswer(false); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); play(selectedTurn); }
            else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (activeDictationResult && (activeDictationResult.accuracy >= 0.8 || activeDictationResult.skipped) && selectedTurn < lesson.turns.length - 1) chooseTurn(selectedTurn + 1); else void checkDictation(); }
          }} />
        {activeDictationResult && <div ref={dictationFeedbackRef} tabIndex={-1} className={`sld-dictation-feedback ${activeDictationResult.accuracy >= 0.8 ? "correct" : "wrong"}`} role="status" onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if ((activeDictationResult.accuracy >= 0.8 || activeDictationResult.skipped) && selectedTurn < lesson.turns.length - 1) chooseTurn(selectedTurn + 1);
          else document.getElementById("sld-dictation-answer")?.focus();
        }}><strong>{activeDictationResult.skipped ? "Đã bỏ qua lượt này" : activeDictationResult.correct ? "Chính xác!" : activeDictationResult.accuracy >= 0.8 ? `Đã đạt · đúng ${Math.round(activeDictationResult.accuracy * 100)}% từ` : `Đúng ${Math.round(activeDictationResult.accuracy * 100)}% từ · nghe và thử lại`}</strong>
          <p>{revealDictation ? activeDictationResult.reference_text : maskedAnswer(activeDictationResult.reference_text, dictationAnswers[activeTurn.turn_id] ?? "")}</p>
          {!revealDictation && <button type="button" onClick={() => setShowDictationAnswer(true)}>Hiện toàn bộ đáp án</button>}
          {revealDictation && <small>{activeDictationResult.translation_vi}</small>}
        </div>}
        <div className="sld-dictation-actions"><div><button type="button" className="voa-primary-button" disabled={Boolean(busy) || !(dictationAnswers[activeTurn.turn_id] ?? "").trim()} onClick={() => void checkDictation()}><Check size={15} /> {busy === `dictation:${activeTurn.turn_id}` ? "Đang kiểm tra…" : "Kiểm tra"}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void checkDictation(true)}>Bỏ qua · Xem đáp án</button>
          {activeDictationResult && (activeDictationResult.accuracy >= 0.8 || activeDictationResult.skipped) && selectedTurn < lesson.turns.length - 1 && <button type="button" onClick={() => chooseTurn(selectedTurn + 1)}>Lượt tiếp <ArrowRight size={15} /></button>}
        </div><span className="sld-muted">Enter kiểm tra / sang lượt tiếp · Ctrl + Enter nghe lại</span></div>
      </section>}
      {mode === "dictation" && <section className="sld-dictation-progress voa-surface" aria-label="Tiến độ nghe chép">
        <div className="sld-dictation-progress-head"><strong>Danh sách lượt</strong><span>{Object.values(dictationResults).filter((item) => !item.skipped && item.accuracy >= 0.8).length}/{lesson.turns.length} đã đạt</span></div>
        <div className="sld-dictation-meter" aria-hidden="true"><span style={{ width: `${100 * Object.values(dictationResults).filter((item) => !item.skipped && item.accuracy >= 0.8).length / lesson.turns.length}%` }} /></div>
        <nav className="sld-dictation-grid" aria-label="Chọn lượt nghe">{lesson.turns.map((turn, index) => {
          const result = dictationResults[turn.turn_id];
          return <button type="button" key={turn.turn_id} aria-current={index === selectedTurn ? "step" : undefined} className={`${index === selectedTurn ? "active " : ""}${result ? result.skipped ? "skipped" : result.accuracy >= 0.8 ? "passed" : "retry" : ""}`} onClick={() => chooseTurn(index)}>{turn.turn_id}{result && !result.skipped && result.accuracy >= 0.8 ? <Check size={13} /> : null}</button>;
        })}</nav>
      </section>}
      {activeQuestions.length > 0 && <ol className="sld-questions">
        {activeQuestions.map((question) => (
          <QuestionCard key={question.question_id} number={lesson.questions.findIndex((item) => item.question_id === question.question_id) + 1} question={question} value={answers[question.question_id] ?? ""} result={results[question.question_id]}
            mode={mode} locked={submitted || (mode === "practice" && Boolean(results[question.question_id]))} busy={busy === question.question_id}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.question_id]: value }))}
            onCheck={() => void grade([question.question_id])}
            onRetry={() => setResults((current) => { const next = { ...current }; delete next[question.question_id]; return next; })}
            onPlayEvidence={!examLocked ? (turnId) => { const at = turnIndex.get(turnId); if (at !== undefined) play(at); } : undefined} />
        ))}
      </ol>}

      {mode !== "ielts" && <nav className="sld-turn-nav voa-surface" aria-label="Chuyển lượt nghe"><button type="button" disabled={selectedTurn === 0} onClick={() => chooseTurn(selectedTurn - 1)}><ArrowLeft size={16} /> Lượt trước</button><span>{selectedTurn + 1} / {lesson.turns.length}</span><button ref={nextTurnButtonRef} type="button" className="voa-primary-button" disabled={selectedTurn === lesson.turns.length - 1} onClick={() => chooseTurn(selectedTurn + 1)}>Lượt tiếp <ArrowRight size={16} /></button></nav>}

      {mode !== "dictation" && (mode === "ielts" || selectedTurn === lesson.turns.length - 1 || submitted) && <section className="sld-submit voa-surface">
        {submitted ? (
          <>
            <div><strong>{correctCount}/{lesson.questions.length} câu đúng</strong><span className="sld-muted">Điểm luyện tập, không quy đổi Band IELTS. {mode === "ielts" ? "Chấm theo chế độ một lần nghe." : ""}</span></div>
            <div className="sld-submit-actions">
              <button type="button" onClick={() => restart(mode)}><RotateCcw size={15} /> Làm lại</button>
              <button type="button" className="voa-primary-button" onClick={() => router.push(skillLabStageUrl(skillLabStageOf(lesson.lesson_id)))}>Chọn bài khác <ArrowRight size={15} /></button>
            </div>
          </>
        ) : (
          <>
            <div><strong>{mode === "practice" ? `Đã kiểm tra ${checkedCount}/${lesson.questions.length} câu` : `Đã trả lời ${Object.values(answers).filter((value) => value.trim()).length}/${lesson.questions.length} câu`}</strong>
              <span className="sld-muted">Nộp bài để xem toàn bộ transcript, bản dịch và từ vựng.</span></div>
            <button ref={submitButtonRef} type="button" className="voa-primary-button" disabled={busy === "all"} onClick={() => void grade()}><Send size={15} /> {busy === "all" ? "Đang chấm…" : "Nộp bài"}</button>
          </>
        )}
      </section>}

      {mode !== "dictation" && review && (
        <section className="sld-review voa-surface">
          <h2>Transcript</h2>
          <ol className="sld-transcript">
            {review.transcript.map((turn, index) => (
              <li key={turn.turn_id}>
                <button type="button" aria-label={`Nghe ${turn.turn_id}`} onClick={() => (playing === index ? stop() : play(index))}>{playing === index ? <Pause size={13} /> : <Play size={13} />}</button>
                <div><span className="sld-speaker">{turn.turn_id} · {speakers[turn.speaker_id]?.label ?? turn.speaker_id}</span><p>{turn.text_en}</p><p className="sld-vi">{turn.translation_vi}</p></div>
              </li>
            ))}
          </ol>
          {review.vocabulary.length > 0 && <>
            <h2>Từ vựng trong bài</h2>
            <dl className="sld-vocab">{review.vocabulary.map((word) => <div key={word.term}><dt>{word.term} <small>{word.pos}</small></dt><dd>{word.meaning_vi}<span>{word.example_en}</span></dd></div>)}</dl>
          </>}
        </section>
      )}
    </div>
  );
}

function QuestionCard({ number, question, value, result, mode, locked, busy, onChange, onCheck, onRetry, onPlayEvidence }: {
  number: number; question: PublicQuestion; value: string; result?: GradedQuestion; mode: Mode; locked: boolean; busy: boolean;
  onChange: (value: string) => void; onCheck: () => void; onRetry: () => void; onPlayEvidence?: (turnId: string) => void;
}) {
  const choices = question.options ?? question.choices;
  const inputId = `sld-${question.question_id}`;
  const diff = result && question.type === "dictation" && !result.correct && value.trim() ? wordDifferences(result.accepted_answers[0] ?? "", value) : [];
  return (
    <li data-sld-question={question.question_id} className={`sld-question voa-surface${result ? (result.correct ? " correct" : " wrong") : ""}`}>
      <div className="sld-question-head">
        <span className="sld-number">{number}</span>
        <span className="sld-type">{typeLabels[question.type] ?? question.type}</span>
        {question.instructions_en && <span className="sld-limit">{question.instructions_en}</span>}
        {onPlayEvidence && mode === "practice" && question.evidence_turn_ids.map((turnId) => <button type="button" key={turnId} className="sld-evidence" onClick={() => onPlayEvidence(turnId)}><Headphones size={13} /> Nghe {turnId}</button>)}
      </div>
      <label htmlFor={choices ? undefined : inputId} className="sld-prompt">{question.prompt}</label>
      {choices ? (
        <div className="sld-options" role="radiogroup" aria-label={question.prompt}>
          {choices.map((option) => (
            <label key={option} className={value === option ? "chosen" : ""}>
              <input data-sld-answer type="radio" name={inputId} value={option} checked={value === option} disabled={locked} onChange={() => onChange(option)} /> {option}
            </label>
          ))}
        </div>
      ) : question.type === "dictation" ? (
        <textarea data-sld-answer id={inputId} rows={2} value={value} disabled={locked} spellCheck={false} autoComplete="off" placeholder="Gõ lại đúng câu bạn nghe được" onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && mode === "practice" && !locked) { event.preventDefault(); onCheck(); } }} />
      ) : (
        <input data-sld-answer id={inputId} value={value} disabled={locked} spellCheck={false} autoComplete="off" placeholder="Câu trả lời" onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && mode === "practice" && !locked) { event.preventDefault(); onCheck(); } }} />
      )}
      {mode === "practice" && !result && <div className="sld-question-actions"><span className="sld-muted">{question.type === "dictation" ? "Enter kiểm tra · Shift + Enter xuống dòng" : "Enter kiểm tra"}</span><button type="button" disabled={busy} onClick={onCheck}><Check size={14} /> {busy ? "Đang chấm…" : value.trim() ? "Kiểm tra" : "Xem đáp án"}</button></div>}
      {result && (
        <div className="sld-feedback">
          <p className="sld-verdict">{result.correct ? <><Check size={15} /> Chính xác</> : <><X size={15} /> {reasons[result.reason] ?? "Chưa đúng."}{result.reason === "word_limit_exceeded" ? ` (đề cho tối đa ${result.allowed_words} từ, bạn viết ${result.found_words})` : ""}</>}
            {typeof result.accuracy === "number" && !result.correct && result.accuracy > 0 ? <span className="sld-muted"> · nghe đúng {Math.round(result.accuracy * 100)}% từ</span> : null}</p>
          {diff.length > 0 && <p className="sld-diff" aria-label="So sánh từng từ">{diff.map((item, index) => <span key={index} className={item.kind}>{item.word}</span>)}</p>}
          {!result.correct && <p><strong>Đáp án:</strong> {result.accepted_answers.join(" / ")}</p>}
          <p>{result.explanation_vi}</p>
          {result.evidence.map((turn) => <blockquote key={turn.turn_id}><span>{turn.turn_id}</span> {turn.text_en}<small>{turn.translation_vi}</small></blockquote>)}
          {mode === "practice" && !result.correct && <button type="button" className="sld-retry" onClick={onRetry}><RotateCcw size={13} /> Thử lại câu này</button>}
        </div>
      )}
    </li>
  );
}
