"use client";
/* Learner-facing text helpers: glossary terms explained in place, and model answers with their annotations marked. */
import type { ReactNode } from "react";
import { glossary } from "@/lib/writing-task2/guides";
import { questionTypeLabels, type Task2Annotation } from "@/lib/writing-task2/types";

const termPattern = new RegExp(glossary.map((entry) => `(${entry.match.source})`).join("|"), "gi");

/** A term the learner may not know yet, explained on hover, focus or tap. */
export function Term({ children, explain, term }: { children: ReactNode; explain: string; term: string }) {
  return <span className="t2-term" tabIndex={0}>{children}<span role="tooltip" className="t2-term-tip"><b>{term}</b>{explain}</span></span>;
}

const typeIdPattern = new RegExp(`\\b(${Object.keys(questionTypeLabels).sort((a, b) => b.length - a.length).join("|")})\\b`, "g");

/** Wraps glossary terms in a Vietnamese sentence; each term is explained once per text. Question-type ids read as their names. */
export function withTerms(raw: string | undefined): ReactNode {
  if (!raw) return raw;
  const text = raw.replace(typeIdPattern, (id) => questionTypeLabels[id] ?? id);
  const seen = new Set<string>();
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(termPattern)) {
    const word = match[0];
    const entry = glossary.find((item) => new RegExp(`^(?:${item.match.source})$`, item.match.flags).test(word));
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    const index = match.index ?? 0;
    out.push(text.slice(last, index), <Term key={index} term={entry.term} explain={entry.vi}>{word}</Term>);
    last = index + word.length;
  }
  if (!out.length) return text;
  out.push(text.slice(last));
  return out;
}

/** A model text with each annotated quote marked and numbered; the notes are listed under it. */
export function AnnotatedText({ text, annotations = [] }: { text: string; annotations?: Task2Annotation[] }) {
  const numbered = annotations.map((note, index) => ({ ...note, n: index + 1 }));
  return <div className="t2-model-text" lang="en">{text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{mark(paragraph, numbered)}</p>)}</div>;
}

function mark(paragraph: string, notes: (Task2Annotation & { n: number })[]): ReactNode {
  const hits = notes.map((note) => ({ note, at: note.quote_en ? paragraph.indexOf(note.quote_en) : -1 })).filter((hit) => hit.at >= 0).sort((a, b) => a.at - b.at);
  if (!hits.length) return paragraph;
  const out: ReactNode[] = [];
  let last = 0;
  for (const { note, at } of hits) {
    if (at < last) continue;
    out.push(paragraph.slice(last, at), <mark key={note.n} className="t2-mark" title={`${note.label_vi}: ${note.note_vi}`}><sup>{note.n}</sup>{note.quote_en}</mark>);
    last = at + note.quote_en.length;
  }
  out.push(paragraph.slice(last));
  return out;
}

export function AnnotationList({ annotations }: { annotations?: Task2Annotation[] }) {
  if (!annotations?.length) return null;
  return <ol className="t2-notes">{annotations.map((note, index) => <li key={index}><span className="t2-note-n">{index + 1}</span><div><b>{note.label_vi}</b><p>{withTerms(note.note_vi)}</p></div></li>)}</ol>;
}

/** Generic package explanations that teach nothing; the page hides them instead of repeating them under every answer. */
export const emptyExplanation = (text: string | undefined) => !text || /^Đáp án tham khảo; có thể có nhiều cách diễn đạt/.test(text) || /^Lỗi trọng tâm được đặt riêng/.test(text);
