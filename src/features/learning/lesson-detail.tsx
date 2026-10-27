"use client";
import { useEffect, useState } from "react";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { NotebookProvider, useNotebook } from "@/features/notebook/notebook-store";
import { SentencePractice, SkillLesson } from "@/features/learning/skill-lesson";
import { ReadingWorkspace } from "@/features/reading/reading-workspace";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { SkillMaterial } from "@/lib/skill-material";

type Block = { id: string; kind: string; body: string };
type Question = { id: string; slug: string; prompt: string; options: string[] };
type Word = { id: string; word: string; phonetic: string; meaning_vi: string; definition: string; example: string; sentence_prompt_vi: string; accepted_sentences: string[] };
type Grade = { score: number; total: number; review?: { slug: string; correctIndex: number; explanation: string; evidence?: string }[] };

type LessonShellProps = Parameters<typeof LessonDetail>[0] & { canManage?: boolean };

export function LessonShell(props: LessonShellProps) {
  return <DemoProvider><NotebookProvider><LessonShellContent {...props} /></NotebookProvider></DemoProvider>;
}
function LessonShellContent({ canManage = false, ...props }: LessonShellProps) {
  const { ready } = useDemo();
  return <AppShell canManage={canManage}>{ready ? <LessonDetail {...props} /> : <div className="content-page">Loading your lesson…</div>}</AppShell>;
}

export function LessonDetail({ lesson, blocks, questions, words, material, display = "full" }: {
  lesson: { slug: string; title: string; skill: string; summary: string };
  blocks: Block[]; questions: Question[]; words: Word[]; material: SkillMaterial | null;
  display?: "full" | "material" | "words" | "questions";
}) {
  const { entries, addEntry, error: notebookError } = useNotebook();
  const [answered, setAnswered] = useState<boolean[]>([]);
  const [revealed, setRevealed] = useState(false);
  const reading = material?.skill === "Reading" ? material : null;
  const blockNodes = blocks.filter((block) => !(reading && block.kind === "paragraph" && block.body === reading.passage)).map((block) => block.kind === "heading" ? <h2 key={block.id}>{block.body}</h2> : block.kind === "tip" ? <aside className="tip-box" key={block.id}>{block.body}</aside> : <p key={block.id}>{block.body}</p>);
  const wordNodes = words.length > 0 && <div className="lesson-words"><h2>Vocabulary</h2>{words.map((word) => { const saved = entries.some((entry) => entry.kind === "word" && entry.title === word.word && entry.sourcePath === `/app/lesson/${lesson.slug}`); return <article key={word.id}><TopicArt topic={lesson.title} word={word.word} lessonSlug={lesson.slug} badge={false} className="lesson-word-art" /><h3>{word.word} <small>{word.phonetic}</small></h3><p>{word.meaning_vi} · {word.definition}</p><p><em>{word.example}</em></p><button type="button" className="button subtle" disabled={saved} onClick={async () => { try { await addEntry({ kind: "word", title: word.word, body: "", meaningVi: word.meaning_vi, example: word.example }); } catch { /* Notebook shows the error. */ } }}>{saved ? "Đã lưu vào sổ" : "Lưu vào sổ tay"}</button>{word.sentence_prompt_vi && word.accepted_sentences.length > 0 && <SentencePractice prompt={word.sentence_prompt_vi} accepted={word.accepted_sentences} />}</article>; })}{notebookError && <p role="alert" className="form-error">{notebookError}</p>}</div>;
  const questionNodes = questions.length > 0 && <LessonQuestions lessonSlug={lesson.slug} questions={questions} onProgress={setAnswered} onGraded={setRevealed} />;
  if (display === "words") return wordNodes || null;
  if (display === "questions") return questionNodes || null;
  if (display === "material") return <div className="package-material"><SkillLesson material={material} lessonSlug={lesson.slug} answersRevealed={revealed} passageInReader={Boolean(reading)} />{reading ? <ReadingWorkspace key={lesson.slug} docKey={`lesson:${lesson.slug}`} title={lesson.title} paragraphs={reading.passage.split(/\n\s*\n/)} after={blockNodes} /> : blockNodes}</div>;
  return <div className={`content-page ${reading ? "reading-lesson-page" : ""}`}>{reading
    ? <header className="reading-lesson-intro"><span className="eyebrow">IELTS READING · BÀI ĐỌC</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></header>
    : <PageHeader eyebrow={`${lesson.skill.toUpperCase()} LESSON`} title={lesson.title} description={lesson.summary} sticker="book" />}
    <TopicArt topic={lesson.title} lessonSlug={lesson.slug} variant="lesson" className="lesson-intro-art" />
    <section className="card section-card">
      <SkillLesson material={material} lessonSlug={lesson.slug} answersRevealed={revealed} passageInReader={Boolean(reading)} />
      {/* Reading lessons use the reader: highlights, text size and a split view for the questions. */}
      {reading ? <ReadingWorkspace key={lesson.slug} docKey={`lesson:${lesson.slug}`} title={lesson.title} paragraphs={reading.passage.split(/\n\s*\n/)} after={<>{blockNodes}{wordNodes}</>} practice={questionNodes ? { answered, content: questionNodes } : undefined} />
        : <>{blockNodes}{wordNodes}{questionNodes}</>}
    </section>
  </div>;
}

function LessonQuestions({ lessonSlug, questions, onProgress, onGraded }: { lessonSlug: string; questions: Question[]; onProgress: (answered: boolean[]) => void; onGraded: (graded: boolean) => void }) {
  const { submitExercise } = useDemo();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onProgress(questions.map((question) => answers[question.slug] !== undefined)); }, [answers, questions, onProgress]);
  useEffect(() => { onGraded(Boolean(grade)); }, [grade, onGraded]);
  return <div className="lesson-questions"><h2>Check your understanding</h2>{questions.map((question, index) => <div className="question-block" key={question.id} data-q={index + 1}><h3>{index + 1}. {question.prompt}</h3><div className="answer-options">{question.options.map((option, optionIndex) => <button key={optionIndex} className={answers[question.slug] === optionIndex ? "selected" : ""} disabled={Boolean(grade)} onClick={() => setAnswers((current) => ({ ...current, [question.slug]: optionIndex }))}>{option}</button>)}</div></div>)}
    {!grade ? <button className="button primary" disabled={busy || questions.some((question) => answers[question.slug] === undefined)} onClick={async () => { setBusy(true); try { setGrade(await submitExercise(lessonSlug, answers, 0, questions.length)); } catch { /* The store displays the error. */ } finally { setBusy(false); } }}>{busy ? "Checking…" : "Submit answers"}</button> : <div className="result-panel"><h3>{grade.score} / {grade.total} correct</h3>{grade.review?.map((item, index) => <p key={item.slug}><b>{index + 1}.</b> {item.explanation}{item.evidence && <><br /><b>Bằng chứng:</b> “{item.evidence}”</>}</p>)}<button className="button subtle" onClick={() => { setAnswers({}); setGrade(null); }}>Try again</button></div>}
  </div>;
}
