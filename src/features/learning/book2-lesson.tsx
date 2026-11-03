"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle2, Headphones, RotateCcw, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { savePracticeResult } from "./practice-results";
import "./book2-lesson.css";

type Bilingual = { en?: string; vi?: string };
type Book2Item = { question_id: string; item_type: string; prompt_en: string; prompt_vi?: string; options?: string[]; answer: { kind: string; accepted?: string[]; model_en?: string; model_vi?: string }; explanation_en?: string; explanation_vi?: string; evidence?: string; passage_id?: string; audio_id?: string; data_id?: string };
type Exercise = { id: string; title: string; instruction?: Bilingual | null; questions: Book2Item[] };
export type Book2Content = { type: "book2"; book_id: "BOOK_2"; source_id: string; unit_id: string; lesson: { title: string; duration_minutes?: number; learning_objectives: Bilingual[]; theory: { title: string; content?: Bilingual; example?: Bilingual }[]; vocabulary: { term?: string; meaning_vi?: string; example_en?: string }[]; grammar: { formula?: string; meaning?: Bilingual }[]; strategies: { topic?: string; en?: string; vi?: string }[]; common_mistakes: { wrong?: string; correct?: string; reason?: Bilingual }[]; mini_review: Bilingual[]; rubric?: { criteria?: string[]; self_rating_scale?: string } | null }; passages: { id: string; title?: string; text: string }[]; audios: { id: string; title?: string; transcript?: string; audio_url?: string }[]; visuals: { id: string; title?: string; headers?: string[]; rows?: (string | number)[][]; image_url?: string }[]; exercises: Exercise[] };
type Nav = { previous: { slug: string; title: string } | null; next: { slug: string; title: string } | null; index: number; total: number } | null;

function normalize(value: string) { return value.trim().toLocaleLowerCase().replace(/[.,!?]+$/g, "").replace(/\s+/g, " "); }
function draftKey(slug: string) { return `book2-draft:${slug}`; }
function readDraft(slug: string): Record<string, string> { try { return JSON.parse(localStorage.getItem(draftKey(slug)) ?? "{}"); } catch { return {}; } }
function checkedKey(slug: string) { return `book2-checked:${slug}`; }
function readChecked(slug: string): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(checkedKey(slug)) ?? "{}"); } catch { return {}; } }

export function Book2LessonPage({ lesson, content, navigation, canManage }: { lesson: { slug: string; title: string; skill: string }; content: Book2Content; navigation: Nav; canManage: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);
  const [step, setStep] = useState<"learn" | "practice" | "review">("learn");
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const questions = useMemo(() => content.exercises.flatMap((exercise) => exercise.questions), [content.exercises]);
  const objective = questions.filter((question) => question.answer.kind === "objective");
  const scoreItems = objective.length ? objective : questions;
  const scored = scoreItems.filter((question) => checked[question.question_id]);
  const correct = objective.length ? scored.filter((question) => (question.answer.accepted ?? []).some((key) => normalize(key) === normalize(answers[question.question_id] ?? ""))).length : scored.length;
  useEffect(() => { setAnswers(readDraft(lesson.slug)); setChecked(readChecked(lesson.slug)); setRestored(true); }, [lesson.slug]);
  useEffect(() => { if (!restored) return; try { localStorage.setItem(draftKey(lesson.slug), JSON.stringify(answers)); } catch { /* browser storage may be disabled */ } }, [answers, lesson.slug, restored]);
  useEffect(() => { if (!restored) return; try { localStorage.setItem(checkedKey(lesson.slug), JSON.stringify(checked)); } catch { /* browser storage may be disabled */ } }, [checked, lesson.slug, restored]);
  useEffect(() => () => { if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()); if (recordUrl) URL.revokeObjectURL(recordUrl); }, [recordUrl]);

  function answer(id: string, value: string) { setAnswers((previous) => ({ ...previous, [id]: value })); setChecked((previous) => ({ ...previous, [id]: false })); }
  function check(item: Book2Item) {
    const next = { ...checked, [item.question_id]: true };
    setChecked(next);
    const done = scoreItems.filter((question) => next[question.question_id]);
    void savePracticeResult(lesson.slug, { checked: done.length, total: scoreItems.length, correct: objective.length ? done.filter((question) => (question.answer.accepted ?? []).some((key) => normalize(key) === normalize(answers[question.question_id] ?? ""))).length : done.length });
  }
  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); stream.current?.getTracks().forEach((track) => track.stop()); return; }
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = microphone;
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(microphone);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => { if (recordUrl) URL.revokeObjectURL(recordUrl); setRecordUrl(URL.createObjectURL(new Blob(chunks, { type: next.mimeType }))); };
      recorder.current = next; next.start(); setRecording(true);
    } catch { setRecording(false); }
  }

  return <AppShell canManage={canManage}><div className="content-page book2-page">
    <nav className="book2-route"><Link href="/app/learn/ielts-builder"><ArrowLeft size={16} /> IELTS Builder</Link><span>{content.unit_id} · Bài {navigation?.index ?? ""}/{navigation?.total ?? ""}</span></nav>
    <header className="book2-hero"><div><span className="eyebrow">BOOK 2 · {lesson.skill.toUpperCase()} · {content.lesson.duration_minutes ?? 40} PHÚT</span><h1>{lesson.title}</h1><p>Học một mục tiêu, tự làm bài, xem bằng chứng và ôn lại phần chưa chắc.</p></div><div className="book2-hero-score"><strong>{objective.length ? correct : scored.length}/{scoreItems.length}</strong><span>{objective.length ? "câu đúng đã kiểm tra" : "câu đã tự đánh giá"}</span></div></header>
    <nav className="book2-steps" aria-label="Các bước tự học"><button type="button" className={step === "learn" ? "active" : ""} onClick={() => setStep("learn")}>1. Tìm hiểu</button><button type="button" className={step === "practice" ? "active" : ""} onClick={() => setStep("practice")}>2. Luyện tập <span>{scored.length}/{scoreItems.length}</span></button><button type="button" className={step === "review" ? "active" : ""} onClick={() => setStep("review")}>3. Ôn lại</button></nav>
    {step === "learn" && <main className="book2-stack">
      <section className="book2-card"><h2><Target size={20} /> Sau bài này bạn làm được gì?</h2><ul>{content.lesson.learning_objectives.map((item, index) => <li key={index}>{item.vi || item.en}{item.vi && item.en && <small>{item.en}</small>}</li>)}</ul></section>
      {content.lesson.theory.length > 0 && <section className="book2-card"><h2>Kiến thức cốt lõi</h2><div className="book2-theory">{content.lesson.theory.map((item, index) => <article key={index}><h3>{item.title}</h3><p>{item.content?.vi || item.content?.en}</p>{item.content?.vi && item.content.en && <details><summary>Đọc giải thích tiếng Anh</summary><p>{item.content.en}</p></details>}{item.example?.en && <blockquote>{item.example.en}{item.example.vi && <small>{item.example.vi}</small>}</blockquote>}</article>)}</div></section>}
      {content.lesson.grammar.length > 0 && <section className="book2-card"><h2>Cấu trúc cần nhớ</h2><div className="book2-theory">{content.lesson.grammar.map((item, index) => <article key={index}><h3>{item.formula}</h3><p>{item.meaning?.vi || item.meaning?.en}</p></article>)}</div></section>}
      {content.lesson.strategies.length > 0 && <section className="book2-card"><h2>Cách làm hiệu quả</h2><ol>{content.lesson.strategies.map((item, index) => <li key={index}><strong>{item.topic}</strong> {item.vi || item.en}</li>)}</ol></section>}
      {content.lesson.common_mistakes.length > 0 && <section className="book2-card"><h2>Lỗi thường gặp</h2><div className="book2-theory">{content.lesson.common_mistakes.map((item, index) => <article key={index}><p><b>Tránh:</b> {item.wrong}</p><p><b>Nên dùng:</b> {item.correct}</p><small>{item.reason?.vi || item.reason?.en}</small></article>)}</div></section>}
      {content.lesson.vocabulary.length > 0 && <section className="book2-card"><h2>Từ và cụm từ cần dùng</h2><div className="book2-vocab">{content.lesson.vocabulary.map((item, index) => <div key={index}><b>{item.term}</b><span>{item.meaning_vi}</span>{item.example_en && <small>{item.example_en}</small>}</div>)}</div></section>}
      {content.passages.map((passage) => <section className="book2-card" key={passage.id}><h2>Bài đọc · {passage.title ?? passage.id}</h2><div className="book2-passage">{passage.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>)}
      {content.audios.map((audio) => <section className="book2-card" key={audio.id}><h2><Headphones size={20} /> Bài nghe · {audio.title ?? audio.id}</h2>{audio.audio_url ? <audio controls preload="none" src={audio.audio_url} /> : <p>Bản ghi âm chưa có. Dùng transcript để luyện đọc và tự kiểm tra nội dung.</p>}{audio.transcript && <details><summary>Hiện transcript sau khi nghe</summary><pre className="book2-transcript">{audio.transcript}</pre></details>}</section>)}
      {content.visuals.map((visual) => <section className="book2-card" key={visual.id}><h2>{visual.title ?? visual.id}</h2>{visual.image_url && <Image className="book2-visual" src={visual.image_url} alt={visual.title ?? visual.id} width={900} height={520} unoptimized />}{visual.rows?.length ? <div className="book2-table-wrap"><table><thead><tr>{visual.headers?.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{visual.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}</section>)}
      <button type="button" className="button primary" onClick={() => { setStep("practice"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Bắt đầu làm {questions.length} câu <ArrowRight size={16} /></button>
    </main>}
    {step === "practice" && <main className="book2-stack"><section className="book2-card book2-practice-intro"><h2>Tự làm trước khi xem đáp án</h2><p>Với câu điền và trắc nghiệm, bấm “Kiểm tra” để nhận giải thích. Với Writing và Speaking, viết hoặc ghi âm câu trả lời rồi mới mở bài mẫu để tự đối chiếu.</p>{lesson.skill === "Speaking" && <div className="book2-recorder"><button type="button" className="button subtle" onClick={() => void toggleRecording()}>{recording ? "Dừng ghi âm" : "Ghi âm câu trả lời"}</button>{recordUrl && <audio controls src={recordUrl} />}</div>}</section>
      {content.exercises.map((exercise) => <section className="book2-card book2-exercise" key={exercise.id}><header><span>{exercise.id}</span><h2>{exercise.title}</h2>{exercise.instruction && <p>{exercise.instruction.vi || exercise.instruction.en}</p>}</header>{exercise.questions.map((item, index) => { const value = answers[item.question_id] ?? ""; const show = Boolean(checked[item.question_id]); const right = (item.answer.accepted ?? []).some((key) => normalize(key) === normalize(value)); const open = item.answer.kind !== "objective"; return <article className="book2-question" key={item.question_id}><div className="book2-question-head"><span>{index + 1}</span><div><strong>{item.prompt_en}</strong>{item.prompt_vi && <small>{item.prompt_vi}</small>}</div></div>{item.options?.length ? <div className="book2-options">{item.options.map((option) => <label key={option}><input type="radio" name={item.question_id} checked={value === option} onChange={() => answer(item.question_id, option)} /><span>{option}</span></label>)}</div> : open ? <textarea value={value} onChange={(event) => answer(item.question_id, event.target.value)} rows={item.item_type === "open_writing" ? 9 : 4} placeholder={item.item_type === "open_speaking" ? "Ghi ý chính sau khi nói hoặc ghi âm…" : "Viết câu trả lời của bạn…"} /> : <input className="book2-answer" value={value} onChange={(event) => answer(item.question_id, event.target.value)} placeholder="Nhập câu trả lời" />}{open && <small>{value.trim() ? `${value.trim().split(/\s+/).length} từ` : "Hãy trả lời trước khi xem bài mẫu."}</small>}<div className="book2-question-actions"><button type="button" className="button subtle" disabled={!value.trim()} onClick={() => check(item)}>{open ? "Xem gợi ý tự đánh giá" : "Kiểm tra"}</button>{show && !open && <span className={right ? "book2-correct" : "book2-incorrect"}>{right ? "✓ Chính xác" : "↻ Cần ôn lại"}</span>}</div>{show && <div className="book2-feedback">{!right && !open && <p><b>Đáp án:</b> {(item.answer.accepted ?? []).join(" / ")}</p>}{open && item.answer.model_en && <p><b>Bài mẫu:</b> {item.answer.model_en}</p>}{item.answer.model_vi && <p>{item.answer.model_vi}</p>}{item.explanation_vi && <p>{item.explanation_vi}</p>}{item.explanation_en && <details><summary>Giải thích tiếng Anh</summary><p>{item.explanation_en}</p></details>}{item.evidence && <small>Bằng chứng: {item.evidence}</small>}</div>}</article>; })}</section>)}
      <button type="button" className="button primary" onClick={() => { setStep("review"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Tổng kết và ôn lại <ArrowRight size={16} /></button>
    </main>}
    {step === "review" && <main className="book2-stack"><section className="book2-card"><h2><CheckCircle2 size={20} /> Kết quả luyện tập</h2><p>{objective.length ? `Đã kiểm tra ${scored.length}/${scoreItems.length} câu tự chấm; đúng ${correct} câu.` : `Đã tự đánh giá ${scored.length}/${scoreItems.length} câu mở.`} Bài viết và bài nói cần tự đối chiếu với bài mẫu, không quy đổi thành điểm IELTS.</p>{scored.length < scoreItems.length && <button type="button" className="button subtle" onClick={() => setStep("practice")}>Làm tiếp câu chưa kiểm tra</button>}{objective.length > 0 && scored.length > 0 && correct / scored.length < 0.8 && <p className="book2-review-tip"><RotateCcw size={16} /> Hãy quay lại những câu sai, đọc bằng chứng rồi làm lại mà không nhìn đáp án.</p>}</section>{content.lesson.mini_review.length > 0 && <section className="book2-card"><h2>Tự kiểm tra trước khi qua bài</h2><ul className="book2-checklist">{content.lesson.mini_review.map((item, index) => <li key={index}><label><input type="checkbox" /> {item.vi || item.en}</label></li>)}</ul></section>}{content.lesson.rubric?.criteria?.length ? <section className="book2-card"><h2>Tiêu chí tự đánh giá bài nói</h2><ul>{content.lesson.rubric.criteria.map((criterion) => <li key={criterion}>{criterion.replaceAll("_", " ")}</li>)}</ul><p>{content.lesson.rubric.self_rating_scale}</p></section> : null}<div className="book2-next">{navigation?.previous && <Link className="button subtle" href={`/app/lesson/${navigation.previous.slug}`}><ArrowLeft size={16} /> Bài trước</Link>}{navigation?.next ? <Link className="button primary" href={`/app/lesson/${navigation.next.slug}`}>Bài tiếp theo <ArrowRight size={16} /></Link> : <Link className="button primary" href="/app/learn/ielts-builder">Về lộ trình <ArrowRight size={16} /></Link>}</div></main>}
  </div></AppShell>;
}
