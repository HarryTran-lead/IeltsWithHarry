"use client";
/*
 * IELTS Skill Lab dictation bank (M16.2): 300 staged lessons from Foundation drills to Section 4.
 * Lessons arrive without transcript or answers; every check is graded by /api/dictation/skill-lab.
 * Each turn has its own Gemini TTS clip, so replay covers exactly one turn with a real length.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Flag, Headphones, Info, ListChecks, Pause, Play, RotateCcw, Search, Send, X } from "lucide-react";
import { wordDifferences } from "@/lib/listening/youtube";
import { listPracticeResults, savePracticeResult, savePracticeSnapshot, type PracticeResult } from "@/features/learning/practice-results";
import { useNotebook } from "@/features/notebook/notebook-store";
import type { CatalogEntry, GradedQuestion, LessonVocabulary, PublicLesson, PublicQuestion } from "@/lib/dictation-skill-lab/lessons";
import { skillLabStages, skillLabStageOf, skillLabStageUrl } from "@/lib/dictation-skill-lab/stages";
import { dictationSkills } from "@/lib/dictation-skill-lab/skills";
import { celebrate } from "@/lib/celebrate";
import { topicIllustration } from "@/lib/topic-illustration";
import { ClipProgress, PlaybackControls, useControlReplay, usePlaybackSettings } from "./dictation-playback";
import "./dictation-playback.css";
import "./voa-dictation.css";
import "./skill-lab-dictation.css";
import "./dictation-sessions.css";

type Mode = "dictation" | "practice" | "ielts" | "summary";
type Review = { transcript: { turn_id: string; speaker_id: string; text_en: string; translation_vi: string }[]; vocabulary: LessonVocabulary[] };
/** A checked sentence. Restored from another device it has only the verdict, not the text. */
export type DictationResult = { turn_id: string; accuracy: number; correct: boolean; passed?: boolean; reference_text?: string; translation_vi?: string; skipped?: boolean;
  focus?: string[]; missed_focus?: string[]; explanation_vi?: string; vocabulary?: LessonVocabulary[]; checked_answer?: string };
type Draft = { version?: 2; mode: Mode; answers: Record<string, string>; results: Record<string, GradedQuestion>; submitted: boolean; played: boolean; selectedTurn?: number; review?: Review | null;
  dictationAnswers?: Record<string, string>; dictationResults?: Record<string, DictationResult>; dictationTurn?: number; practiceTurn?: number };

const BASE = "/app/dictation/banks/skill-lab";
const SLUG = (id: string) => `skill-lab:${id}`;
/** Sentence results live in package_practice_results too, so progress follows the learner across devices. */
export const DICTATION_PREFIX = "skill-lab-dictation:v2:";
export const TURN_PREFIX = "skill-lab-turn:v2:";
export const DICTATION_SLUG = (id: string) => `${DICTATION_PREFIX}${id}`;
export const TURN_SLUG = (lessonId: string, turnId: string) => `${TURN_PREFIX}${lessonId}/${turnId}`;
/** The learner advances only after writing the whole sentence correctly. */
export const turnPassed = (result: DictationResult | undefined) => Boolean(result?.correct && !result.skipped);
const draftKey = (id: string) => `skill-lab-dictation:v1:${id}`;
const formats: Record<string, string> = { micro_drill: "Luyện âm", sentence_drill: "Luyện câu", mini_conversation: "Hội thoại ngắn", section_bridge: "Làm quen Section", section_practice: "Luyện Section" };
const levelLabel = (level: string) => level.replace(/^L(\d)$/, "Cấp $1");
const accents: Record<string, string> = { british: "Anh", australian: "Úc", american: "Mỹ", new_zealand: "New Zealand" };
const typeLabels: Record<string, string> = {
  dictation: "Chép chính tả", gap_fill: "Điền từ còn thiếu", word_choice: "Chọn từ nghe được", mcq: "Trắc nghiệm", matching: "Nối thông tin",
  map_labelling: "Gắn nhãn sơ đồ", form_completion: "Form completion", note_completion: "Note completion", table_completion: "Table completion",
  sentence_completion: "Sentence completion", summary_completion: "Summary completion", short_answer: "Short answer",
};
const reasons: Record<string, string> = { empty_answer: "Bạn chưa nhập câu trả lời.", word_limit_exceeded: "Vượt giới hạn số từ của đề.", not_in_accepted_answers: "Chưa khớp đáp án." };
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;
const sentenceText = (text: string) => text.trim().split(/(?<=[.!?])\s+(?=["'A-Z0-9])/).filter(Boolean);
const sentenceTranslation = (text: string) => text.trim().split(/(?<=[.!?])\s+(?=["'\p{Lu}0-9])/u).filter(Boolean);
const wordCount = (text: string) => (text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length;
function maskedAnswer(reference: string, revealedWords: number) {
  let index = 0;
  return reference.replace(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu, (word) => {
    index += 1;
    return index <= revealedWords ? word : "•".repeat(Math.min(word.length, 12));
  });
}

function readDraft(id: string): Draft | null {
  try { return JSON.parse(window.localStorage.getItem(draftKey(id)) ?? "null") as Draft | null; } catch { return null; }
}
function writeDraft(id: string, draft: Draft) {
  try { window.localStorage.setItem(draftKey(id), JSON.stringify(draft)); } catch { /* Practice still works without storage. */ }
}

export type LessonProgress = { questions?: PracticeResult; dictation?: PracticeResult & { updatedAt?: string } };
export async function loadResults(): Promise<Record<string, LessonProgress>> {
  const [questions, dictation] = await Promise.all([listPracticeResults("skill-lab:"), listPracticeResults(DICTATION_PREFIX)]);
  const found: Record<string, LessonProgress> = {};
  for (const [slug, result] of Object.entries(questions)) (found[slug.slice(10)] ??= {}).questions = result;
  for (const [slug, result] of Object.entries(dictation)) (found[slug.slice(DICTATION_PREFIX.length)] ??= {}).dictation = result;
  return found;
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
  const [results, setResults] = useState<Record<string, LessonProgress>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [skill, setSkill] = useState("all");
  const [last, setLast] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/dictation/skill-lab").then(async (response) => {
      const data = await response.json().catch(() => ({})) as { lessons?: CatalogEntry[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.lessons) { setError(data.error ?? "Không tải được kho bài."); setLessons([]); return; }
      setLessons(data.lessons);
      try { setLast(window.localStorage.getItem("skill-lab-last-lesson") ?? ""); } catch { /* optional */ }
      loadResults().then((found) => { if (alive) setResults(found); }).catch(() => undefined);
    });
    return () => { alive = false; };
  }, []);

  /** A lesson is done when every sentence has passed in "Nghe & chép". */
  const progress = (lesson: CatalogEntry) => {
    const { dictation, questions } = results[lesson.lesson_id] ?? {};
    if (dictation && dictation.correct >= lesson.turns) return "done";
    return (dictation?.checked || questions?.checked) ? "started" : "new";
  };
  const stage = skillLabStages.find((item) => item.id === stageId);
  const inStage = (lessons ?? []).filter((lesson) => lesson.audio_ready && (!stage || skillLabStageOf(lesson.lesson_id) === stage.id));
  const visible = inStage.filter((lesson) => (status === "all" || progress(lesson) === status)
    && (skill === "all" || lesson.skills.includes(skill as CatalogEntry["skills"][number]))
    && `${lesson.title} ${lesson.topic}`.toLowerCase().includes(query.trim().toLowerCase()));
  const next = inStage.find((lesson) => lesson.lesson_id === last && progress(lesson) !== "done") ?? inStage.find((lesson) => progress(lesson) !== "done");
  const doneCount = inStage.filter((lesson) => progress(lesson) === "done").length;
  const stageSkills = dictationSkills.filter((item) => inStage.some((lesson) => lesson.skills.includes(item.id)));

  return (
    <div className="voa-lab sld-lab">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>{stage ? `${stage.label} IELTS` : "IELTS Skill Lab"}</span></nav>
      <header className="voa-bank-hero">
        <div><span className="voa-eyebrow">IELTS SKILL LAB</span><h1>{stage ? `${stage.label} IELTS` : "Lộ trình nghe chép IELTS"}</h1>
          <p>{stage ? `${stage.detail}. Nghe và chép từng câu, rồi luyện các dạng câu hỏi IELTS.` : "Chọn một chặng IELTS từ màn Dictation để luyện nghe từng câu."}</p></div>
        {next && <button type="button" className="voa-primary-button" onClick={() => router.push(`${BASE}/${next.lesson_id}`)}>{next.lesson_id === last ? "Tiếp tục bài đang học" : "Bắt đầu bài tiếp theo"} <ArrowRight size={17} /></button>}
      </header>
      {lessons !== null && inStage.length > 0 && <div className="sld-stage-progress" aria-label="Tiến độ chặng">
        <strong>{doneCount}/{inStage.length} bài đã chép xong</strong>
        <span className="sld-meter-inline" aria-hidden><span style={{ width: `${Math.round(100 * doneCount / inStage.length)}%` }} /></span>
        <span className="sld-muted">Bài xong khi mọi câu trong bài đều đạt.</span>
      </div>}
      {error ? <section className="voa-surface sld-empty"><h2>Chưa mở được kho</h2><p>{error}</p></section> : (
        <section className="voa-library sld-catalog-library">
            <div className="sld-filter-bar">
              <label className="sld-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên bài hoặc chủ đề" aria-label="Tìm bài" /></label>
              <label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tất cả</option><option value="new">Chưa học</option><option value="started">Đang học</option><option value="done">Đã chép xong</option></select></label>
            </div>
            {stageSkills.length > 1 && <div className="sld-skill-chips" role="group" aria-label="Lọc theo kỹ năng">
              <button type="button" aria-pressed={skill === "all"} onClick={() => setSkill("all")}>Mọi kỹ năng</button>
              {stageSkills.map((item) => <button type="button" key={item.id} aria-pressed={skill === item.id} title={item.detail} onClick={() => setSkill(item.id)}>{item.label}</button>)}
            </div>}
            {lessons === null ? <p className="sld-muted">Đang tải kho bài…</p> : !visible.length ? <p className="sld-muted">Không có bài phù hợp bộ lọc.</p> : (
              <div className="sld-grid">
                {visible.map((lesson) => {
                  const { dictation, questions } = results[lesson.lesson_id] ?? {};
                  const state = progress(lesson);
                  const share = dictation ? Math.min(1, dictation.correct / Math.max(lesson.turns, 1)) : 0;
                  return (
                    <button type="button" key={lesson.lesson_id} className={`sld-card voa-surface sld-${state}`} onClick={() => router.push(`${BASE}/${lesson.lesson_id}`)}>
                      <span className="sld-card-art" aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element -- small static topic SVG */}
                        <img src={topicIllustration(`${lesson.topic} ${lesson.title}`).src} alt="" loading="lazy" />
                        <svg className="sld-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" /><circle cx="18" cy="18" r="15.5" style={{ strokeDasharray: `${share * 97.4} 97.4` }} /></svg>
                        <b>{Math.round(share * 100)}%</b>
                      </span>
                      <span className="sld-card-top"><span className="sld-code">{levelLabel(lesson.level)} · {formats[lesson.content_format] ?? lesson.content_format}</span><span className={`sld-pill sld-pill-${state}`}>{state === "done" ? "Đã xong" : state === "started" ? "Đang học" : "Mới"}</span></span>
                      <strong>{lesson.title}</strong>
                      <span className="sld-card-meta">{lesson.topic} · {lesson.turns} câu nghe{lesson.duration_ms ? ` · ${clock(lesson.duration_ms)}` : ""}</span>
                      <span className="sld-card-foot">
                        <span>Chép: {dictation ? `${dictation.correct}/${lesson.turns} đạt` : "chưa làm"}</span>
                        <span>Câu hỏi: {questions?.checked ? `${questions.correct}/${lesson.questions} đúng` : `${lesson.questions} câu`}</span>
                      </span>
                      {dictation?.checked ? <span className="sld-meter" aria-hidden><span style={{ width: `${Math.round((dictation.correct / Math.max(lesson.turns, 1)) * 100)}%` }} /></span> : null}
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
  const segmentEnd = useRef<number | null>(null);
  const boundaryFrame = useRef<number | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lesson, setLesson] = useState<PublicLesson | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("dictation");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, GradedQuestion>>({});
  const [dictationAnswers, setDictationAnswers] = useState<Record<string, string>>({});
  const [dictationResults, setDictationResults] = useState<Record<string, DictationResult>>({});
  const [revealedWords, setRevealedWords] = useState(0);
  const [showDictationAnswer, setShowDictationAnswer] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [played, setPlayed] = useState(false);
  /** One-pass mode: seconds left to read the questions before the recording starts, and when it started. */
  const [previewLeft, setPreviewLeft] = useState<number | null>(null);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const settings = usePlaybackSettings();
  const replaysLeft = useRef(0);
  // One-pass mode always plays at normal speed.
  const speed = mode === "ielts" ? 1 : settings.speed;
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [dictationTurn, setDictationTurn] = useState(0);
  const [practiceTurn, setPracticeTurn] = useState(0);
  const [restored, setRestored] = useState(false);
  const autoPlayedOnOpen = useRef(false);
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
        const savedIndex = draft.dictationTurn ?? (draft.mode === "dictation" ? draft.selectedTurn ?? 0 : 0);
        const sourceIds = [...new Set(loadedLesson.turns.map((turn) => turn.source_turn_id))];
        const legacyDraft = draft.version !== 2;
        const savedDictationTurn = clampTurn(legacyDraft && sourceIds[savedIndex]
          ? loadedLesson.turns.findIndex((turn) => turn.source_turn_id === sourceIds[savedIndex]) : savedIndex);
        setSelectedTurn(savedDictationTurn);
        setDictationTurn(savedDictationTurn);
        const savedPracticeIndex = draft.practiceTurn ?? (draft.mode === "practice" ? draft.selectedTurn ?? 0 : 0);
        setPracticeTurn(clampTurn(legacyDraft && sourceIds[savedPracticeIndex]
          ? loadedLesson.turns.map((turn) => turn.source_turn_id).lastIndexOf(sourceIds[savedPracticeIndex]) : savedPracticeIndex));
      }
      setRestored(true);
      try { window.localStorage.setItem("skill-lab-last-lesson", lessonId); } catch { /* optional */ }
      // Another device may hold this lesson's sentence results: merge their verdicts (the text stays hidden until re-checked).
      listPracticeResults(`${TURN_PREFIX}${lessonId}/`).then((saved) => {
        if (!alive) return;
        setDictationResults((local) => {
          const merged = { ...local };
          for (const [slug, row] of Object.entries(saved)) {
            const turnId = slug.split("/").pop() ?? "";
            // A pass saved elsewhere (another device, Luyện nhanh, Sổ câu sai) replaces an older local miss.
            if (!merged[turnId] || (row.correct && !turnPassed(merged[turnId]))) merged[turnId] = { turn_id: turnId, accuracy: row.correct ? 1 : 0, correct: Boolean(row.correct), passed: Boolean(row.correct) };
          }
          return merged;
        });
      }).catch(() => undefined);
    });
    return () => { alive = false; };
  }, [lessonId]);

  useEffect(() => { if (restored) writeDraft(lessonId, { version: 2, mode, answers, results, dictationAnswers, dictationResults, submitted, played, selectedTurn, dictationTurn, practiceTurn, review }); }, [restored, lessonId, mode, answers, results, dictationAnswers, dictationResults, submitted, played, selectedTurn, dictationTurn, practiceTurn, review]);
  useEffect(() => () => { if (gapTimer.current) clearTimeout(gapTimer.current); if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); audio.current?.pause(); }, []);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useControlReplay(() => play(selectedTurn), mode === "dictation" && Boolean(lesson));
  useEffect(() => {
    if (!lesson || mode !== "dictation") return;
    const timer = window.setTimeout(() => document.getElementById("sld-dictation-answer")?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [lesson, mode, selectedTurn]);
  useEffect(() => {
    if (!lesson || !restored || mode !== "dictation" || autoPlayedOnOpen.current) return;
    const timer = window.setTimeout(() => {
      if (autoPlayedOnOpen.current) return;
      autoPlayedOnOpen.current = true;
      play(selectedTurn, false, false, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lesson, restored, mode, selectedTurn]); // eslint-disable-line react-hooks/exhaustive-deps -- play uses the current lesson and sentence at the scheduled render
  useEffect(() => {
    if (previewLeft === null) return;
    if (previewLeft <= 0) { setPreviewLeft(null); setExamStartedAt(Date.now()); play(0, true); return; } // eslint-disable-line react-hooks/set-state-in-effect -- the countdown ends by starting the recording
    const timer = window.setTimeout(() => setPreviewLeft((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [previewLeft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (examStartedAt === null || submitted) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [examStartedAt, submitted]);

  const turnIndex = useMemo(() => new Map((lesson?.turns ?? []).map((turn, index) => [turn.source_turn_id, index])), [lesson]);
  const firstTurnIndex = useMemo(() => {
    const found = new Map<string, number>();
    (lesson?.turns ?? []).forEach((turn, index) => { if (!found.has(turn.source_turn_id)) found.set(turn.source_turn_id, index); });
    return found;
  }, [lesson]);
  const speakers = useMemo(() => Object.fromEntries((lesson?.speakers ?? []).map((speaker) => [speaker.speaker_id, speaker])), [lesson]);
  const reviewTurns = useMemo(() => {
    if (!lesson || !review) return [];
    const sources = new Map(review.transcript.map((turn) => [turn.turn_id, turn]));
    return lesson.turns.map((unit, index) => {
      const source = sources.get(unit.source_turn_id);
      if (!source) return null;
      const parts = sentenceText(source.text_en);
      const translations = sentenceTranslation(source.translation_vi);
      const number = Number(unit.turn_id.match(/-S(\d+)$/)?.[1] ?? 1) - 1;
      const last = lesson.turns[index + 1]?.source_turn_id !== unit.source_turn_id;
      return { ...source, turn_id: unit.turn_id, text_en: unit.turn_id === unit.source_turn_id ? source.text_en : parts[number] ?? source.text_en,
        translation_vi: translations.length === parts.length ? translations[number] : last ? source.translation_vi : "" };
    }).filter((turn): turn is NonNullable<typeof turn> => Boolean(turn));
  }, [lesson, review]);
  const examLocked = mode === "ielts" && !submitted;
  const activeTurn = lesson?.turns[selectedTurn];
  const activeDictationResult = activeTurn ? dictationResults[activeTurn.turn_id] : undefined;
  /** IELTS-style questions in listening order; dictation sentences are practised in "Nghe & chép" only. */
  const orderedQuestions = useMemo(() => {
    if (!lesson) return [];
    const position = (question: PublicQuestion) => Math.max(...question.evidence_turn_ids.map((id) => turnIndex.get(id) ?? 0), 0);
    return lesson.questions.filter((question) => question.type !== "dictation")
      .map((question, index) => ({ question, index })).sort((a, b) => position(a.question) - position(b.question) || a.index - b.index)
      .map((item) => item.question);
  }, [lesson, turnIndex]);
  const questionNumber = useMemo(() => new Map(orderedQuestions.map((question, index) => [question.question_id, index + 1])), [orderedQuestions]);
  const activeQuestions = mode === "practice" && activeTurn
    ? orderedQuestions.filter((question) => question.evidence_turn_ids.at(-1) === activeTurn.source_turn_id && turnIndex.get(activeTurn.source_turn_id) === selectedTurn)
    : mode === "ielts" ? orderedQuestions : [];
  const dictationPassedCount = (lesson?.turns ?? []).filter((turn) => turnPassed(dictationResults[turn.turn_id])).length;

  const stop = useCallback(() => {
    continuous.current = false;
    current.current = null;
    segmentEnd.current = null;
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    boundaryFrame.current = null;
    if (gapTimer.current) clearTimeout(gapTimer.current);
    audio.current?.pause();
    setPlaying(null); setPlayingAll(false);
  }, []);

  function chooseTurn(index: number, autoPlay = false) {
    if (!lesson || busy || index < 0 || index >= lesson.turns.length) return;
    stop();
    setSelectedTurn(index);
    if (mode === "dictation") setDictationTurn(index);
    if (mode === "practice") setPracticeTurn(index);
    setShowDictationAnswer(false);
    setRevealedWords(0);
    turnPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => {
      if (mode === "dictation") document.getElementById("sld-dictation-answer")?.focus({ preventScroll: true });
      else playButtonRef.current?.focus({ preventScroll: true });
    }, 0);
    if (autoPlay) window.setTimeout(() => play(index), 0);
  }

  function play(index: number, all = false, sourceTurn = false, automatic = false) {
    const player = audio.current;
    const turn = lesson?.turns[index];
    if (!player || !turn?.audio_url) return;
    setError("");
    if (gapTimer.current) clearTimeout(gapTimer.current);
    continuous.current = all;
    setPlayingAll(all);
    current.current = index;
    replaysLeft.current = all || mode === "ielts" ? 0 : settings.autoReplay;
    const endMs = sourceTurn
      ? [...lesson!.turns].reverse().find((item) => item.source_turn_id === turn.source_turn_id)?.end_ms ?? turn.end_ms
      : turn.end_ms;
    segmentEnd.current = null;
    setPlaying(index);
    if (!player.src.endsWith(turn.audio_url)) player.src = turn.audio_url;
    const start = () => {
      if (current.current !== index) return;
      player.currentTime = turn.start_ms / 1000;
      segmentEnd.current = endMs;
      player.playbackRate = speed;
      void player.play().then(() => watchBoundary(index)).catch((failure: unknown) => {
        if (current.current !== index) return;
        stop();
        setError(automatic && failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Trình duyệt chặn tự phát âm thanh. Bấm Nghe câu để bắt đầu."
          : "Trình duyệt chưa phát được audio. Hãy bấm phát lại.");
      });
    };
    if (player.readyState >= 1) start();
    else {
      player.addEventListener("loadedmetadata", start, { once: true });
      player.load();
    }
  }
  function watchBoundary(index: number) {
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    const tick = () => {
      if (current.current !== index) return;
      const end = segmentEnd.current;
      if (end !== null && audio.current && audio.current.currentTime >= end / 1000 - 0.015) { ended(); return; }
      boundaryFrame.current = requestAnimationFrame(tick);
    };
    boundaryFrame.current = requestAnimationFrame(tick);
  }
  /** Reads the playing turn from a ref: a state value could be stale between the pause and ended events. */
  function ended() {
    const index = current.current;
    if (index === null || !lesson) return;
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    boundaryFrame.current = null;
    audio.current?.pause();
    // Auto-replay only this sentence, starting at its boundary in the source clip.
    if (!continuous.current && replaysLeft.current > 0) {
      replaysLeft.current -= 1;
      gapTimer.current = setTimeout(() => {
        const element = audio.current;
        if (!element || current.current !== index) return;
        element.currentTime = lesson.turns[index].start_ms / 1000;
        element.playbackRate = speed;
        void element.play().then(() => watchBoundary(index)).catch(() => undefined);
      }, settings.replayDelay * 1000);
      return;
    }
    current.current = null;
    segmentEnd.current = null;
    if (continuous.current && index + 1 < lesson.turns.length) {
      gapTimer.current = setTimeout(() => play(index + 1, true), 450);
      return;
    }
    if (continuous.current && mode === "ielts") setPlayed(true);
    continuous.current = false;
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
    setBusy(`dictation:${turnId}`); setError("");
    try {
      const response = await fetch(`/api/dictation/skill-lab/${lesson.lesson_id}/dictation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turn_id: turnId, answer }),
      });
      const data = await response.json().catch(() => ({})) as DictationResult & { error?: string };
      if (!response.ok || !data.reference_text) throw new Error(data.error ?? "Không kiểm tra được câu chép.");
      const result: DictationResult = { ...data, skipped: skip, passed: !skip && data.correct, checked_answer: answer };
      const next = { ...dictationResults, [turnId]: result };
      setDictationResults(next);
      setShowDictationAnswer(skip || data.correct);
      if (!skip && !data.correct) setRevealedWords((count) => Math.min(count + 1, wordCount(data.reference_text ?? "")));
      const passedNow = lesson.turns.filter((turn) => turnPassed(next[turn.turn_id])).length;
      if (passedNow === lesson.turns.length && dictationPassedCount < lesson.turns.length) celebrate(dictationFeedbackRef.current, { label: "Chép xong cả bài!" });
      void savePracticeSnapshot(TURN_SLUG(lesson.lesson_id, turnId), { correct: turnPassed(result) ? 1 : 0, checked: 1, total: 1 }).catch(() => undefined);
      void savePracticeSnapshot(DICTATION_SLUG(lesson.lesson_id), { correct: passedNow, checked: lesson.turns.filter((turn) => Boolean(next[turn.turn_id])).length, total: lesson.turns.length }).catch(() => undefined);
      window.setTimeout(() => {
        dictationFeedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        document.getElementById("sld-dictation-answer")?.focus({ preventScroll: true });
      }, 0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không kiểm tra được câu chép."); }
    finally { setBusy(""); }
  }

  function dictationEnter() {
    if (!lesson || !activeTurn || busy) return;
    if (activeDictationResult && (turnPassed(activeDictationResult) || activeDictationResult.skipped)) {
      if (selectedTurn < lesson.turns.length - 1) chooseTurn(selectedTurn + 1, true);
      else changeMode("summary");
      return;
    }
    const typed = dictationAnswers[activeTurn.turn_id] ?? "";
    if (activeDictationResult?.reference_text && typed === activeDictationResult.checked_answer) {
      const count = wordCount(activeDictationResult.reference_text);
      setRevealedWords((shown) => Math.min(shown + 1, count));
      play(selectedTurn);
      document.getElementById("sld-dictation-answer")?.focus({ preventScroll: true });
      return;
    }
    void checkDictation();
  }

  async function grade(questionIds?: string[]) {
    if (!lesson) return;
    setBusy(questionIds ? questionIds.join(",") : "all"); setError("");
    try {
      const response = await fetch(`/api/dictation/skill-lab/${lesson.lesson_id}/grade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, answers, question_ids: questionIds ?? orderedQuestions.map((question) => question.question_id), submit: !questionIds }),
      });
      const data = await response.json().catch(() => ({})) as { results?: GradedQuestion[]; error?: string } & Partial<Review>;
      if (!response.ok || !data.results) throw new Error(data.error ?? "Không chấm được bài.");
      const graded = new Set(orderedQuestions.map((question) => question.question_id));
      // Drafts from before dictation sentences moved out of the question list may still hold their results.
      const next = Object.fromEntries(Object.entries({ ...results, ...Object.fromEntries(data.results.map((item) => [item.question_id, item])) }).filter(([id]) => graded.has(id)));
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
      void savePracticeResult(SLUG(lesson.lesson_id), { correct, checked, total: orderedQuestions.length }).catch(() => undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài."); }
    finally { setBusy(""); }
  }

  function restart(nextMode: Mode) {
    stop();
    setPreviewLeft(null); setExamStartedAt(null);
    setMode(nextMode); setAnswers({}); setResults({}); setSubmitted(false); setPlayed(false); setSelectedTurn(nextMode === "dictation" ? dictationTurn : 0); setPracticeTurn(0); setReview(null);
    setShowDictationAnswer(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeMode(nextMode: Mode) {
    if (nextMode === mode) return;
    stop(); setShowDictationAnswer(false);
    if (nextMode === "summary") { setMode("summary"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (nextMode === "ielts" || mode === "ielts") { restart(nextMode); return; }
    setMode(nextMode); setSelectedTurn(nextMode === "dictation" ? dictationTurn : practiceTurn);
  }

  if (error && !lesson) return <div className="voa-lab sld-lab"><nav className="voa-breadcrumb"><Link href={BASE}><ArrowLeft size={14} /> IELTS Skill Lab</Link></nav><section className="voa-surface sld-empty"><h2>Chưa mở được bài</h2><p>{error}</p></section></div>;
  if (!lesson) return <div className="voa-lab sld-lab"><p className="sld-muted">Đang tải bài…</p></div>;

  const correctCount = orderedQuestions.filter((question) => results[question.question_id]?.correct).length;
  const checkedCount = orderedQuestions.filter((question) => results[question.question_id]).length;
  const maps = [...new Set(activeQuestions.map((question) => question.map_url).filter(Boolean))] as string[];
  const totalMs = lesson.turns.reduce((sum, turn) => sum + (turn.duration_ms ?? 0), 0);
  const revealDictation = showDictationAnswer || Boolean(activeDictationResult?.skipped || activeDictationResult?.correct);
  const dictationDone = dictationPassedCount === lesson.turns.length;
  const questionsDone = orderedQuestions.length > 0 && checkedCount === orderedQuestions.length;
  const steps: { id: Mode; label: string; done: boolean; icon: typeof Headphones }[] = [
    { id: "dictation", label: "1 · Nghe & chép", done: dictationDone, icon: Headphones },
    ...(orderedQuestions.length ? [{ id: "practice" as Mode, label: "2 · Câu hỏi", done: questionsDone, icon: ListChecks }, { id: "ielts" as Mode, label: "3 · Làm bài một lần", done: submitted && mode === "ielts", icon: Play }] : []),
    { id: "summary", label: "Tổng kết", done: false, icon: Flag },
  ];

  return (
    <div className={`voa-lab sld-lab${mode === "dictation" ? " sld-dictation-view" : ""}`}>
      <header className="voa-lesson-header">
        <div>
          <button type="button" className="voa-lesson-back" onClick={() => { stop(); router.push(skillLabStageUrl(skillLabStageOf(lesson.lesson_id))); }}><ArrowLeft size={15} /> {skillLabStages.find((stage) => stage.id === skillLabStageOf(lesson.lesson_id))?.label} IELTS</button>
          <h1>{lesson.title}</h1>
          <p>{[levelLabel(lesson.level), lesson.section ? `Section ${lesson.section}` : "Foundation", lesson.topic, formats[lesson.content_format] ?? lesson.content_format]
            .filter((part, index, parts) => parts.indexOf(part) === index).join(" · ")}</p>
        </div>
        <nav className="sld-mode sld-steps" aria-label="Các bước của bài">
          {steps.map((step) => <button type="button" key={step.id} aria-current={mode === step.id ? "step" : undefined} className={`${mode === step.id ? "active" : ""}${step.done ? " done" : ""}`} onClick={() => changeMode(step.id)}>
            {step.done ? <Check size={15} /> : <step.icon size={15} />} {step.label}</button>)}
        </nav>
      </header>
      {mode === "summary" ? <LessonSummary lesson={lesson} dictationResults={dictationResults} questionResults={results} questions={orderedQuestions}
        onRedo={(index) => { setMode("dictation"); setSelectedTurn(index); setDictationTurn(index); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onStep={(step) => changeMode(step)} /> : <>

      <div className="voa-info-banner"><Info size={15} /><span>{mode === "dictation"
        ? "Nghe từng câu, chép lại và kiểm tra ngay. Câu ngắn và các từ trọng tâm (âm, số, tên) phải đúng chính xác."
        : mode === "practice" ? "Luyện tập: trả lời các câu hỏi IELTS theo từng câu nghe, kiểm tra ngay và nghe lại tùy ý."
          : "Làm bài một lần: audio phát liền một lượt, không nghe lại và không xem đáp án trước khi nộp. Chấm theo đúng đáp án và giới hạn số từ."}</span></div>
      {mode !== "dictation" && lesson.learning_objectives_vi.length > 0 && <ul className="sld-goals">{lesson.learning_objectives_vi.map((goal) => <li key={goal}><Check size={14} /> {goal}</li>)}</ul>}

      <section ref={turnPanelRef} className="sld-player voa-surface" aria-label={mode === "ielts" ? "Bài nghe" : "Câu nghe hiện tại"}>
        <audio ref={audio} preload="metadata" onError={() => { stop(); setError("Không tải được audio câu này. Hãy bấm nghe lại."); }} onEnded={ended} onTimeUpdate={(event) => {
          const end = segmentEnd.current;
          if (end !== null && end !== undefined && event.currentTarget.currentTime >= end / 1000 - 0.03) ended();
        }} />
        <div className="sld-player-row">
          {examLocked ? (
            previewLeft !== null ? <span className="sld-preview"><b>{previewLeft}s</b> đọc câu hỏi trước khi nghe <button type="button" onClick={() => setPreviewLeft(0)}>Nghe ngay</button></span> : <>
            <button type="button" className="voa-primary-button" disabled={played || playing !== null} onClick={() => setPreviewLeft(30)}>
              <Play size={16} /> {played ? "Đã phát hết (1 lần)" : playing !== null ? `Đang phát câu ${playing + 1}/${lesson.turns.length}` : "Bắt đầu (30 giây đọc đề)"}
            </button>
            {examStartedAt !== null && <span className="sld-exam-clock" title="Thời gian làm bài">⏱ {clock(now - examStartedAt)}</span>}</>
          ) : playing !== null && (playingAll || mode !== "ielts") ? (
            <button type="button" className="voa-primary-button" onClick={stop}><Pause size={16} /> Dừng</button>
          ) : (
            <button ref={playButtonRef} type="button" className="voa-primary-button" onClick={() => mode === "ielts" ? play(0, true) : play(selectedTurn)}><Play size={16} /> {mode === "ielts" ? "Phát cả bài" : `Nghe câu ${selectedTurn + 1}`}</button>
          )}
          <span className="sld-muted">{mode !== "ielts" ? `Câu ${selectedTurn + 1}/${lesson.turns.length} · ${clock(activeTurn?.duration_ms ?? 0)}` : `${lesson.turns.length} câu nghe · ${clock(totalMs)}`} · giọng {[...new Set(lesson.speakers.map((speaker) => accents[speaker.accent] ?? speaker.accent))].join(", ")}</span>
          <PlaybackControls settings={settings} lockSpeed={mode === "ielts"} />
        </div>
        <ClipProgress audio={audio} startMs={playing !== null ? lesson.turns[playing]?.start_ms : activeTurn?.start_ms}
          endMs={(playing !== null ? segmentEnd.current ?? lesson.turns[playing]?.end_ms : activeTurn?.end_ms) ?? undefined} />
      </section>

      {error && <p className="sld-error" role="alert">{error}</p>}

      {mode === "practice" && activeTurn && <div className="sld-turn-heading"><div><span className="voa-eyebrow">LUYỆN TẬP · CÂU NGHE {selectedTurn + 1}/{lesson.turns.length}</span><h2>{`Câu ${selectedTurn + 1}`}{lesson.speakers.length > 1 ? ` · ${speakers[activeTurn.speaker_id]?.label ?? activeTurn.speaker_id}` : ""}</h2><p>{activeQuestions.length ? `${activeQuestions.length} câu hỏi cho câu nghe này. Nghe câu này rồi trả lời trước khi sang câu tiếp.` : "Câu này không có câu hỏi riêng. Nghe xong hãy chuyển sang câu tiếp."}</p></div></div>}
      {mode === "dictation" && activeTurn && <section className="sld-dictation voa-surface" aria-label={`Chép câu ${selectedTurn + 1}`}>
        <div className="sld-dictation-heading"><label htmlFor="sld-dictation-answer">Nghe & chép · câu {selectedTurn + 1}{lesson.speakers.length > 1 ? ` · ${speakers[activeTurn.speaker_id]?.label ?? ""}` : ""}</label><span>{selectedTurn + 1}/{lesson.turns.length}</span></div>
        <textarea id="sld-dictation-answer" className="sld-dictation-answer" rows={2} value={dictationAnswers[activeTurn.turn_id] ?? ""} spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="Gõ câu bạn nghe được…"
          onChange={(event) => {
            const value = event.target.value;
            setDictationAnswers((current) => ({ ...current, [activeTurn.turn_id]: value }));
            if (activeDictationResult?.skipped || activeDictationResult?.correct) {
              setDictationResults((current) => { const next = { ...current }; delete next[activeTurn.turn_id]; return next; });
              setShowDictationAnswer(false);
              setRevealedWords(0);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); play(selectedTurn); }
            else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); dictationEnter(); }
          }} />
        {activeDictationResult && <DictationFeedback result={activeDictationResult} answer={dictationAnswers[activeTurn.turn_id] ?? ""} reveal={revealDictation} revealedWords={revealedWords} feedbackRef={dictationFeedbackRef}
          onReveal={() => { setRevealedWords((shown) => Math.min(shown + 1, wordCount(activeDictationResult.reference_text ?? ""))); play(selectedTurn); document.getElementById("sld-dictation-answer")?.focus(); }} topic={lesson.topic} sourcePath={`${BASE}/${lesson.lesson_id}`}
          onEnter={dictationEnter} />}
        <div className="sld-dictation-actions"><div><button type="button" className="voa-primary-button" disabled={Boolean(busy)} onClick={dictationEnter}><Check size={15} /> {busy === `dictation:${activeTurn.turn_id}` ? "Đang kiểm tra…" : activeDictationResult && !turnPassed(activeDictationResult) && !activeDictationResult.skipped ? "Gợi ý / Kiểm tra" : "Kiểm tra"}</button>
          <button type="button" onClick={() => play(selectedTurn)} className="sld-replay-inline"><RotateCcw size={15} /> Nghe lại</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void checkDictation(true)}>Bỏ qua · Xem đáp án</button>
          {activeDictationResult && (turnPassed(activeDictationResult) || activeDictationResult.skipped) && selectedTurn < lesson.turns.length - 1 && <button type="button" onClick={() => chooseTurn(selectedTurn + 1, true)}>Câu tiếp <ArrowRight size={15} /></button>}
        </div><span className="sld-muted sld-shortcuts">Enter: kiểm tra hoặc lộ thêm 1 từ; chép đúng rồi Enter sang câu và tự phát · Ctrl nghe lại</span></div>
      </section>}
      {mode === "dictation" && <section className="sld-dictation-progress voa-surface" aria-label="Tiến độ nghe chép">
        <div className="sld-dictation-progress-head"><strong>Các câu trong bài</strong><span>{dictationPassedCount}/{lesson.turns.length} đã đạt</span></div>
        <div className="sld-dictation-meter" aria-hidden="true"><span style={{ width: `${100 * dictationPassedCount / lesson.turns.length}%` }} /></div>
        <nav className="sld-dictation-grid" aria-label="Chọn câu nghe">{lesson.turns.map((turn, index) => {
          const result = dictationResults[turn.turn_id];
          return <button type="button" key={turn.turn_id} aria-current={index === selectedTurn ? "step" : undefined} aria-label={`Câu ${index + 1}${result ? turnPassed(result) ? ", đã đạt" : result.skipped ? ", đã bỏ qua" : ", cần làm lại" : ""}`} className={`${index === selectedTurn ? "active " : ""}${result ? result.skipped ? "skipped" : turnPassed(result) ? "passed" : "retry" : ""}`} onClick={() => chooseTurn(index, true)}>{index + 1}{turnPassed(result) ? <Check size={13} /> : null}</button>;
        })}</nav>
        {dictationDone && <div className="sld-dictation-done"><Check size={15} /> Bạn đã chép đạt cả bài.
          {orderedQuestions.length > 0 && <button type="button" className="voa-primary-button" onClick={() => changeMode("practice")}>Sang bước 2: Câu hỏi <ArrowRight size={14} /></button>}
          <button type="button" onClick={() => changeMode("summary")}>Xem tổng kết</button></div>}
      </section>}
      {/* With a plan, it stays beside the questions on wide screens so it is in view while answering. */}
      <div className={mode !== "dictation" && maps.length ? "sld-map-layout" : "sld-map-layout-none"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG plans from the lesson package */}
      {mode !== "dictation" && maps.length > 0 && <aside className="sld-map-aside">{maps.map((url) => <figure key={url} className="sld-map voa-surface"><img src={url} alt="Sơ đồ cho câu hỏi gắn nhãn" /><figcaption>Sơ đồ dùng cho các câu Map labelling</figcaption></figure>)}</aside>}
      {activeQuestions.length > 0 && <ol className="sld-questions">
        {activeQuestions.map((question) => (
          <QuestionCard key={question.question_id} number={questionNumber.get(question.question_id) ?? 0} question={question} value={answers[question.question_id] ?? ""} result={results[question.question_id]}
            mode={mode} locked={submitted || (mode === "practice" && Boolean(results[question.question_id]))} busy={busy === question.question_id}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.question_id]: value }))}
            onCheck={() => void grade([question.question_id])}
            onRetry={() => setResults((current) => { const next = { ...current }; delete next[question.question_id]; return next; })}
            onPlayEvidence={!examLocked ? (turnId) => { const at = firstTurnIndex.get(turnId); if (at !== undefined) play(at, false, true); } : undefined}
            turnLabel={(turnId) => `câu ${(firstTurnIndex.get(turnId) ?? 0) + 1}`} />
        ))}
      </ol>}
      </div>

      {mode !== "ielts" && <nav className="sld-turn-nav voa-surface" aria-label="Chuyển câu nghe"><button type="button" disabled={selectedTurn === 0} onClick={() => chooseTurn(selectedTurn - 1, mode === "dictation")}><ArrowLeft size={16} /> Câu trước</button><span>{selectedTurn + 1} / {lesson.turns.length}</span><button ref={nextTurnButtonRef} type="button" className="voa-primary-button" disabled={selectedTurn === lesson.turns.length - 1} onClick={() => chooseTurn(selectedTurn + 1, mode === "dictation")}>Câu tiếp <ArrowRight size={16} /></button></nav>}

      {mode !== "dictation" && (mode === "ielts" || selectedTurn === lesson.turns.length - 1 || submitted) && <section className="sld-submit voa-surface">
        {submitted ? (
          <>
            <div><strong>{correctCount}/{orderedQuestions.length} câu đúng</strong>{mode === "ielts" && <span className="sld-muted">Chấm theo chế độ một lần nghe.</span>}</div>
            <div className="sld-submit-actions">
              <button type="button" onClick={() => restart(mode)}><RotateCcw size={15} /> Làm lại</button>
              <button type="button" className="voa-primary-button" onClick={() => changeMode("summary")}>Xem tổng kết bài <ArrowRight size={15} /></button>
            </div>
          </>
        ) : (
          <>
            <div><strong>{mode === "practice" ? `Đã kiểm tra ${checkedCount}/${orderedQuestions.length} câu` : `Đã trả lời ${orderedQuestions.filter((question) => answers[question.question_id]?.trim()).length}/${orderedQuestions.length} câu`}</strong>
              <span className="sld-muted">Nộp bài để xem toàn bộ transcript, bản dịch và từ vựng.</span></div>
            <div className="sld-submit-actions">
              {mode === "practice" && questionsDone && <button type="button" onClick={() => changeMode("summary")}>Xem tổng kết</button>}
              <button ref={submitButtonRef} type="button" className="voa-primary-button" disabled={busy === "all"} onClick={() => void grade()}><Send size={15} /> {busy === "all" ? "Đang chấm…" : "Nộp bài"}</button>
            </div>
          </>
        )}
      </section>}

      {mode !== "dictation" && review && (
        <section className="sld-review voa-surface">
          <h2>Transcript</h2>
          <ol className="sld-transcript">
            {reviewTurns.map((turn, index) => (
              <li key={turn.turn_id}>
                <button type="button" aria-label={`Nghe câu ${index + 1}`} onClick={() => { if (playing === index) stop(); else play(index); }}>{playing === index ? <Pause size={13} /> : <Play size={13} />}</button>
                <div><span className="sld-speaker">Câu {index + 1} · {speakers[turn.speaker_id]?.label ?? turn.speaker_id}</span><p>{turn.text_en}</p><p className="sld-vi">{turn.translation_vi}</p></div>
              </li>
            ))}
          </ol>
          {review.vocabulary.length > 0 && <>
            <h2>Từ vựng trong bài</h2>
            <dl className="sld-vocab">{review.vocabulary.map((word) => <div key={word.term}><dt>{word.term} <small>{word.pos}</small></dt><dd>{word.meaning_vi}<span>{word.example_en}</span><SaveWordButton word={word} topic={lesson.topic} sourcePath={`${BASE}/${lesson.lesson_id}`} /></dd></div>)}</dl>
          </>}
        </section>
      )}
      </>}
    </div>
  );
}

function QuestionCard({ number, question, value, result, mode, locked, busy, onChange, onCheck, onRetry, onPlayEvidence, turnLabel }: {
  number: number; question: PublicQuestion; value: string; result?: GradedQuestion; mode: Mode; locked: boolean; busy: boolean; turnLabel: (turnId: string) => string;
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
        {onPlayEvidence && mode === "practice" && question.evidence_turn_ids.map((turnId) => <button type="button" key={turnId} className="sld-evidence" onClick={() => onPlayEvidence(turnId)}><Headphones size={13} /> Nghe {turnLabel(turnId)}</button>)}
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

/** Verdict, word-by-word comparison, teaching note and the sentence's new words (with "save to notebook"). */
function DictationFeedback({ result, answer, reveal, revealedWords, feedbackRef, onReveal, onEnter, topic, sourcePath }: {
  result: DictationResult; answer: string; reveal: boolean; revealedWords: number; feedbackRef: React.RefObject<HTMLDivElement | null>;
  onReveal: () => void; onEnter: () => void; topic: string; sourcePath: string;
}) {
  const passed = turnPassed(result);
  const reference = result.reference_text ?? "";
  const diff = reference && answer.trim() && !result.skipped ? wordDifferences(reference, answer) : [];
  const focus = new Set((result.focus ?? []).flatMap((phrase) => phrase.toLowerCase().split(/\s+/)));
  const verdict = result.skipped ? "Đã bỏ qua câu này"
    : result.correct ? "Chính xác!"
      : `Chưa đúng · nghe lại, chép đủ từng từ (${Math.round(result.accuracy * 100)}%)`;
  return (
    <div ref={feedbackRef} tabIndex={-1} className={`sld-dictation-feedback ${passed ? "correct" : result.skipped ? "skipped" : "wrong"}`} role="status"
      onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); } }}>
      <strong>{verdict}</strong>
      {!reference ? <p className="sld-muted">Kết quả lưu từ lần học trước. Gõ lại và kiểm tra để xem đáp án.</p>
        : reveal ? <>
          {diff.length > 0 && !result.correct ? <p className="sld-diff" aria-label="So sánh từng từ">{diff.map((item, index) => <span key={index} className={`${item.kind}${focus.has(item.word) ? " focus" : ""}`}>{item.word}</span>)}</p> : null}
          <p className="sld-reference">{reference}</p>
          {result.translation_vi && <small>{result.translation_vi}</small>}
        </> : <>
          <p aria-label={`Đã gợi ý ${revealedWords} từ`}>{maskedAnswer(reference, revealedWords)}</p>
          {revealedWords < wordCount(reference)
            ? <button type="button" onClick={onReveal}>Gợi ý từ tiếp theo (Enter)</button>
            : <small>Đã gợi ý hết từ. Hãy chép lại cả câu cho đúng.</small>}
        </>}
      {reveal && result.explanation_vi && <p className="sld-explanation"><Info size={14} /> {result.explanation_vi}</p>}
      {reveal && (result.vocabulary?.length ?? 0) > 0 && <div className="sld-turn-words" aria-label="Từ mới trong câu">
        {result.vocabulary!.map((word) => <span key={word.term}><b>{word.term}</b> <small>{word.pos}</small> · {word.meaning_vi} <SaveWordButton word={word} topic={topic} sourcePath={sourcePath} /></span>)}
      </div>}
    </div>
  );
}

/** Adds a lesson word to the learner's Vocabulary notebook (which also counts toward the study streak). */
function SaveWordButton({ word, topic, sourcePath }: { word: LessonVocabulary; topic: string; sourcePath: string }) {
  const { entries, addEntry } = useNotebook();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const already = entries.some((entry) => entry.kind === "word" && entry.title.trim().toLowerCase() === word.term.toLowerCase());
  async function save() {
    setState("saving");
    try {
      await addEntry({ kind: "word", title: word.term, body: "", meaningVi: word.meaning_vi, example: word.example_en, phonetic: "", partOfSpeech: word.pos, topic, sourceUrl: "" }, sourcePath);
      setState("saved");
    } catch { setState("error"); }
  }
  const shown = already ? "saved" : state;
  return <button type="button" className="sld-save-word" disabled={shown === "saving" || shown === "saved"} onClick={() => void save()}>
    {shown === "saved" ? <><Check size={13} /> Đã lưu</> : shown === "saving" ? "Đang lưu…" : shown === "error" ? "Thử lưu lại" : "Lưu vào Sổ tay"}
  </button>;
}

/** End of a lesson: what passed, what to redo, the lesson's words, and the next lesson in the stage. */
function LessonSummary({ lesson, dictationResults, questionResults, questions, onRedo, onStep }: {
  lesson: PublicLesson; dictationResults: Record<string, DictationResult>; questionResults: Record<string, GradedQuestion>; questions: PublicQuestion[];
  onRedo: (turnIndex: number) => void; onStep: (step: Mode) => void;
}) {
  const router = useRouter();
  const [next, setNext] = useState<CatalogEntry | null | undefined>(undefined);
  const stage = skillLabStageOf(lesson.lesson_id);
  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/dictation/skill-lab").then((response) => response.json() as Promise<{ lessons?: CatalogEntry[] }>), loadResults()]).then(([data, progress]) => {
      if (!alive) return;
      const inStage = (data.lessons ?? []).filter((item) => item.audio_ready && skillLabStageOf(item.lesson_id) === stage);
      const after = inStage.findIndex((item) => item.lesson_id === lesson.lesson_id);
      const isDone = (item: CatalogEntry) => item.lesson_id === lesson.lesson_id || (progress[item.lesson_id]?.dictation?.correct ?? 0) >= item.turns;
      setNext([...inStage.slice(after + 1), ...inStage.slice(0, Math.max(0, after))].find((item) => !isDone(item)) ?? null);
    }).catch(() => { if (alive) setNext(null); });
    return () => { alive = false; };
  }, [lesson.lesson_id, stage]);

  const passed = lesson.turns.filter((turn) => turnPassed(dictationResults[turn.turn_id])).length;
  const toRedo = lesson.turns.map((turn, index) => ({ turn, index, result: dictationResults[turn.turn_id] })).filter((entry) => !turnPassed(entry.result));
  const correct = questions.filter((question) => questionResults[question.question_id]?.correct).length;
  const checked = questions.filter((question) => questionResults[question.question_id]).length;
  const words = [...new Map(Object.values(dictationResults).flatMap((result) => result.vocabulary ?? []).map((word) => [word.term, word])).values()];
  const complete = passed === lesson.turns.length;
  return (
    <section className="sld-summary" aria-live="polite">
      <div className="sld-summary-hero voa-surface">
        <span className="voa-eyebrow">TỔNG KẾT BÀI</span>
        <h2>{complete ? "Hoàn thành bài này!" : "Bài đang làm dở"}</h2>
        <div className="sld-summary-stats">
          <div><strong>{passed}/{lesson.turns.length}</strong><span>câu chép đạt</span></div>
          <div><strong>{questions.length ? `${correct}/${questions.length}` : "—"}</strong><span>{questions.length ? `câu hỏi đúng${checked < questions.length ? ` (đã làm ${checked})` : ""}` : "bài không có câu hỏi"}</span></div>
          <div><strong>{words.length}</strong><span>từ mới đã gặp</span></div>
        </div>
        <div className="sld-summary-actions">
          {next ? <button type="button" className="voa-primary-button" onClick={() => router.push(`${BASE}/${next.lesson_id}`)}>Bài tiếp theo: {next.title} <ArrowRight size={15} /></button>
            : next === null ? <Link className="voa-primary-button" href={`${skillLabStageUrl(stage)}/test`}><Flag size={15} /> Làm bài kiểm tra cuối chặng</Link> : null}
          {!complete && <button type="button" onClick={() => onStep("dictation")}>Tiếp tục chép</button>}
          {complete && questions.length > 0 && checked < questions.length && <button type="button" onClick={() => onStep("practice")}>Làm câu hỏi</button>}
          <Link href="/app/dictation/banks/skill-lab">Về lộ trình</Link>
        </div>
      </div>
      {toRedo.length > 0 && <div className="voa-surface sld-summary-block"><h3>Câu cần làm lại</h3><ol className="sld-summary-redo">
        {toRedo.map(({ turn, index, result }) => <li key={turn.turn_id}><span>Câu {index + 1}</span><small>{!result ? "chưa làm" : result.skipped ? "đã bỏ qua" : result.reference_text ? `đúng ${Math.round(result.accuracy * 100)}% từ` : "chưa đạt ở lần trước"}</small><button type="button" onClick={() => onRedo(index)}>Làm lại</button></li>)}
      </ol></div>}
      {words.length > 0 && <div className="voa-surface sld-summary-block"><h3>Từ mới trong bài</h3><dl className="sld-vocab">
        {words.map((word) => <div key={word.term}><dt>{word.term} <small>{word.pos}</small></dt><dd>{word.meaning_vi}<span>{word.example_en}</span><SaveWordButton word={word} topic={lesson.topic} sourcePath={`${BASE}/${lesson.lesson_id}`} /></dd></div>)}
      </dl></div>}
    </section>
  );
}
