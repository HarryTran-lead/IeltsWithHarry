"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { savePracticeSnapshot } from "./practice-results";
import { loadBook2State, saveBook2State, type Book2Step } from "./book2-lesson-state";
import { Book2SourcePanel } from "./book2-source-panel";
import "./book2-lesson.css";

type Bilingual = { en?: string; vi?: string };
type Book2Item = {
  question_id: string; item_type: string; prompt_en: string; prompt_vi?: string;
  options?: string[]; answer: { kind: string; accepted?: string[]; model_en?: string; model_vi?: string };
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
export type Book2Content = {
  type: "book2"; book_id: "BOOK_2"; source_id: string; unit_id: string;
  lesson: {
    title: string; duration_minutes?: number; learning_objectives: Bilingual[];
    theory: { title: string; content?: Bilingual; example?: Bilingual }[];
    vocabulary: { term?: string; meaning_vi?: string; example_en?: string }[];
    grammar: { formula?: string; meaning?: Bilingual }[];
    strategies: { topic?: string; en?: string; vi?: string }[];
    common_mistakes: { wrong?: string; correct?: string; reason?: Bilingual }[];
    mini_review: Bilingual[];
    rubric?: { criteria?: string[]; self_rating_scale?: string } | null;
  };
  passages: { id: string; title?: string; text: string }[];
  audios: { id: string; title?: string; transcript?: string; audio_url?: string }[];
  visuals: { id: string; title?: string; headers?: string[]; rows?: (string | number)[][]; image_url?: string }[];
  exercises: Exercise[];
};
type Nav = { previous: { slug: string; title: string } | null; next: { slug: string; title: string } | null; index: number; total: number } | null;

const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[.,!?]+$/g, "").replace(/\s+/g, " ");
const wordsIn = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
const isObjective = (item: Book2Item) => item.answer.kind === "objective";
const isCorrect = (item: Book2Item, value: string) => (item.answer.accepted ?? []).some((key) => normalize(key) === normalize(value));
function requiredWords(item: Book2Item) {
  if (item.item_type !== "open_writing") return 0;
  if (/\b250\b/.test(item.prompt_en)) return 250;
  if (/\b150\b/.test(item.prompt_en)) return 150;
  return 0;
}
function sourceFor(item: Book2Item) { return item.passage_id || item.audio_id || item.data_id; }

export function Book2LessonPage({ lesson, content, navigation, canManage }: {
  lesson: { slug: string; title: string; skill: string }; content: Book2Content; navigation: Nav; canManage: boolean;
}) {
  const questions = useMemo(() => content.exercises.flatMap((exercise) => exercise.questions), [content.exercises]);
  const groups = useMemo(() => makePracticeGroups(content.exercises), [content.exercises]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<Book2Step>("learn");
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [restored, setRestored] = useState(false);
  const [recordings, setRecordings] = useState<Record<string, string>>({});
  const [recordingId, setRecordingId] = useState("");
  const [timer, setTimer] = useState<{ id: string; phase: "prepare" | "speak"; seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingUrls = useRef<string[]>([]);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const didRestorePosition = useRef(false);
  const [recordError, setRecordError] = useState("");
  const [syncStatus, setSyncStatus] = useState<"saving" | "account" | "device">("saving");

  useEffect(() => {
    let active = true;
    void loadBook2State(lesson.slug).then((saved) => {
      if (!active) return;
      setAnswers(saved.answers); setChecked(saved.checked); setRatings(saved.ratings);
      setChecklist(saved.checklist); setStep(saved.step);
      setExerciseIndex(Math.min(Math.max(saved.exerciseIndex, 0), groups.length - 1));
      setRestored(true);
    }).catch(() => setRestored(true));
    return () => { active = false; };
  }, [lesson.slug, groups.length]);

  useEffect(() => {
    if (!restored || step !== "practice" || didRestorePosition.current) return;
    didRestorePosition.current = true;
    const pending = groups[exerciseIndex]?.questions.find((item) => !checked[item.question_id]
      || (isObjective(item) ? !isCorrect(item, answers[item.question_id] ?? "") : (ratings[item.question_id] ?? 0) < 3));
    if (pending) window.setTimeout(() => document.getElementById("question-" + pending.question_id)?.scrollIntoView({ block: "center" }), 120);
  }, [restored, step, groups, exerciseIndex, checked, answers, ratings]);

  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    recordingUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!timer) return;
    const interval = window.setInterval(() => setTimer((current) => {
      if (!current) return null;
      if (current.seconds > 1) return { ...current, seconds: current.seconds - 1 };
      return current.phase === "prepare" ? { id: current.id, phase: "speak", seconds: 120 } : null;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const objective = questions.filter(isObjective);
  const open = questions.filter((item) => !isObjective(item));
  const objectiveChecked = objective.filter((item) => checked[item.question_id]);
  const objectiveCorrect = objectiveChecked.filter((item) => isCorrect(item, answers[item.question_id] ?? ""));
  const openReviewed = open.filter((item) => (ratings[item.question_id] ?? 0) > 0);
  const openReady = open.filter((item) => (ratings[item.question_id] ?? 0) >= 3);
  const completedCount = objectiveChecked.length + openReviewed.length;
  const mastered = completedCount === questions.length
    && objectiveCorrect.length === objective.length
    && openReady.length === open.length;
  const needsReview = objectiveChecked.some((item) => !isCorrect(item, answers[item.question_id] ?? ""))
    || openReviewed.some((item) => (ratings[item.question_id] ?? 0) < 3);
  const problems = questions.filter((item) => !checked[item.question_id]
    || (isObjective(item) ? !isCorrect(item, answers[item.question_id] ?? "") : (ratings[item.question_id] ?? 0) < 3));
  const currentExercise = groups[exerciseIndex];
  const vocabularyGroups = Array.from({ length: Math.ceil(content.lesson.vocabulary.length / 7) }, (_, index) => content.lesson.vocabulary.slice(index * 7, (index + 1) * 7));
  const hasSources = content.passages.length + content.audios.length + content.visuals.length > 0;

  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      setSyncStatus("saving");
      const updatedAt = Date.now();
      const state = {
        book2: 1, answers, checked, ratings, checklist, step, exerciseIndex,
        mastered, needsReview, updatedAt,
      } as const;
      const snapshot = {
        correct: objectiveCorrect.length + openReady.length,
        checked: completedCount, total: questions.length, mastered, needsReview,
      };
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        const synced = await saveBook2State(lesson.slug, state);
        await savePracticeSnapshot(lesson.slug, snapshot);
        setSyncStatus(synced ? "account" : "device");
      }).catch(() => setSyncStatus("device"));
    }, 700);
    return () => window.clearTimeout(id);
  }, [lesson.slug, answers, checked, ratings, checklist, step, exerciseIndex, mastered, needsReview, restored, objectiveCorrect.length, openReady.length, completedCount, questions.length]);

  function goStep(next: Book2Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function answer(item: Book2Item, value: string) {
    setAnswers((previous) => ({ ...previous, [item.question_id]: value }));
    setChecked((previous) => ({ ...previous, [item.question_id]: false }));
    if (!isObjective(item)) setRatings((previous) => { const next = { ...previous }; delete next[item.question_id]; return next; });
  }
  function check(item: Book2Item) {
    if (!answers[item.question_id]?.trim()) return;
    setChecked((previous) => ({ ...previous, [item.question_id]: true }));
  }
  function rate(item: Book2Item, value: number) {
    setRatings((previous) => ({ ...previous, [item.question_id]: value }));
    setChecked((previous) => ({ ...previous, [item.question_id]: true }));
  }
  function jumpTo(item: Book2Item) {
    const index = groups.findIndex((group) => group.questions.some((question) => question.question_id === item.question_id));
    setExerciseIndex(Math.max(index, 0)); setStep("practice");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => document.getElementById("question-" + item.question_id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
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

  return <AppShell canManage={canManage}><div className="content-page book2-page">
    <nav className="book2-route"><Link href="/app/learn/ielts-builder"><ArrowLeft size={16} /> Lộ trình 5.0–6.0</Link><span>{content.unit_id} · Bài {navigation?.index ?? ""}/{navigation?.total ?? ""}</span></nav>
    <header className="book2-hero"><div><span className="eyebrow">{lesson.skill.toUpperCase()} · {content.lesson.duration_minutes ?? 40} PHÚT DỰ KIẾN</span><h1>{lesson.title}</h1><p>Học ngắn, tự làm, xem lý do và sửa lỗi trước khi qua bài.</p></div><div className="book2-hero-score"><strong>{objective.length ? objectiveCorrect.length + "/" + objective.length : openReviewed.length + "/" + open.length}</strong><span>{objective.length ? "câu đúng" : "câu đã tự đánh giá"}</span>{open.length > 0 && objective.length > 0 && <small>{openReviewed.length}/{open.length} câu mở đã tự đánh giá</small>}</div></header>
    <p className="book2-save-status" role="status">{syncStatus === "saving" ? "Đang lưu bài làm…" : syncStatus === "account" ? "Bài làm đã lưu vào tài khoản" : "Bài làm đã lưu trên thiết bị; chưa đồng bộ tài khoản"}</p>
    <nav className="book2-steps" aria-label="Các bước tự học">
      <button type="button" className={step === "learn" ? "active" : ""} onClick={() => goStep("learn")}>1. Tìm hiểu</button>
      <button type="button" className={step === "practice" ? "active" : ""} onClick={() => goStep("practice")}>2. Luyện tập <span>{completedCount}/{questions.length}</span></button>
      <button type="button" className={step === "review" ? "active" : ""} onClick={() => goStep("review")}>3. Ôn lại</button>
    </nav>

    {step === "learn" && <main className="book2-stack">
      <section className="book2-card"><h2><Target size={20} /> Sau bài này bạn làm được gì?</h2><ul>{content.lesson.learning_objectives.map((item, index) => <li key={index}>{item.vi || item.en}{item.vi && item.en && <small>{item.en}</small>}</li>)}</ul></section>
      {content.lesson.theory.length > 0 && <section className="book2-card"><h2>Kiến thức cốt lõi</h2><div className="book2-theory">{content.lesson.theory.map((item, index) => <article key={index}><h3>{item.title}</h3><p>{item.content?.vi || item.content?.en}</p>{item.content?.vi && item.content.en && <details><summary>Đọc giải thích tiếng Anh</summary><p>{item.content.en}</p></details>}{item.example?.en && <blockquote>{item.example.en}{item.example.vi && <small>{item.example.vi}</small>}</blockquote>}</article>)}</div></section>}
      {content.lesson.grammar.length > 0 && <section className="book2-card"><h2>Cấu trúc cần nhớ</h2><div className="book2-theory">{content.lesson.grammar.map((item, index) => <article key={index}><h3>{item.formula}</h3><p>{item.meaning?.vi || item.meaning?.en}</p></article>)}</div></section>}
      {content.lesson.strategies.length > 0 && <section className="book2-card"><h2>Cách làm hiệu quả</h2><ol>{content.lesson.strategies.map((item, index) => <li key={index}><strong>{item.topic}</strong> {item.vi || item.en}</li>)}</ol></section>}
      {content.lesson.common_mistakes.length > 0 && <section className="book2-card"><h2>Lỗi thường gặp</h2><div className="book2-theory">{content.lesson.common_mistakes.map((item, index) => <article key={index}><p><b>Tránh:</b> {item.wrong}</p><p><b>Nên dùng:</b> {item.correct}</p><small>{item.reason?.vi || item.reason?.en}</small></article>)}</div></section>}
      {content.lesson.vocabulary.length > 0 && <section className="book2-card"><h2>Từ và cụm từ cần dùng</h2><p>Mỗi nhóm tối đa 7 từ. Học nhóm đầu rồi mở tiếp khi đã sẵn sàng.</p>{vocabularyGroups.map((items, group) => <details className="book2-vocab-group" key={group} open={group === 0}><summary>Nhóm {group + 1} · {items.length} từ</summary><div className="book2-vocab">{items.map((item, index) => <div key={index}><b>{item.term}</b><span>{item.meaning_vi}</span>{item.example_en && <small>{item.example_en}</small>}</div>)}</div></details>)}</section>}
      <Book2SourcePanel content={content} />
      <button type="button" className="button primary" onClick={() => goStep("practice")}>Bắt đầu luyện {questions.length} câu <ArrowRight size={16} /></button>
    </main>}

    {step === "practice" && <main className={hasSources ? "book2-practice-layout has-sources" : "book2-practice-layout"}>
      <div className="book2-practice-main">
        <section className="book2-card book2-practice-intro"><h2>Tự làm trước khi xem đáp án</h2><p>Mỗi nhóm tối đa 6 câu, khoảng 5–10 phút. Bài làm được lưu để tiếp tục sau.</p><div className="book2-practice-summary"><strong>{completedCount}/{questions.length} câu đã xử lý</strong><span>{groups.length - exerciseIndex - 1} nhóm còn lại</span></div>{recordError && <p role="alert" className="book2-incorrect">{recordError}</p>}</section>
        <nav className="book2-exercise-tabs" aria-label="Nhóm bài tập">{groups.map((group, index) => <button key={group.id} type="button" className={index === exerciseIndex ? "active" : ""} aria-current={index === exerciseIndex ? "step" : undefined} onClick={() => { setExerciseIndex(index); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{index + 1}<small>{group.questions.filter((item) => checked[item.question_id]).length}/{group.questions.length}</small></button>)}</nav>
        {currentExercise && <section className="book2-card book2-exercise" key={currentExercise.id}><header><span>NHÓM {exerciseIndex + 1}/{groups.length} · 5–10 PHÚT</span><h2>{currentExercise.title}</h2>{currentExercise.instruction && <p>{currentExercise.instruction.vi || currentExercise.instruction.en}</p>}{currentExercise.questions.every((item) => isObjective(item) ? checked[item.question_id] && isCorrect(item, answers[item.question_id] ?? "") : (ratings[item.question_id] ?? 0) >= 3) && <p className="book2-correct">✓ Nhóm này đã đạt. Bạn có thể học nhóm tiếp theo.</p>}</header>
          {currentExercise.questions.map((item, index) => {
            const value = answers[item.question_id] ?? "";
            const show = Boolean(checked[item.question_id]);
            const right = isCorrect(item, value);
            const openAnswer = !isObjective(item);
            const choices = Array.isArray(item.options) ? item.options : [];
            const minimum = requiredWords(item);
            const wordCount = wordsIn(value);
            const modelVisible = Boolean(revealed[item.question_id] || (openAnswer && show));
            const source = sourceFor(item);
            return <article className="book2-question" id={"question-" + item.question_id} key={item.question_id}>
              <div className="book2-question-head"><span>{index + 1}</span><div><strong>{item.prompt_en}</strong>{item.prompt_vi && item.prompt_vi !== item.prompt_en && <small>{item.prompt_vi}</small>}</div></div>
              {choices.length > 0 ? <div className="book2-options">{choices.map((option) => <label key={option}><input type="radio" name={item.question_id} checked={value === option} onChange={() => answer(item, option)} /><span>{option}</span></label>)}</div>
                : openAnswer ? <textarea value={value} onChange={(event) => answer(item, event.target.value)} rows={item.item_type === "open_writing" ? 9 : 4} maxLength={12000} placeholder={item.item_type === "open_speaking" ? "Ghi ý chính sau khi nói hoặc ghi âm…" : "Viết câu trả lời của bạn…"} />
                : <input className="book2-answer" value={value} onChange={(event) => answer(item, event.target.value)} placeholder="Nhập câu trả lời" />}
              {openAnswer && <small>{wordCount} từ{minimum ? " · Mục tiêu tối thiểu " + minimum + " từ" : ""}</small>}
              {item.item_type === "open_speaking" && <div className="book2-speaking-tools">
                <button type="button" className="button subtle" onClick={() => setTimer({ id: item.question_id, phase: "prepare", seconds: /part 2/i.test(currentExercise.title + " " + item.prompt_en) ? 60 : 15 })}>Bắt đầu chuẩn bị</button>
                {timer?.id === item.question_id && <span role="timer">{timer.phase === "prepare" ? "Chuẩn bị" : "Nói"}: {timer.seconds}s</span>}
                <button type="button" className="button subtle" onClick={() => void toggleRecording(item)}>{recordingId === item.question_id ? "Dừng ghi âm" : "Ghi âm câu này"}</button>
                {recordings[item.question_id] && <><audio controls src={recordings[item.question_id]} /><a href={recordings[item.question_id]} download={item.question_id + ".webm"}>Tải bản ghi</a></>}
                <small>Bản ghi chỉ ở thiết bị này trong lần mở bài hiện tại. Tải về nếu muốn giữ lại.</small>
              </div>}
              <div className="book2-question-actions">
                {openAnswer ? <button type="button" className="button subtle" disabled={(!value.trim() && !recordings[item.question_id]) || (minimum > 0 && wordCount < minimum)} onClick={() => setRevealed((previous) => ({ ...previous, [item.question_id]: true }))}>Xem bài mẫu để tự đối chiếu</button>
                  : <button type="button" className="button subtle" disabled={!value.trim()} onClick={() => check(item)}>Kiểm tra</button>}
                {show && !openAnswer && <span className={right ? "book2-correct" : "book2-incorrect"}>{right ? "✓ Chính xác" : "↻ Cần ôn lại"}</span>}
              </div>
              {show && !openAnswer && <div className="book2-feedback">{!right && <p><b>Đáp án:</b> {(item.answer.accepted ?? []).join(" / ")}</p>}{item.explanation_vi && <p>{item.explanation_vi}</p>}{item.explanation_en && <details><summary>Giải thích tiếng Anh</summary><p>{item.explanation_en}</p></details>}{item.evidence && <small>Bằng chứng: {item.evidence}</small>}{source && <button type="button" className="book2-source-jump" onClick={() => document.getElementById("source-" + source)?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>Xem tư liệu liên quan</button>}{!right && <button type="button" className="book2-retry" onClick={() => { setChecked((previous) => ({ ...previous, [item.question_id]: false })); setAnswers((previous) => ({ ...previous, [item.question_id]: "" })); }}>Làm lại câu này</button>}</div>}
              {openAnswer && modelVisible && <div className="book2-feedback"><p><b>Bài mẫu:</b> {item.answer.model_en}</p>{item.answer.model_vi && <p>{item.answer.model_vi}</p>}{item.explanation_vi && <p>{item.explanation_vi}</p>}<div className="book2-self-rating"><strong>Tự đánh giá sau khi đối chiếu</strong><p>{lesson.skill === "Writing" ? "Đã trả lời đúng yêu cầu, có bố cục, từ vựng và ngữ pháp phù hợp?" : "Đã trả lời đủ ý, diễn đạt mạch lạc, dùng từ và phát âm rõ?"}</p><div>{[["1", "Chưa đạt"], ["2", "Cần sửa"], ["3", "Đạt"], ["4", "Vững"]].map(([number, label]) => <button type="button" key={number} className={ratings[item.question_id] === Number(number) ? "active" : ""} aria-pressed={ratings[item.question_id] === Number(number)} onClick={() => rate(item, Number(number))}>{number}. {label}</button>)}</div></div></div>}
            </article>;
          })}
        </section>}
        <div className="book2-next">{exerciseIndex > 0 && <button type="button" className="button subtle" onClick={() => { setExerciseIndex(exerciseIndex - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft size={16} /> Nhóm trước</button>}{exerciseIndex < groups.length - 1 ? <button type="button" className="button primary" onClick={() => { setExerciseIndex(exerciseIndex + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Nhóm tiếp theo <ArrowRight size={16} /></button> : <button type="button" className="button primary" onClick={() => goStep("review")}>Tổng kết và ôn lại <ArrowRight size={16} /></button>}</div>
      </div>
      <aside className="book2-source-dock"><Book2SourcePanel content={content} practice /></aside>
    </main>}

    {step === "review" && <main className="book2-stack">
      <section className="book2-card"><h2><CheckCircle2 size={20} /> Kết quả luyện tập</h2><p>{objective.length > 0 && "Trắc nghiệm/điền: " + objectiveCorrect.length + "/" + objective.length + " đúng. "}{open.length > 0 && "Câu mở: " + openReviewed.length + "/" + open.length + " đã tự đánh giá."}</p><p className={mastered ? "book2-correct" : "book2-incorrect"}>{mastered ? "Đã đạt mục tiêu bài này. Bạn có thể học tiếp hoặc ôn lại." : "Bài còn phần chưa đạt. Hãy xử lý các câu bên dưới trước khi học tiếp."}</p></section>
      {problems.length > 0 && <section className="book2-card"><h2>Câu cần làm tiếp hoặc ôn lại</h2><div className="book2-review-list">{problems.map((item) => <button type="button" key={item.question_id} onClick={() => jumpTo(item)}><span>{!checked[item.question_id] ? "Chưa làm xong" : "Cần sửa"}</span><strong>{item.prompt_vi || item.prompt_en}</strong><ArrowRight size={16} /></button>)}</div></section>}
      {content.lesson.mini_review.length > 0 && <section className="book2-card"><h2>Tự kiểm tra trước khi qua bài</h2><ul className="book2-checklist">{content.lesson.mini_review.map((item, index) => <li key={index}><label><input type="checkbox" checked={Boolean(checklist[String(index)])} onChange={(event) => setChecklist((previous) => ({ ...previous, [index]: event.target.checked }))} /> {item.vi || item.en}</label></li>)}</ul></section>}
      {open.length > 0 && <section className="book2-card"><h2>Tiêu chí tự đánh giá bài {lesson.skill === "Writing" ? "viết" : "nói"}</h2>{lesson.skill === "Writing" ? <ul><li>Trả lời đúng đề: đủ ý chính và số liệu hoặc lập luận liên quan.</li><li>Mạch lạc: có mở, thân, kết và liên kết ý rõ.</li><li>Từ vựng: dùng từ chính xác, tránh lặp nguyên mẫu.</li><li>Ngữ pháp: câu đúng, có cấu trúc đa dạng và dễ hiểu.</li></ul> : <ul><li>Độ trôi chảy và mạch lạc: ý nối rõ, ít dừng quá lâu.</li><li>Từ vựng: từ phù hợp chủ đề, không lặp quá nhiều.</li><li>Ngữ pháp: câu đủ rõ và có cấu trúc đa dạng.</li><li>Phát âm: người nghe hiểu được trọng âm và âm cuối.</li></ul>}<p>Mức 1–4 chỉ để tự theo dõi, không quy đổi thành band IELTS.</p></section>}
      <div className="book2-next">{navigation?.previous && <Link className="button subtle" href={"/app/lesson/" + navigation.previous.slug}><ArrowLeft size={16} /> Bài trước</Link>}{!mastered && <button type="button" className="button primary" onClick={() => problems[0] && jumpTo(problems[0])}>Tiếp tục câu chưa đạt <RotateCcw size={16} /></button>}{navigation?.next ? <Link className={mastered ? "button primary" : "button subtle"} href={"/app/lesson/" + navigation.next.slug}>Bài tiếp theo <ArrowRight size={16} /></Link> : <Link className="button subtle" href="/app/learn/ielts-builder">Về lộ trình <ArrowRight size={16} /></Link>}</div>
    </main>}
  </div></AppShell>;
}
