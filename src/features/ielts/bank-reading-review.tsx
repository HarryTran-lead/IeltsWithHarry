"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { estimateBand, type ReviewItem, typeLabel } from "./bank-exam";
import { optionKey, optionLabel, groupQuestions } from "./bank-questions";
import { RichText } from "./rich-text";
import "./bank-reading-review.css";

type Props = { title: string; content: ExamContent; review: ReviewItem[]; format: string; difficulty?: string; startedAt?: string; submittedAt?: string; backHref: string; retryHref?: string; onRetry?: () => void };

export function ReadingReview({ title, content, review, format, difficulty, startedAt, submittedAt, backHref, retryHref, onRetry }: Props) {
  const [summary, setSummary] = useState(true);
  const [part, setPart] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const body = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => content.sections.filter((section) => section.questions.length), [content]);
  const questions = useMemo(() => sections.flatMap((section) => section.questions), [sections]);
  const numberOf = (id: string) => questions.find((item) => item.id === id)?.number ?? 0;
  const result = new Map(review.map((item) => [item.id, item]));
  const correct = review.filter((item) => item.correct).length;
  const wrong = review.filter((item) => !item.correct && item.given).length;
  const skipped = review.filter((item) => !item.given).length;
  const band = estimateBand("Reading", format, correct, review.length);
  const duration = startedAt && submittedAt ? Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 60000)) : null;
  const difficultyLabel = difficulty === "easy" ? "Dễ" : difficulty === "balanced" ? "Vừa sức" : difficulty === "hard" ? "Khó" : null;
  const section = sections[Math.min(part, sections.length - 1)];
  const evidence = active ? result.get(active)?.evidence : null;
  const groups = groupQuestions(section?.questions || []);
  useEffect(() => { if (evidence) document.querySelector(".br-passage .is-evidence")?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [evidence, part]);
  const pick = (sectionIndex: number, questionId?: string) => {
    setPart(sectionIndex);
    setActive(questionId || null);
    window.setTimeout(() => { document.getElementById(questionId ? `br-q-${questionId}` : "br-question-start")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  };
  const resize = (clientX: number) => {
    const bounds = body.current?.getBoundingClientRect();
    if (bounds) setSplit(Math.max(30, Math.min(70, Math.round(((clientX - bounds.left) / bounds.width) * 100))));
  };

  if (summary) return <main className="bx-page br-summary bl-tone-reading"><nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> Reading</Link><span>/</span>Kết quả</nav>
    <section className="br-summary-card"><span className="bx-kicker">Kết quả Reading</span><h1>{title}</h1><p>Xem tổng quan bài làm, rồi mở lại đề để đối chiếu từng câu với bài đọc.</p>
      <div className="br-summary-score"><strong>{band === null ? "—" : band.toFixed(1)}<small>Band ước tính</small></strong><span>{correct}<small>Đúng</small></span><span>{wrong}<small>Sai</small></span><span>{skipped}<small>Bỏ qua</small></span></div>
      <dl className="br-summary-facts"><div><dt>Tổng số câu</dt><dd>{review.length}</dd></div><div><dt>Tỉ lệ đúng</dt><dd>{review.length ? Math.round(correct / review.length * 100) : 0}%</dd></div>{duration !== null && <div><dt>Thời gian làm</dt><dd>{duration} phút</dd></div>}{submittedAt && <div><dt>Ngày nộp</dt><dd>{new Date(submittedAt).toLocaleString("vi-VN")}</dd></div>}{difficultyLabel && <div><dt>Bạn đánh giá đề</dt><dd>{difficultyLabel}</dd></div>}</dl>
      <div className="br-summary-actions"><button type="button" className="bx-start" onClick={() => setSummary(false)}>Xem lại bài làm <ChevronRight size={18} /></button>{onRetry ? <button type="button" className="bx-ghost" onClick={onRetry}><RotateCcw size={16} /> Làm lại</button> : retryHref && <Link href={retryHref} className="bx-ghost"><RotateCcw size={16} /> Làm lại</Link>}</div>
      <small>Band chỉ là ước tính từ bài luyện tập.</small>
    </section></main>;

  return <main className="br-review bl-tone-reading" style={{ "--br-left": `${split}%` } as CSSProperties}>
    <header className="br-review-head"><Link href={backHref} aria-label="Về ngân hàng đề"><ArrowLeft size={18} /></Link><div><strong>{title}</strong><small>Xem lại bài Reading · {correct}/{review.length} câu đúng · Band {band?.toFixed(1) ?? "—"}</small></div><button type="button" onClick={() => setSummary(true)}>Xem kết quả</button></header>
    <div className="br-review-body" ref={body}>
      <article className="br-passage" aria-label="Bài đọc"><span>Passage {part + 1}</span><h1>{section?.title}</h1>{section?.passage.split(/\n\s*\n/).map((paragraph, index) => { const letter = evidence?.paragraph.split("-").at(-1); const matchingParagraph = Boolean(letter && paragraph.startsWith(`**${letter}**`)); const start = evidence?.quote ? paragraph.toLowerCase().indexOf(evidence.quote.toLowerCase()) : -1; return <p key={index} className={matchingParagraph || start >= 0 ? "is-evidence" : undefined}>{start >= 0 && evidence ? <><RichText text={paragraph.slice(0, start)} /><mark><RichText text={paragraph.slice(start, start + evidence.quote.length)} /></mark><RichText text={paragraph.slice(start + evidence.quote.length)} /></> : <RichText text={paragraph} />}</p>; })}</article>
      <div className="br-divider" role="separator" tabIndex={0} aria-label="Độ rộng bài đọc" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={split} onPointerDown={(event) => { if (window.matchMedia("(min-width: 901px)").matches) { event.currentTarget.setPointerCapture(event.pointerId); resize(event.clientX); } }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(30, Math.min(70, value + (event.key === "ArrowRight" ? 5 : -5)))); } }}><span>⋮</span></div>
      <div className="br-questions" aria-label="Câu hỏi và giải thích" id="br-question-start">{groups.map((group) => <section className="br-group" key={group.key}><h2>Questions {numberOf(group.questions[0].id)}–{numberOf(group.questions.at(-1)!.id)}</h2><p className="br-instructions"><RichText text={group.instructions} /></p>{group.questions.map((question) => {
        const item = result.get(question.id);
        const open = active === question.id;
        const fixed = /true[_-]false/.test(question.type) ? ["TRUE", "FALSE", "NOT GIVEN"] : /yes[_-]no/.test(question.type) ? ["YES", "NO", "NOT GIVEN"] : [];
        const options = question.options.length ? question.options : fixed;
        return <div className={`br-question ${item?.correct ? "is-right" : item?.given ? "is-wrong" : "is-skipped"}`} key={question.id} id={`br-q-${question.id}`}><div className="br-question-title"><span>{numberOf(question.id)}</span><div><RichText text={question.prompt} /></div><button type="button" aria-expanded={open} onClick={() => setActive(open ? null : question.id)}>{open ? "Ẩn giải thích" : "Xem giải thích"}</button></div>
          {options.length > 0 && <ul className="br-options">{options.map((option) => { const key = optionKey(option), chosen = item?.given && (option === item.given || key === item.given), answer = item?.answers.some((value) => value === option || value === key); return <li key={option} className={`${chosen ? "is-chosen" : ""} ${answer ? "is-answer" : ""}`}><b>{key}</b><span>{optionLabel(option) || option}</span>{chosen && <small>Bạn chọn</small>}{answer && <small>Đáp án</small>}</li>; })}</ul>}
          {!options.length && <p className="br-written">Bạn trả lời: <strong>{item?.given || "Chưa trả lời"}</strong></p>}
          {open && <div className="br-explanation"><div><b>{item?.correct ? "Bạn trả lời đúng" : item?.given ? "Bạn trả lời chưa đúng" : "Bạn chưa trả lời"}</b><span>Đáp án đúng: <strong>{item?.answers.join(" / ") || "—"}</strong></span></div><small>{typeLabel(question.type)}</small>{item?.evidence?.quote && <blockquote><b>Dẫn chứng trong bài đọc</b><br />“{item.evidence.quote}”</blockquote>}{item?.explanation ? <p><RichText text={item.explanation} /></p> : <p>Đối chiếu đáp án với thông tin trong bài đọc bên trái.</p>}</div>}
        </div>;
      })}</section>)}<div className="br-next">{part + 1 < sections.length && <button type="button" onClick={() => pick(part + 1)}>Sang Passage {part + 2} <ChevronRight size={17} /></button>}</div></div>
    </div>
    <footer className="br-review-dock"><button type="button" disabled={part === 0} aria-label="Passage trước" onClick={() => pick(part - 1)}><ChevronLeft size={17} /></button><nav aria-label="Chọn câu hỏi">{sections.map((value, index) => <div key={value.id} className={index === part ? "is-current" : ""}><button type="button" onClick={() => pick(index)}>Passage {index + 1}</button>{value.questions.map((question) => { const item = result.get(question.id); return <button type="button" key={question.id} className={item?.correct ? "is-right" : item?.given ? "is-wrong" : "is-skipped"} onClick={() => pick(index, question.id)} aria-label={`Câu ${numberOf(question.id)}: ${item?.correct ? "đúng" : item?.given ? "sai" : "bỏ qua"}`}>{numberOf(question.id)}</button>; })}</div>)}</nav><button type="button" disabled={part + 1 === sections.length} aria-label="Passage sau" onClick={() => pick(part + 1)}><ChevronRight size={17} /></button><Link href={backHref}>Bài khác</Link></footer>
  </main>;
}
