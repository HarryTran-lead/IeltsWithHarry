"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenText, Check, ChevronDown, Cloud, CloudOff, Flame, Headphones, Lightbulb, Mic, PenLine, RotateCcw, SkipForward, Target, TriangleAlert, Volume2, X, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { celebrate } from "@/lib/celebrate";
import { savePracticeSnapshot } from "./practice-results";
import { cacheBook2State, loadBook2State, saveBook2State, type Book2SavedState, type Book2Step } from "./book2-lesson-state";
import { Book2SourcePanel } from "./book2-source-panel";
import { Book2TestSheet } from "./book2-test-sheet";
import { Book2Coach, coachLines, type CoachScript } from "./book2-coach";
import { TeachingLearn, teachingCoach, type Book2Teaching } from "./book2-teaching";
import { book2OptionOrder, evaluateBook2Progress, requiredBook2WritingWords } from "./book2-progress";
import "./book2-lesson.css";

type Bilingual = { en?: string; vi?: string };
type Book2Item = {
  question_id: string; item_type: string; prompt_en: string; prompt_vi?: string;
  options?: string[]; answer: { kind: string; accepted?: string[]; model_en?: string; model_vi?: string; has_model?: boolean };
  explanation_en?: string; explanation_vi?: string; evidence?: string;
  passage_id?: string; audio_id?: string; data_id?: string;
};
type Exercise = { id: string; title: string; instruction?: Bilingual | null; questions: Book2Item[] };
type PracticeGroup = Exercise & { originalExercise: number };
function makePracticeGroups(exercises: Exercise[]): PracticeGroup[] {
  return exercises.flatMap((exercise, originalExercise) => {
    const count = Math.ceil(exercise.questions.length / 6);
    return Array.from({ length: count }, (_, part) => ({
      ...exercise,
      id: `${exercise.id}-${part}`,
      title: count > 1 ? `${exercise.title} · phần ${part + 1}/${count}` : exercise.title,
      questions: exercise.questions.slice(part * 6, (part + 1) * 6),
      originalExercise,
    }));
  });
}
/** Grammar entries come in two shapes: formula/meaning, or title/form/explanation/example. */
type GrammarEntry = { formula?: string; meaning?: Bilingual; title?: string; form?: string; explanation?: Bilingual; example?: string };
export type Book2Content = {
  type: "book2"; book_id: "BOOK_2"; source_id: string; unit_id: string;
  lesson: {
    title: string; duration_minutes?: number; learning_objectives: Bilingual[];
    theory: { title: string; content?: Bilingual; example?: Bilingual }[];
    vocabulary: { term?: string; meaning_vi?: string; example_en?: string }[];
    grammar: GrammarEntry[];
    strategies: { topic?: string; en?: string; vi?: string }[];
    common_mistakes: { wrong?: string; correct?: string; reason?: Bilingual }[];
    mini_review: Bilingual[];
    rubric?: { criteria?: string[]; self_rating_scale?: string } | null;
  };
  passages: { id: string; title?: string; text: string }[];
  audios: { id: string; title?: string; transcript?: string; audio_url?: string; has_transcript?: boolean }[];
  visuals: { id: string; title?: string; headers?: string[]; rows?: (string | number)[][]; image_url?: string }[];
  exercises: Exercise[];
  /** Scripted coach from the package; lessons without one get tips built from their questions. */
  coach?: CoachScript;
  /** The lesson this one was split from, whose saved answers it starts with. */
  legacy_slug?: string;
  /** C09 teaching layer: worked examples, tips, mistakes, guided steps and coach events. */
  teaching?: Book2Teaching;
};
type Nav = { previous: { slug: string; title: string } | null; next: { slug: string; title: string } | null; index: number; total: number } | null;

const wordsIn = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
const isObjective = (item: Book2Item) => item.answer.kind === "objective";
/** What the lesson API returns once an objective answer is submitted. */
type Verdict = { correct: boolean; accepted: string[]; explanation_vi?: string; explanation_en?: string; evidence?: string };
type Model = { model_en: string; model_vi: string; explanation_vi: string };
function sourceFor(item: Book2Item) { return item.passage_id || item.audio_id || item.data_id; }
/** Reads English aloud with the browser voice, for model answers and stress words that have no recording. */
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = window.speechSynthesis.getVoices().find((voice) => /^en-(GB|US|AU)/i.test(voice.lang)) ?? null;
  utterance.lang = utterance.voice?.lang ?? "en-GB";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
/** IELTS timing: Part 2 has a minute to prepare and up to two minutes to speak; Part 1 answers last about 30 seconds, Part 3 about a minute. */
function speakingTimes(text: string) {
  if (/part 2|describe a/i.test(text)) return { seconds: 60, speak: 120 };
  if (/part 3/i.test(text)) return { seconds: 15, speak: 60 };
  return { seconds: 10, speak: 30 };
}
const stressWord = (prompt: string) => prompt.match(/stress in “([^”]+)”/i)?.[1];

/** Each skill has its own colour, icon and sticker, so lessons are recognisable at a glance. */
const skillThemes: Record<string, { tone: string; label: string; icon: LucideIcon; sticker: StickerName }> = {
  Reading: { tone: "reading", label: "Đọc", icon: BookOpenText, sticker: "book" },
  Listening: { tone: "listening", label: "Nghe", icon: Headphones, sticker: "headphones" },
  Writing: { tone: "writing", label: "Viết", icon: PenLine, sticker: "pencil" },
  Speaking: { tone: "speaking", label: "Nói", icon: Mic, sticker: "mic" },
};
const praise = ["Chính xác!", "Tuyệt vời!", "Rất tốt!", "Chuẩn rồi!", "Giỏi lắm!"];

function ProgressRing({ value, size = 64, children }: { value: number; size?: number; children?: ReactNode }) {
  const radius = size / 2 - 6;
  const length = 2 * Math.PI * radius;
  return <span className="b2-ring" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={radius} className="b2-ring-track" /><circle cx={size / 2} cy={size / 2} r={radius} className="b2-ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(1, Math.max(0, value)))} /></svg>
    <span>{children}</span>
  </span>;
}

/** Vocabulary as a flip card: the term first, the meaning and example on the back. */
function WordCard({ term, meaning, example }: { term?: string; meaning?: string; example?: string }) {
  const [flipped, setFlipped] = useState(false);
  return <div className={`b2-word ${flipped ? "is-flipped" : ""}`}>
    <button type="button" className="b2-word-face" onClick={() => setFlipped((value) => !value)} aria-pressed={flipped} aria-label={flipped ? `${term}: ${meaning}` : `${term}, bấm để xem nghĩa`}>
      {flipped ? <><span className="b2-word-meaning">{meaning}</span>{example && <small>{example}</small>}</> : <><strong>{term}</strong><small>Bấm để xem nghĩa</small></>}
    </button>
    {term && <button type="button" className="b2-word-say" onClick={() => speak(term)} aria-label={`Nghe ${term}`}><Volume2 size={16} /></button>}
  </div>;
}

export function Book2LessonPage({ lesson, content, navigation, canManage }: {
  lesson: { slug: string; title: string; skill: string }; content: Book2Content; navigation: Nav; canManage: boolean;
}) {
  const questions = useMemo(() => content.exercises.flatMap((exercise) => exercise.questions), [content.exercises]);
  const groups = useMemo(() => makePracticeGroups(content.exercises), [content.exercises]);
  // Reading and Listening are practised like the exam: every question listed, answered, then submitted once.
  const testMode = lesson.skill === "Reading" || lesson.skill === "Listening";
  const [blankWarning, setBlankWarning] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<Book2Step>("learn");
  // Practice shows one question at a time; the saved `exerciseIndex` field now holds that question's position.
  const [position, setPosition] = useState(0);
  const [streak, setStreak] = useState(0);
  const [restored, setRestored] = useState(false);
  const [recordings, setRecordings] = useState<Record<string, string>>({});
  const [recordingId, setRecordingId] = useState("");
  const [timer, setTimer] = useState<{ id: string; phase: "prepare" | "speak"; seconds: number; speak: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingUrls = useRef<string[]>([]);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef<{ state: Book2SavedState; snapshot: { correct: number; checked: number; total: number; mastered: boolean; needsReview: boolean } } | null>(null);
  const celebrated = useRef(false);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const [recordError, setRecordError] = useState("");
  // On phones the source panel sits above the questions. A passage or table starts folded so the question stays
  // readable; an audio-only lesson starts open because the small player is the first thing the learner needs.
  const [sourcesOpen, setSourcesOpen] = useState(content.audios.length > 0 && !content.passages.length && !content.visuals.length);
  const [syncStatus, setSyncStatus] = useState<"saving" | "account" | "device">("saving");
  const [correct, setCorrect] = useState<Record<string, boolean>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [models, setModels] = useState<Record<string, Model>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState("");
  const [requestError, setRequestError] = useState("");
  const rechecked = useRef(false);
  const [coachTips, setCoachTips] = useState(false);
  const [coachNote, setCoachNote] = useState("");
  const theme = skillThemes[lesson.skill] ?? skillThemes.Reading;
  const SkillIcon = theme.icon;

  useEffect(() => {
    let active = true;
    void loadBook2State(lesson.slug, content.legacy_slug).then((saved) => {
      if (!active) return;
      setAnswers(saved.answers); setChecked(saved.checked); setRatings(saved.ratings); setCorrect(saved.correct ?? {});
      setChecklist(saved.checklist); setStep(saved.step);
      setPosition(Math.min(Math.max(saved.exerciseIndex, 0), Math.max(questions.length - 1, 0)));
      setRestored(true);
    }).catch(() => setRestored(true));
    return () => { active = false; };
  }, [lesson.slug, content.legacy_slug, questions.length]);

  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    recordingUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    const latest = latestSave.current;
    if (!latest) return;
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      await saveBook2State(lesson.slug, latest.state);
      await savePracticeSnapshot(lesson.slug, latest.snapshot);
    }).catch(() => undefined);
  }, [lesson.slug]);

  useEffect(() => {
    if (!timer) return;
    const interval = window.setInterval(() => setTimer((current) => {
      if (!current) return null;
      if (current.seconds > 1) return { ...current, seconds: current.seconds - 1 };
      return current.phase === "prepare" ? { ...current, phase: "speak", seconds: current.speak } : null;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const { objective, open, objectiveCorrect, openReviewed, openReady, completedCount, mastered, needsReview, problems } = evaluateBook2Progress(questions, answers, checked, ratings, correct);
  const vocabularyGroups = Array.from({ length: Math.ceil(content.lesson.vocabulary.length / 8) }, (_, index) => content.lesson.vocabulary.slice(index * 8, (index + 1) * 8));
  const hasSources = content.passages.length + content.audios.length + content.visuals.length > 0;
  const current = questions[position];
  const currentGroupIndex = current ? groups.findIndex((group) => group.questions.some((item) => item.question_id === current.question_id)) : -1;
  const currentGroup = groups[currentGroupIndex];
  const resolved = (item: Book2Item) => isObjective(item) ? Boolean(checked[item.question_id]) : (ratings[item.question_id] ?? 0) > 0;
  const accuracy = objective.length ? Math.round(objectiveCorrect.length / Math.max(1, objective.filter((item) => checked[item.question_id]).length) * 100) : 0;

  useEffect(() => {
    if (!restored) return;
    const state: Book2SavedState = {
      book2: 1, answers, checked, correct, ratings, checklist, step, exerciseIndex: position,
      mastered, needsReview, updatedAt: 0,
    };
    const snapshot = {
      correct: objectiveCorrect.length + openReady.length,
      checked: completedCount, total: questions.length, mastered, needsReview,
    };
    window.queueMicrotask(() => {
      state.updatedAt = Date.now();
      cacheBook2State(lesson.slug, state);
      latestSave.current = { state, snapshot };
    });
    const id = window.setTimeout(() => {
      setSyncStatus("saving");
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        const synced = await saveBook2State(lesson.slug, state);
        await savePracticeSnapshot(lesson.slug, snapshot);
        setSyncStatus(synced ? "account" : "device");
      }).catch(() => setSyncStatus("device"));
    }, 700);
    return () => window.clearTimeout(id);
  }, [lesson.slug, answers, checked, correct, ratings, checklist, step, position, mastered, needsReview, restored, objectiveCorrect.length, openReady.length, completedCount, questions.length]);

  async function callLesson<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`/api/book2/lessons/${lesson.slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || "Không kết nối được máy chủ. Thử lại sau.");
    return data;
  }
  function storeVerdicts(found: Record<string, Verdict>) {
    setVerdicts((previous) => ({ ...previous, ...found }));
    setCorrect((previous) => ({ ...previous, ...Object.fromEntries(Object.entries(found).map(([id, verdict]) => [id, verdict.correct])) }));
  }
  // Saved answers come back without explanations, and older saves without verdicts: one request fetches both.
  useEffect(() => {
    if (!restored || rechecked.current) return;
    rechecked.current = true;
    const submitted = Object.fromEntries(questions.filter((item) => isObjective(item) && checked[item.question_id] && answers[item.question_id]?.trim()).map((item) => [item.question_id, answers[item.question_id]]));
    if (!Object.keys(submitted).length) return;
    void callLesson<{ verdicts: Record<string, Verdict> }>({ action: "check", answers: submitted }).then((result) => storeVerdicts(result.verdicts)).catch((error: unknown) => setRequestError(error instanceof Error ? error.message : "Không tải được lời giải."));
  });

  // Finishing a lesson with every answer right earns one confetti burst.
  useEffect(() => {
    if (step !== "review" || !mastered || celebrated.current) return;
    celebrated.current = true;
    window.setTimeout(() => celebrate(document.querySelector(".b2-finish-sticker"), { label: "Hoàn thành bài!", pieces: 44 }), 250);
  }, [step, mastered]);

  // Number keys pick an option and Enter checks or moves on, as in a quiz app.
  useEffect(() => {
    if (step !== "practice") return;
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [step]);

  function goStep(next: Book2Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startPractice() {
    if (testMode) { goStep("practice"); return; }
    const first = questions.findIndex((item) => !resolved(item));
    setPosition(first >= 0 ? first : 0);
    goStep("practice");
  }
  function moveTo(index: number) {
    setCoachNote(""); setCoachTips(false);
    if (index >= questions.length) { goStep("review"); return; }
    setPosition(Math.max(0, index));
    setTimer(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function forget(item: Book2Item) {
    setCorrect((previous) => { const next = { ...previous }; delete next[item.question_id]; return next; });
    setVerdicts((previous) => { const next = { ...previous }; delete next[item.question_id]; return next; });
  }
  function answer(item: Book2Item, value: string) {
    setAnswers((previous) => ({ ...previous, [item.question_id]: value }));
    setChecked((previous) => ({ ...previous, [item.question_id]: false }));
    forget(item);
    if (!isObjective(item)) {
      setRatings((previous) => { const next = { ...previous }; delete next[item.question_id]; return next; });
      setRevealed((previous) => { const next = { ...previous }; delete next[item.question_id]; return next; });
    }
  }
  async function check(item: Book2Item) {
    const value = answers[item.question_id] ?? "";
    if (!value.trim() || pending) return;
    setPending(item.question_id); setRequestError("");
    try {
      const result = await callLesson<{ verdicts: Record<string, Verdict> }>({ action: "check", answers: { [item.question_id]: value } });
      const verdict = result.verdicts[item.question_id];
      if (!verdict) throw new Error("Máy chủ chưa chấm được câu này.");
      storeVerdicts(result.verdicts);
      setChecked((previous) => ({ ...previous, [item.question_id]: true }));
      setStreak((count) => verdict.correct ? count + 1 : 0);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Không chấm được câu này. Thử lại sau.");
    } finally { setPending(""); }
  }
  function retry(item: Book2Item) {
    setChecked((previous) => ({ ...previous, [item.question_id]: false }));
    setAnswers((previous) => ({ ...previous, [item.question_id]: "" }));
    forget(item);
  }
  /** The model of an open question comes from the server once the response is long enough. */
  async function revealModel(item: Book2Item) {
    if (pending) return;
    setPending(item.question_id); setRequestError("");
    try {
      const model = await callLesson<Model>({ action: "model", question_id: item.question_id, response: answers[item.question_id] ?? "", recorded: Boolean(recordings[item.question_id]) });
      setModels((previous) => ({ ...previous, [item.question_id]: model }));
      setRevealed((previous) => ({ ...previous, [item.question_id]: true }));
      window.setTimeout(() => document.querySelector(".b2-model")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Không tải được bài mẫu.");
    } finally { setPending(""); }
  }
  const canShowTranscript = (audioId: string) => questions.some((item) => item.audio_id === audioId && checked[item.question_id] && Boolean(answers[item.question_id]?.trim()));
  async function loadTranscript(audioId: string) {
    const tried = Object.fromEntries(questions.filter((item) => item.audio_id === audioId && answers[item.question_id]?.trim()).map((item) => [item.question_id, answers[item.question_id]]));
    try {
      const result = await callLesson<{ transcript: string }>({ action: "transcript", audio_id: audioId, answers: tried });
      setTranscripts((previous) => ({ ...previous, [audioId]: result.transcript }));
    } catch (error) { setRequestError(error instanceof Error ? error.message : "Không tải được transcript."); }
  }
  function rate(item: Book2Item, value: number) {
    const response = answers[item.question_id] ?? "";
    const minimum = requiredBook2WritingWords(item.item_type, item.prompt_en, lesson.slug);
    if ((!response.trim() && !recordings[item.question_id]) || (minimum > 0 && wordsIn(response) < minimum)) return;
    setRatings((previous) => ({ ...previous, [item.question_id]: value }));
    setChecked((previous) => ({ ...previous, [item.question_id]: true }));
  }
  /** Answer sheet: grades every filled-in objective answer in one request. Blank answers stay open. */
  async function submitAll(evenIfBlank: boolean) {
    const waiting = questions.filter((item) => isObjective(item) && !checked[item.question_id]);
    const filled = waiting.filter((item) => answers[item.question_id]?.trim());
    if (filled.length < waiting.length && !evenIfBlank) { setBlankWarning(waiting.length - filled.length); return; }
    setBlankWarning(0);
    if (!filled.length || pending) return;
    setPending("sheet"); setRequestError("");
    try {
      const result = await callLesson<{ verdicts: Record<string, Verdict> }>({ action: "check", answers: Object.fromEntries(filled.map((item) => [item.question_id, answers[item.question_id]])) });
      storeVerdicts(result.verdicts);
      setChecked((previous) => ({ ...previous, ...Object.fromEntries(Object.keys(result.verdicts).map((id) => [id, true])) }));
      window.setTimeout(() => document.getElementById("b2-test-summary")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Không chấm được bài. Thử lại sau.");
    } finally { setPending(""); }
  }
  function retryWrong() {
    const wrong = questions.filter((item) => isObjective(item) && checked[item.question_id] && !correct[item.question_id]);
    wrong.forEach(retry);
    if (wrong[0]) window.setTimeout(() => document.getElementById("question-" + wrong[0].question_id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }
  function jumpTo(item: Book2Item, showSource = false) {
    const index = questions.findIndex((question) => question.question_id === item.question_id);
    setPosition(Math.max(index, 0)); setStep("practice");
    if (testMode) window.setTimeout(() => document.getElementById("question-" + item.question_id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    else window.scrollTo({ top: 0, behavior: "smooth" });
    if (showSource) window.setTimeout(() => jumpToSource(item), 100);
  }
  function jumpToSource(item: Book2Item) {
    const source = sourceFor(item);
    if (!source) return;
    setSourcesOpen(true);
    if (content.audios.some((audio) => audio.id === source && audio.has_transcript) && !transcripts[source] && canShowTranscript(source)) void loadTranscript(source);
    // Wait a frame so a folded phone panel has opened before scrolling inside it.
    window.setTimeout(() => {
      const transcript = document.getElementById(`transcript-${source}`) as HTMLDetailsElement | null;
      if (transcript) transcript.open = true;
      // Evidence such as "R-B" names only the passage; the explanation then says which paragraph ("Đoạn C").
      const verdict = verdicts[item.question_id];
      const paragraph = (verdict?.evidence?.match(/(?:paragraph\s+|\[)([A-Z])\]?/i)?.[1] ?? verdict?.explanation_vi?.match(/Đoạn ([A-H])\b/)?.[1])?.toUpperCase();
      const target = paragraph ? document.getElementById(`source-${source}-paragraph-${paragraph}`) : null;
      const element = target ?? transcript ?? document.getElementById("source-" + source);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.animate([{ backgroundColor: "#fff0a8" }, { backgroundColor: "transparent" }], { duration: 2400 });
    }, 60);
  }
  async function toggleRecording(item: Book2Item) {
    if (recordingId === item.question_id) {
      recorder.current?.stop(); setRecordingId("");
      stream.current?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (recordingId) {
      recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      setRecordingId("");
    }
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = microphone;
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(microphone);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: next.mimeType }));
        recordingUrls.current.push(url);
        setRecordings((previous) => ({ ...previous, [item.question_id]: url }));
      };
      recorder.current = next; next.start(); setRecordingId(item.question_id); setRecordError("");
    } catch {
      setRecordError("Không mở được micro. Bạn có thể ghi ý chính bằng chữ để tiếp tục.");
      setRecordingId("");
    }
  }

  const value = current ? answers[current.question_id] ?? "" : "";
  const openAnswer = current ? !isObjective(current) : false;
  const graded = Boolean(current && checked[current.question_id] && !openAnswer);
  const right = Boolean(current && correct[current.question_id]);
  const verdict = current ? verdicts[current.question_id] : undefined;
  const model = current ? models[current.question_id] : undefined;
  const choices = current && Array.isArray(current.options) ? book2OptionOrder(current.question_id, current.item_type, current.options) : [];
  const minimum = current ? requiredBook2WritingWords(current.item_type, current.prompt_en, lesson.slug) : 0;
  const wordCount = wordsIn(value);
  const canReveal = Boolean(current && (value.trim() || recordings[current.question_id]) && (!minimum || wordCount >= minimum));
  const modelVisible = Boolean(current && openAnswer && model && (revealed[current.question_id] || checked[current.question_id]));
  const rated = Boolean(current && (ratings[current.question_id] ?? 0) > 0);

  // Coach: the package script decides the phase for guided Writing/Speaking; other lessons react to the question.
  const scripted = content.coach?.phases?.length ? content.coach : null;
  // Writing and Speaking scripts follow the task's own phases; other scripts (intro, before_question, wrong_answer, review) follow the moment.
  const taskScript = content.coach?.mode === "writing" || content.coach?.mode === "speaking";
  const scriptPhase = !scripted || !taskScript ? undefined : content.coach?.mode === "speaking"
    ? modelVisible ? "reflect" : current && (recordingId === current.question_id || (timer?.id === current.question_id && timer.phase === "speak")) ? "record" : timer?.id === current?.question_id && timer?.phase === "prepare" ? "plan" : "welcome"
    : modelVisible ? "review" : value.trim() ? "draft" : "plan";
  const coachPractice = coachLines({ script: scripted, moment: graded && !right ? "wrong" : "before", scriptPhase, skill: lesson.skill, itemType: current?.item_type, options: current?.options });
  const coachIntro = coachLines({ script: scripted, moment: "intro", scriptPhase: taskScript ? "welcome" : undefined, skill: lesson.skill, objective: content.lesson.learning_objectives[0]?.vi });
  const coachReview = coachLines({ script: scripted, moment: "review", scriptPhase: taskScript ? (content.coach?.mode === "speaking" ? "reflect" : "review") : undefined, skill: lesson.skill, reviewTip: content.lesson.mini_review[0]?.vi || content.lesson.mini_review[0]?.en });
  const teaching = content.teaching;
  const fromTeaching = (kind: Parameters<typeof teachingCoach>[1], fallback: string[]) => { const lines = teachingCoach(teaching, kind); return lines.length ? lines : fallback; };
  if (teaching && !taskScript) {
    coachIntro.lines = fromTeaching("help", coachIntro.lines).concat(teachingCoach(teaching, "vocab"));
    coachPractice.lines = graded && !right ? fromTeaching("wrong", coachPractice.lines) : fromTeaching("hint", coachPractice.lines);
    coachReview.lines = mastered ? fromTeaching("praise", coachReview.lines).concat(teachingCoach(teaching, "review")) : fromTeaching("review", coachReview.lines);
  }
  const coachDetail = coachTips && (content.lesson.strategies.length > 0 || content.lesson.mini_review.length > 0) ? <div className="b2-coach-detail">
    {content.lesson.strategies.length > 0 && <><strong>Các bước gợi ý</strong><ol>{content.lesson.strategies.map((item, index) => <li key={index}>{item.vi || item.en}</li>)}</ol></>}
    {content.lesson.mini_review.length > 0 && <><strong>Tự kiểm tra</strong><ul>{content.lesson.mini_review.map((item, index) => <li key={index}>{item.vi || item.en}</li>)}</ul></>}
  </div> : null;
  function coachAction(label: string) {
    setCoachNote("");
    if (/mẫu/i.test(label)) {
      if (!current || !canReveal) { setCoachNote(step === "practice" ? "Viết hoặc nói xong phần của bạn trước, rồi mới xem mẫu để đối chiếu nhé." : "Bài mẫu mở sau khi bạn tự làm ở bước Luyện tập."); return; }
      void revealModel(current);
      return;
    }
    if (/ví dụ|gợi ý|checklist/i.test(label)) { setCoachTips((open) => !open); return; }
    if (/chuẩn bị/i.test(label)) { if (step !== "practice") startPractice(); else if (current) setTimer({ id: current.question_id, phase: "prepare", ...speakingTimes(current.prompt_en) }); return; }
    if (/nói|ghi âm/i.test(label) && current && step === "practice") { setTimer({ id: current.question_id, phase: "speak", ...speakingTimes(current.prompt_en), seconds: speakingTimes(current.prompt_en).speak }); if (recordingId !== current.question_id) void toggleRecording(current); return; }
    if (/làm lại/i.test(label) && current) { answer(current, ""); return; }
    if (/đánh giá/i.test(label)) { document.querySelector(".b2-sheet")?.scrollIntoView({ behavior: "smooth", block: "end" }); return; }
    if (step !== "practice") { startPractice(); return; }
    (document.querySelector(".b2-textarea, .b2-input") as HTMLElement | null)?.focus();
  }

  // The listener reads the latest question and answer through this ref, updated after every render.
  useEffect(() => {
    keyHandler.current = (event: KeyboardEvent) => {
      if (testMode || !current || event.ctrlKey || event.metaKey || event.altKey) return;
      const typing = event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && event.target.type !== "radio");
      if (/^[1-9]$/.test(event.key) && !typing && choices.length && !graded) {
        const option = choices[Number(event.key) - 1];
        if (option) { event.preventDefault(); answer(current, option); }
        return;
      }
      // Enter on a focused option tile checks the answer instead of re-selecting it; other buttons keep their own action.
      const onOption = event.target instanceof HTMLElement && event.target.classList.contains("b2-option");
      if (event.key !== "Enter" || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLButtonElement && !onOption) || event.target instanceof HTMLAnchorElement) return;
      event.preventDefault();
      if (openAnswer) { if (rated) moveTo(position + 1); return; }
      if (graded) moveTo(position + 1); else check(current);
    };
  });

  const topBar = <nav className="b2-topbar" aria-label="Điều hướng bài học">
    <Link href="/app/learn/ielts-builder" className="b2-back"><ArrowLeft size={17} /> Lộ trình</Link>
    <span className="b2-chip"><SkillIcon size={15} /> {theme.label} · {content.unit_id.replace("U", "Unit ")} · Bài {navigation?.index ?? ""}/{navigation?.total ?? ""}</span>
    <span className={`b2-sync is-${syncStatus}`} role="status" title={syncStatus === "saving" ? "Đang lưu bài làm" : syncStatus === "account" ? "Đã lưu vào tài khoản" : "Đã lưu trên thiết bị, chưa đồng bộ tài khoản"}>{syncStatus === "device" ? <CloudOff size={16} /> : <Cloud size={16} />}<span>{syncStatus === "saving" ? "Đang lưu…" : syncStatus === "account" ? "Đã lưu" : "Lưu trên máy"}</span></span>
  </nav>;

  const stepPath = <nav className="b2-steps" aria-label="Các bước tự học">
    {([["learn", "Tìm hiểu", BookOpenText], ["practice", "Luyện tập", Target], ["review", "Ôn lại", Check]] as const).map(([key, label, Icon], index) => {
      const done = key === "learn" ? completedCount > 0 || step !== "learn" : key === "practice" ? completedCount === questions.length && questions.length > 0 : mastered;
      return <button type="button" key={key} className={`${step === key ? "is-active" : ""} ${done ? "is-done" : ""}`} aria-current={step === key ? "step" : undefined} onClick={() => key === "practice" ? startPractice() : goStep(key)}>
        <span className="b2-step-dot">{done && step !== key ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}</span>
        <span>{index + 1}. {label}{key === "practice" && <small>{completedCount}/{questions.length}</small>}</span>
      </button>;
    })}
  </nav>;

  return <AppShell canManage={canManage}><div className={`content-page book2-page b2-skill-${theme.tone}`}>
    {topBar}

    {step !== "practice" && <header className="b2-hero">
      <Sticker name={theme.sticker} size={74} tilt={-8} pop={false} className="b2-hero-sticker" />
      <div className="b2-hero-copy">
        <span className="b2-eyebrow">{theme.label.toUpperCase()} · KHOẢNG {content.lesson.duration_minutes ?? 40} PHÚT · {questions.length} CÂU</span>
        <h1>{lesson.title}</h1>
        <p>{content.teaching?.outcome || content.lesson.learning_objectives[0]?.vi || "Học ngắn, tự làm, xem lý do và sửa lỗi trước khi qua bài."}</p>
      </div>
      <ProgressRing value={questions.length ? completedCount / questions.length : 0} size={76}><b>{questions.length ? Math.round(completedCount / questions.length * 100) : 0}%</b><small>đã làm</small></ProgressRing>
    </header>}
    {step !== "practice" && stepPath}

    {step === "learn" && <main className="b2-learn">
      <Book2Coach collapsed={Boolean(teaching) && !taskScript} lines={coachNote ? [coachNote] : coachIntro.lines} actions={coachIntro.actions} onAction={coachAction} />
      {coachDetail}
      <section className="b2-goal"><div className="b2-bubble"><strong>Sau bài này bạn làm được:</strong><ul>{content.lesson.learning_objectives.map((item, index) => <li key={index}>{item.vi || item.en}{item.vi && item.en && <small>{item.en}</small>}</li>)}</ul>{teaching?.why && <p className="b2-why"><b>Vì sao học bài này:</b> {teaching.why}</p>}</div></section>
      {teaching && <TeachingLearn teaching={teaching} speak={speak} guidedDone={(index) => Boolean(checklist[`g${index}`])} toggleGuided={(index) => setChecklist((previous) => ({ ...previous, [`g${index}`]: !previous[`g${index}`] }))} />}

      {content.lesson.theory.length > 0 && !teaching?.concepts?.length && <section className="b2-block"><h2><span className="b2-block-icon"><BookOpenText size={18} /></span> Kiến thức cốt lõi</h2><div className="b2-cards">{content.lesson.theory.map((item, index) => <article className="b2-card" key={index}><span className="b2-card-number">{index + 1}</span><h3>{item.title}</h3><p>{item.content?.vi || item.content?.en}</p>{item.content?.vi && item.content.en && <details><summary>Đọc giải thích tiếng Anh</summary><p>{item.content.en}</p></details>}{item.example?.en && <blockquote><button type="button" className="b2-say" onClick={() => speak(item.example!.en!)} aria-label="Nghe ví dụ"><Volume2 size={15} /></button><span>{item.example.en}{item.example.vi && <small>{item.example.vi}</small>}</span></blockquote>}</article>)}</div></section>}

      {content.lesson.grammar.length > 0 && <section className="b2-block"><h2><span className="b2-block-icon"><PenLine size={18} /></span> Cấu trúc cần nhớ</h2><div className="b2-formulas">{content.lesson.grammar.map((item, index) => {
        const formula = item.formula || item.form;
        const meaning = item.meaning?.vi || item.explanation?.vi || item.meaning?.en || item.explanation?.en;
        return <article key={index}>{item.title && <small>{item.title}</small>}{formula && <code>{formula}</code>}{meaning && <p>{meaning}</p>}{item.example && <blockquote><button type="button" className="b2-say" onClick={() => speak(item.example!)} aria-label="Nghe ví dụ"><Volume2 size={15} /></button><span>{item.example}</span></blockquote>}</article>;
      })}</div></section>}

      {content.lesson.strategies.length > 0 && !teaching?.tips?.length && <section className="b2-block"><h2><span className="b2-block-icon"><Lightbulb size={18} /></span> Mẹo làm bài</h2><ol className="b2-tips">{content.lesson.strategies.map((item, index) => <li key={index}><strong>{item.topic}</strong><span>{item.vi || item.en}</span></li>)}</ol></section>}

      {content.lesson.common_mistakes.length > 0 && !teaching?.mistakes?.length && <section className="b2-block"><h2><span className="b2-block-icon"><TriangleAlert size={18} /></span> Lỗi thường gặp</h2><div className="b2-mistakes">{content.lesson.common_mistakes.map((item, index) => <article key={index}><p className="b2-wrong"><X size={16} /> {item.wrong}</p><p className="b2-right"><Check size={16} /> {item.correct}</p>{(item.reason?.vi || item.reason?.en) && <small>{item.reason?.vi || item.reason?.en}</small>}</article>)}</div></section>}

      {content.lesson.vocabulary.length > 0 && !teaching?.vocabulary?.length && <section className="b2-block"><h2><span className="b2-block-icon"><Volume2 size={18} /></span> Từ và cụm từ cần dùng <small>{content.lesson.vocabulary.length} thẻ · bấm để lật</small></h2>{vocabularyGroups.map((items, group) => <details className="b2-deck" key={group} open={group === 0}><summary>Bộ thẻ {group + 1} · {items.length} từ <ChevronDown size={18} /></summary><div className="b2-words">{items.map((item, index) => <WordCard key={index} term={item.term} meaning={item.meaning_vi} example={item.example_en} />)}</div></details>)}</section>}

      <Book2SourcePanel content={content} transcripts={transcripts} canShowTranscript={canShowTranscript} onTranscript={(id) => void loadTranscript(id)} />

      <div className="b2-cta-bar"><span><b>{questions.length} câu luyện tập</b> · {testMode ? "làm hết rồi nộp bài một lần" : "làm từng câu, xem giải thích ngay"}</span><button type="button" className="b2-btn b2-btn-primary" onClick={startPractice}>{completedCount ? "Làm tiếp" : "Bắt đầu luyện tập"} <ArrowRight size={18} /></button></div>
    </main>}

    {step === "practice" && testMode && <main className={hasSources ? "book2-practice-layout has-sources" : "book2-practice-layout"}>
      <div className="book2-practice-main">
        <div className="b2-focus-bar">
          <button type="button" className="b2-icon-btn" onClick={() => goStep("learn")} aria-label="Thoát về phần Tìm hiểu"><X size={22} /></button>
          <div className="b2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={completedCount} aria-label={`${completedCount} trên ${questions.length} câu đã chấm`}><i style={{ width: `${questions.length ? completedCount / questions.length * 100 : 0}%` }} /></div>
        </div>
        <Book2Coach compact collapsed={Boolean(teaching) && !taskScript} lines={coachNote ? [coachNote] : coachPractice.lines} actions={coachPractice.actions} onAction={coachAction} />
        <Book2TestSheet groups={content.exercises} answers={answers} checked={checked} correct={correct} verdicts={verdicts} ratings={ratings} models={models} pending={pending === "sheet"} error={requestError} blankWarning={blankWarning}
          onAnswer={(item, value) => { setBlankWarning(0); answer(item as Book2Item, value); }} onSubmit={(evenIfBlank) => void submitAll(evenIfBlank)} onRetryWrong={retryWrong} onFinish={() => goStep("review")}
          onSource={(item) => jumpToSource(item as Book2Item)} onReveal={(item) => void revealModel(item as Book2Item)} onRate={(item, value) => rate(item as Book2Item, value)} />
      </div>
      <aside className={`book2-source-dock ${sourcesOpen ? "is-open" : ""}`}><button type="button" className="book2-source-toggle" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>{sourcesOpen ? "Thu gọn tư liệu" : `Mở ${content.passages.length ? "bài đọc" : content.audios.length ? "bài nghe" : "số liệu"} để làm bài`}<ChevronDown size={18} /></button><Book2SourcePanel content={content} practice transcripts={transcripts} canShowTranscript={canShowTranscript} onTranscript={(id) => void loadTranscript(id)} /></aside>
    </main>}

    {step === "practice" && !testMode && current && <main className={hasSources ? "book2-practice-layout has-sources" : "book2-practice-layout"}>
      <div className="book2-practice-main b2-focus">
        <div className="b2-focus-bar">
          <button type="button" className="b2-icon-btn" onClick={() => goStep("learn")} aria-label="Thoát về phần Tìm hiểu"><X size={22} /></button>
          <div className="b2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={completedCount} aria-label={`${completedCount} trên ${questions.length} câu đã làm`}><i style={{ width: `${questions.length ? completedCount / questions.length * 100 : 0}%` }} /></div>
          <span className={`b2-streak ${streak >= 2 ? "is-hot" : ""}`} title="Chuỗi câu đúng liên tiếp"><Flame size={18} /> {streak}</span>
        </div>
        <div className="b2-dots" aria-label="Chọn câu">{questions.map((item, index) => {
          const state = !resolved(item) ? "" : isObjective(item) ? correct[item.question_id] ? "is-right" : "is-wrong" : (ratings[item.question_id] ?? 0) >= 3 ? "is-right" : "is-wrong";
          return <button type="button" key={item.question_id} className={`${state} ${index === position ? "is-current" : ""}`} onClick={() => moveTo(index)} aria-label={`Câu ${index + 1}`} aria-current={index === position ? "step" : undefined} />;
        })}</div>

        <Book2Coach compact collapsed={Boolean(teaching) && !taskScript && !(graded && !right)} tone={graded && !right ? "is-wrong" : ""} lines={coachNote ? [coachNote] : coachPractice.lines} actions={coachPractice.actions} onAction={coachAction} key={`coach-${current.question_id}-${graded}-${scriptPhase ?? ""}`} />
        {coachDetail}
        <article className={`b2-question ${graded ? right ? "is-right" : "is-wrong" : ""}`} key={current.question_id} id={"question-" + current.question_id}>
          <header className="b2-question-meta"><span>CÂU {position + 1}/{questions.length}</span>{currentGroup && <span>Phần {currentGroupIndex + 1}/{groups.length} · {currentGroup.title}</span>}</header>
          {currentGroup?.instruction && <p className="b2-instruction">{currentGroup.instruction.vi || currentGroup.instruction.en}</p>}
          <h2 className="b2-prompt">{current.prompt_en}</h2>
          {current.prompt_vi && current.prompt_vi !== current.prompt_en && <p className="b2-prompt-vi">{current.prompt_vi}</p>}
          {stressWord(current.prompt_en) && <button type="button" className="b2-pill" onClick={() => speak(stressWord(current.prompt_en)!)}><Volume2 size={15} /> Nghe từ “{stressWord(current.prompt_en)}”</button>}

          {choices.length > 0 ? <div className={`b2-options ${choices.length <= 3 && choices.every((option) => option.length < 18) ? "is-compact" : ""}`} role="radiogroup">{choices.map((option, index) => {
            const isKey = graded && (verdict?.accepted ?? []).includes(option);
            const wrongPick = graded && value === option && !right;
            return <button type="button" role="radio" aria-checked={value === option} key={option} disabled={graded} className={`b2-option ${value === option ? "is-selected" : ""} ${isKey ? "is-key" : ""} ${wrongPick ? "is-miss" : ""}`} onClick={() => answer(current, option)}>
              <kbd>{index + 1}</kbd><span>{option}</span>{isKey && <Check size={20} strokeWidth={3} aria-label="Đáp án đúng" />}{wrongPick && <X size={20} strokeWidth={3} aria-label="Lựa chọn chưa đúng" />}
            </button>;
          })}</div>
            : openAnswer ? <>
              <textarea className="b2-textarea" value={value} onChange={(event) => answer(current, event.target.value)} rows={current.item_type === "open_writing" ? 10 : 4} maxLength={12000} placeholder={current.item_type === "open_speaking" ? "Nói trước, rồi ghi lại ý chính hoặc câu trả lời của bạn…" : "Viết câu trả lời của bạn…"} />
              <div className="b2-wordcount"><span>{wordCount} từ</span>{minimum > 0 && <><span className={`b2-meter ${wordCount >= minimum ? "is-full" : ""}`}><i style={{ width: `${Math.min(100, wordCount / minimum * 100)}%` }} /></span><span>{wordCount >= minimum ? "Đủ độ dài" : `Cần tối thiểu ${minimum} từ`}</span></>}</div>
              {current.item_type === "open_speaking" && <div className="b2-speak-tools">
                <button type="button" className="b2-pill" onClick={() => setTimer({ id: current.question_id, phase: "prepare", ...speakingTimes((currentGroup?.title ?? "") + " " + current.prompt_en) })}>Bắt đầu chuẩn bị</button>
                {timer?.id === current.question_id && <span className={`b2-timer is-${timer.phase}`} role="timer">{timer.phase === "prepare" ? "Chuẩn bị" : "Nói"} · {timer.seconds}s</span>}
                <button type="button" className={`b2-pill ${recordingId === current.question_id ? "is-recording" : ""}`} onClick={() => void toggleRecording(current)}><Mic size={15} /> {recordingId === current.question_id ? "Dừng ghi âm" : "Ghi âm câu này"}</button>
                {recordings[current.question_id] && <><audio controls src={recordings[current.question_id]} /><a href={recordings[current.question_id]} download={current.question_id + ".webm"}>Tải bản ghi</a></>}
                {recordError && <p role="alert" className="b2-alert">{recordError}</p>}
              </div>}
            </>
              : <input className={`b2-input ${graded ? right ? "is-right" : "is-wrong" : ""}`} value={value} readOnly={graded} aria-invalid={graded && !right} onChange={(event) => answer(current, event.target.value)} placeholder="Gõ câu trả lời rồi nhấn Enter" autoFocus />}

          {modelVisible && <div className="b2-model"><strong>Bài mẫu để đối chiếu</strong><p>{model?.model_en}</p>{current.item_type === "open_speaking" && model?.model_en && <button type="button" className="b2-pill" onClick={() => speak(model.model_en)}><Volume2 size={15} /> Nghe câu mẫu (giọng máy)</button>}{model?.model_vi && <p className="b2-prompt-vi">{model.model_vi}</p>}{model?.explanation_vi && <p className="b2-model-note">{model.explanation_vi}</p>}</div>}
          {requestError && <p role="alert" className="b2-alert">{requestError}</p>}
        </article>

        {/* The answer sheet: one main action, then green or orange feedback that carries the explanation. */}
        <div className={`b2-sheet ${graded ? right ? "is-right" : "is-wrong" : modelVisible ? "is-review" : ""}`} aria-live="polite">
          {graded ? <>
            <div className="b2-sheet-head"><span className="b2-sheet-icon">{right ? <Check size={24} strokeWidth={3} /> : <X size={24} strokeWidth={3} />}</span><div><strong>{right ? praise[position % praise.length] : "Chưa đúng"}</strong>{right && streak >= 3 && <span className="b2-sheet-streak"><Flame size={15} /> {streak} câu đúng liên tiếp</span>}{!right && <span>Đáp án: <b>{verdict ? verdict.accepted.join(" / ") : "đang tải…"}</b></span>}</div></div>
            {verdict?.explanation_vi && <p className="b2-sheet-why">{verdict.explanation_vi}</p>}
            {verdict?.evidence && <small className="b2-sheet-evidence">Bằng chứng: {verdict.evidence}</small>}
            <div className="b2-sheet-actions">
              {sourceFor(current) && <button type="button" className="b2-btn b2-btn-ghost" onClick={() => jumpToSource(current)}>Xem tư liệu</button>}
              {!right && <button type="button" className="b2-btn b2-btn-ghost" onClick={() => retry(current)}><RotateCcw size={16} /> Làm lại</button>}
              <button type="button" className={`b2-btn ${right ? "b2-btn-success" : "b2-btn-danger"}`} onClick={() => moveTo(position + 1)}>{position + 1 < questions.length ? "Tiếp tục" : "Xem kết quả"} <ArrowRight size={18} /></button>
            </div>
          </> : openAnswer ? modelVisible ? <>
            <div className="b2-sheet-head"><span className="b2-sheet-icon"><Target size={22} /></span><div><strong>Tự đánh giá câu trả lời</strong><span>{lesson.skill === "Writing" ? "Đúng yêu cầu, có bố cục, từ vựng và ngữ pháp phù hợp?" : "Đủ ý, mạch lạc, dùng từ và phát âm rõ?"}</span></div></div>
            <div className="b2-rating">{[["1", "Chưa đạt"], ["2", "Cần sửa"], ["3", "Đạt"], ["4", "Vững"]].map(([number, label]) => <button type="button" key={number} className={ratings[current.question_id] === Number(number) ? "is-active" : ""} aria-pressed={ratings[current.question_id] === Number(number)} onClick={() => rate(current, Number(number))}><b>{number}</b>{label}</button>)}</div>
            <div className="b2-sheet-actions"><button type="button" className="b2-btn b2-btn-primary" disabled={!rated} onClick={() => moveTo(position + 1)}>{position + 1 < questions.length ? "Tiếp tục" : "Xem kết quả"} <ArrowRight size={18} /></button></div>
          </> : <div className="b2-sheet-actions">
            <button type="button" className="b2-btn b2-btn-ghost" onClick={() => moveTo(position + 1)}><SkipForward size={16} /> Để sau</button>
            <button type="button" className="b2-btn b2-btn-primary" disabled={!canReveal || pending === current.question_id} onClick={() => void revealModel(current)}>{pending === current.question_id ? "Đang mở…" : "Xem bài mẫu"}</button>
          </div> : <div className="b2-sheet-actions">
            <button type="button" className="b2-btn b2-btn-ghost" onClick={() => moveTo(position + 1)}><SkipForward size={16} /> Để sau</button>
            <button type="button" className="b2-btn b2-btn-primary" disabled={!value.trim()} onClick={() => check(current)}>Kiểm tra</button>
          </div>}
        </div>
      </div>
      <aside className={`book2-source-dock ${sourcesOpen ? "is-open" : ""}`}><button type="button" className="book2-source-toggle" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>{sourcesOpen ? "Thu gọn tư liệu" : `Mở ${content.passages.length ? "bài đọc" : content.audios.length ? "bài nghe" : "số liệu"} để làm bài`}<ChevronDown size={18} /></button><Book2SourcePanel content={content} practice transcripts={transcripts} canShowTranscript={canShowTranscript} onTranscript={(id) => void loadTranscript(id)} /></aside>
    </main>}

    {step === "review" && <main className="b2-finish">
      <section className="b2-finish-card" style={{ "--score": `${accuracy}%` } as CSSProperties}>
        <Sticker name={mastered ? "star" : completedCount === questions.length ? "target" : "bulb"} size={96} tilt={-8} className="b2-finish-sticker" />
        <h2>{mastered ? "Hoàn thành bài!" : completedCount === questions.length ? "Gần xong rồi!" : "Bạn đã đi được một chặng"}</h2>
        <p>{mastered ? "Mọi câu đã đạt. Kiến thức này sẽ theo bạn sang bài sau." : problems.length ? `Còn ${problems.length} câu cần làm tiếp hoặc sửa. Sửa ngay lúc còn nhớ là cách nhớ lâu nhất.` : "Hãy xem lại các câu bên dưới."}</p>
        <div className="b2-stats">
          {objective.length > 0 && <div className="b2-stat is-accuracy"><span>Độ chính xác</span><strong>{accuracy}%</strong></div>}
          {objective.length > 0 && <div className="b2-stat is-correct"><span>Câu đúng</span><strong>{objectiveCorrect.length}/{objective.length}</strong></div>}
          {open.length > 0 && <div className="b2-stat is-open"><span>Câu tự đánh giá</span><strong>{openReviewed.length}/{open.length}</strong></div>}
          <div className="b2-stat is-todo"><span>Cần làm tiếp</span><strong>{problems.length}</strong></div>
        </div>
        <div className="b2-finish-actions">
          {!mastered && problems[0] && <button type="button" className="b2-btn b2-btn-primary" onClick={() => jumpTo(problems[0])}><RotateCcw size={18} /> {problems.some((item) => !checked[item.question_id]) ? `Làm tiếp ${problems.length} câu` : `Sửa ${problems.length} câu`}</button>}
          {navigation?.next ? <Link className={`b2-btn ${mastered ? "b2-btn-primary" : "b2-btn-ghost"}`} href={"/app/lesson/" + navigation.next.slug}>Bài tiếp theo <ArrowRight size={18} /></Link> : <Link className="b2-btn b2-btn-ghost" href="/app/learn/ielts-builder">Về lộ trình <ArrowRight size={18} /></Link>}
        </div>
      </section>

      <Book2Coach collapsed={Boolean(teaching) && !taskScript} lines={coachReview.lines} actions={coachReview.actions.filter((label) => !/mẫu/i.test(label))} onAction={coachAction} />
      {problems.length > 0 && <section className="b2-block"><h2><span className="b2-block-icon"><RotateCcw size={18} /></span> Câu cần làm tiếp hoặc sửa</h2><div className="b2-fix-list">{problems.map((item) => <div className="b2-fix" key={item.question_id}><button type="button" onClick={() => jumpTo(item)}><span className={!checked[item.question_id] ? "is-todo" : "is-wrong"}>{!checked[item.question_id] ? "Chưa làm" : "Cần sửa"}</span><strong>{item.prompt_vi || item.prompt_en}</strong><ArrowRight size={16} /></button>{sourceFor(item) && <button type="button" className="b2-fix-source" onClick={() => jumpTo(item, true)}>{verdicts[item.question_id]?.evidence ? "Xem bằng chứng" : "Xem tư liệu"}</button>}</div>)}</div></section>}

      {teaching?.review_days?.length ? <p className="b2-callout is-info"><RotateCcw size={18} /> <span><b>Lịch ôn gợi ý:</b> quay lại bài này sau {teaching.review_days.join(", ")} ngày để nhớ lâu.</span></p> : null}
      {teaching?.self_check?.length ? <section className="b2-block"><h2><span className="b2-block-icon"><Target size={18} /></span> Tự chấm theo tiêu chí</h2><ul className="b2-criteria">{teaching.self_check.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      {content.lesson.mini_review.length > 0 && <section className="b2-block"><h2><span className="b2-block-icon"><Check size={18} /></span> Tự kiểm tra trước khi qua bài</h2><ul className="b2-checklist">{content.lesson.mini_review.map((item, index) => <li key={index}><label><input type="checkbox" checked={Boolean(checklist[String(index)])} onChange={(event) => setChecklist((previous) => ({ ...previous, [index]: event.target.checked }))} /> <span>{item.vi || item.en}</span></label></li>)}</ul></section>}

      {open.length > 0 && <section className="b2-block"><h2><span className="b2-block-icon"><Target size={18} /></span> Tiêu chí tự đánh giá bài {lesson.skill === "Writing" ? "viết" : "nói"}</h2><ul className="b2-criteria">{(lesson.skill === "Writing" ? ["Trả lời đúng đề: đủ ý chính và số liệu hoặc lập luận liên quan.", "Mạch lạc: có mở, thân, kết và liên kết ý rõ.", "Từ vựng: dùng từ chính xác, tránh lặp nguyên mẫu.", "Ngữ pháp: câu đúng, có cấu trúc đa dạng và dễ hiểu."] : ["Trôi chảy và mạch lạc: ý nối rõ, ít dừng quá lâu.", "Từ vựng: từ phù hợp chủ đề, không lặp quá nhiều.", "Ngữ pháp: câu đủ rõ và có cấu trúc đa dạng.", "Phát âm: người nghe hiểu được trọng âm và âm cuối."]).map((text) => <li key={text}>{text}</li>)}</ul><p className="b2-muted">Mức 1–4 chỉ để tự theo dõi, không quy đổi thành band IELTS.</p></section>}

      <div className="b2-finish-nav">{navigation?.previous && <Link className="b2-btn b2-btn-ghost" href={"/app/lesson/" + navigation.previous.slug}><ArrowLeft size={16} /> Bài trước</Link>}<button type="button" className="b2-btn b2-btn-ghost" onClick={startPractice}>Luyện lại bài này</button></div>
    </main>}
  </div></AppShell>;
}
