"use client";
import { useState } from "react";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { NotebookProvider, useNotebook } from "@/features/notebook/notebook-store";

type Block = { id: string; kind: string; body: string };
type Question = { id: string; slug: string; prompt: string; options: string[] };
type Word = { id: string; word: string; phonetic: string; meaning_vi: string; definition: string; example: string };
type Grade = { score: number; total: number; review?: { slug: string; correctIndex: number; explanation: string }[] };

export function LessonShell(props: Parameters<typeof LessonDetail>[0]) {
  return <DemoProvider><NotebookProvider><LessonShellContent {...props} /></NotebookProvider></DemoProvider>;
}
function LessonShellContent(props: Parameters<typeof LessonDetail>[0]) {
  const { ready } = useDemo();
  return <AppShell>{ready ? <LessonDetail {...props} /> : <div className="content-page">Loading your lesson…</div>}</AppShell>;
}

export function LessonDetail({ lesson, blocks, questions, words }: {
  lesson: { slug: string; title: string; skill: string; summary: string };
  blocks: Block[]; questions: Question[]; words: Word[];
}) {
  const { submitExercise } = useDemo();
  const { entries, addEntry, error: notebookError } = useNotebook();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  return <div className="content-page"><div className="learning-intro"><div><span className="eyebrow">{lesson.skill.toUpperCase()} LESSON</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></div></div>
    <section className="card section-card">
      {blocks.map((block) => block.kind === "heading" ? <h2 key={block.id}>{block.body}</h2> : block.kind === "tip" ? <aside className="tip-box" key={block.id}>{block.body}</aside> : <p key={block.id}>{block.body}</p>)}
      {words.length > 0 && <div className="lesson-words"><h2>Vocabulary</h2>{words.map((word) => { const saved = entries.some((entry) => entry.kind === "word" && entry.title === word.word && entry.sourcePath === `/app/lesson/${lesson.slug}`); return <article key={word.id}><h3>{word.word} <small>{word.phonetic}</small></h3><p>{word.meaning_vi} · {word.definition}</p><p><em>{word.example}</em></p><button type="button" className="button subtle" disabled={saved} onClick={async () => { try { await addEntry({ kind: "word", title: word.word, body: "", meaningVi: word.meaning_vi, example: word.example }); } catch { /* Notebook shows the error. */ } }}>{saved ? "★ Đã lưu vào sổ" : "☆ Lưu vào sổ tay"}</button></article>; })}{notebookError && <p role="alert" className="form-error">{notebookError}</p>}</div>}
      {questions.length > 0 && <div className="lesson-questions"><h2>Check your understanding</h2>{questions.map((question, index) => <div className="question-block" key={question.id}><h3>{index + 1}. {question.prompt}</h3><div className="answer-options">{question.options.map((option, optionIndex) => <button key={optionIndex} className={answers[question.slug] === optionIndex ? "selected" : ""} disabled={Boolean(grade)} onClick={() => setAnswers((current) => ({ ...current, [question.slug]: optionIndex }))}>{option}</button>)}</div></div>)}
        {!grade ? <button className="button primary" disabled={busy || questions.some((question) => answers[question.slug] === undefined)} onClick={async () => { setBusy(true); try { setGrade(await submitExercise(lesson.slug, answers, 0, questions.length)); } catch { /* The store displays the error. */ } finally { setBusy(false); } }}>{busy ? "Checking…" : "Submit answers"}</button> : <div className="result-panel"><h3>{grade.score} / {grade.total} correct</h3>{grade.review?.map((item, index) => <p key={item.slug}><b>{index + 1}.</b> {item.explanation}</p>)}<button className="button subtle" onClick={() => { setAnswers({}); setGrade(null); }}>Try again</button></div>}
      </div>}
    </section>
  </div>;
}
