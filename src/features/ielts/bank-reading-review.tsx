"use client";
/* eslint-disable @next/next/no-img-element -- Review diagrams use the exact media URL stored with the exam. */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { displayExamTitle } from "@/lib/ielts-bank/display-title";
import { estimateBand, type ReviewItem, typeLabel } from "./bank-exam";
import { optionKey, optionLabel, groupQuestions } from "./bank-questions";
import { RichText } from "./rich-text";
import { ReadingShare } from "./reading-share";
import { ListeningTranscript } from "./listening-transcript";
import { explanationWithoutEvidence } from "@/lib/ielts-bank/reading-evidence";
import { catalogQuestionTypeIds, catalogQuestionTypes } from "@/lib/ielts-bank/catalog";
import { rangeAt, savedReadingMarks } from "./reading-highlights";
import "./bank-reading-review.css";

type Props = { title: string; skill?: "Reading" | "Listening"; content: ExamContent; review: ReviewItem[]; format: string; attribution?: string; savedHighlights?: string; attemptId?: string; partNumber?: number; startedAt?: string; submittedAt?: string; backHref: string; retryHref?: string; onRetry?: () => void };

export function ReadingReview({ title, skill = "Reading", content, review, format, attribution, savedHighlights, attemptId, partNumber, startedAt, submittedAt, backHref, retryHref, onRetry }: Props) {
  const [summary, setSummary] = useState(true);
  const [guided, setGuided] = useState(false);
  const [part, setPart] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const body = useRef<HTMLDivElement>(null);
  const passagePane = useRef<HTMLElement>(null);
  const questionPane = useRef<HTMLDivElement>(null);
  const savedMarks = useMemo(() => savedReadingMarks(savedHighlights), [savedHighlights]);
  const sections = useMemo(() => {
    const reviewed = new Set(review.map((item) => item.id));
    return content.sections.map((section, originalIndex) => ({ ...section, originalIndex, questions: section.questions.filter((question) => reviewed.has(question.id)) })).filter((section) => section.questions.length);
  }, [content, review]);
  const questions = useMemo(() => sections.flatMap((section) => section.questions), [sections]);
  const numberOf = (id: string) => questions.find((item) => item.id === id)?.number ?? 0;
  const result = new Map(review.map((item) => [item.id, item]));
  const correct = review.filter((item) => item.correct).length;
  const wrong = review.filter((item) => !item.correct && item.given).length;
  const skipped = review.filter((item) => !item.given).length;
  const uncalibrated = skill === "Reading" && (/bản luyện thử|chưa hiệu chuẩn/i.test(`${title} ${attribution ?? ""}`));
  const displayTitle = displayExamTitle(title);
  const band = uncalibrated ? null : estimateBand(skill, format, correct, review.length);
  const accuracy = review.length ? Math.round(correct / review.length * 100) : 0;
  const duration = startedAt && submittedAt ? Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 60000)) : null;
  const section = sections[Math.min(part, sections.length - 1)];
  const sectionLabel = (index: number) => `${skill === "Listening" ? "Part" : "Passage"} ${content.sections.length === 1 && partNumber && partNumber > 0 ? partNumber : sections[index].originalIndex + 1}`;
  const selectedReview = active ? result.get(active) : null;
  const evidenceReview = selectedReview;
  const listeningQuote = skill === "Listening" ? evidenceReview?.explanation?.match(/^Evidence:\s*(.+)$/i)?.[1].split(" … ")[0] : null;
  const evidence = evidenceReview?.evidence ?? (listeningQuote ? { quote: listeningQuote, paragraph: "transcript" } : null);
  const evidenceQuote = evidence?.quote;
  const guidedIndex = questions.findIndex((question) => question.id === active);
  // Accuracy per question family, weakest first, so the learner knows which type to drill next.
  const byType = [...review.reduce((map, item) => {
    const id = catalogQuestionTypeIds([item.type ?? "other"])[0];
    const label = catalogQuestionTypes.find((group) => group.id === id)?.label ?? (item.type ? typeLabel(item.type) : "Other Types");
    const row = map.get(label) ?? { id, total: 0, right: 0, wrong: 0, skipped: 0 };
    row.total++; if (item.correct) row.right++; else if (item.given) row.wrong++; else row.skipped++;
    return map.set(label, row);
  }, new Map<string, { id: string; total: number; right: number; wrong: number; skipped: number }>())].sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total);
  const groups = groupQuestions(section?.questions || []);
  useEffect(() => { if (evidenceQuote) document.querySelector(".br-passage .is-evidence")?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [evidenceQuote, part]);
  useEffect(() => {
    if (summary || skill !== "Reading" || !section || !passagePane.current || !questionPane.current || !("Highlight" in window) || !(CSS as unknown as { highlights?: unknown }).highlights) return;
    const blocks = passagePane.current.querySelectorAll<HTMLElement>("[data-paragraph]");
    const passageRanges = savedMarks.filter((mark) => mark.section === section.id && mark.pane === "passage").map((mark) => {
      const block = blocks[mark.block];
      return block ? rangeAt(block, mark.start, mark.end) : null;
    }).filter((range): range is Range => Boolean(range));
    const reviewBlocks = questionPane.current.querySelectorAll<HTMLElement>("[data-review-text]");
    const questionRanges = savedMarks.filter((mark) => mark.section === section.id && mark.pane === "questions" && mark.quote).map((mark) => {
      for (const block of reviewBlocks) {
        const start = block.textContent?.indexOf(mark.quote!) ?? -1;
        if (start >= 0) return rangeAt(block, start, start + mark.quote!.length);
      }
      return null;
    }).filter((range): range is Range => Boolean(range));
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    registry.set("bank-review-mark", new (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(...passageRanges, ...questionRanges));
    return () => { registry.delete("bank-review-mark"); };
  }, [summary, skill, section, savedMarks, evidenceQuote]);
  const pick = (sectionIndex: number, questionId?: string) => {
    const targetId = questionId || (guided ? sections[sectionIndex]?.questions[0]?.id : undefined);
    setPart(sectionIndex);
    setActive(targetId || null);
    window.setTimeout(() => { document.getElementById(targetId ? `br-q-${targetId}` : "br-question-start")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  };
  const pickQuestion = (index: number) => {
    const question = questions[index];
    if (!question) return;
    pick(sections.findIndex((section) => section.questions.some((item) => item.id === question.id)), question.id);
  };
  const startGuided = () => { setGuided(true); setSummary(false); pickQuestion(0); };
  const resize = (clientX: number) => {
    const bounds = body.current?.getBoundingClientRect();
    if (bounds) setSplit(Math.max(30, Math.min(70, Math.round(((clientX - bounds.left) / bounds.width) * 100))));
  };

  // A single passage's result is named after that passage; the test name moves to the line under it.
  const onePart = sections.length === 1 ? sections[0] : null;
  const partTitle = onePart ? onePart.title.replace(/^(?:reading\s+)?(?:passage|part|section)\s*\d+\s*[:\-–—]\s*/i, "") : "";
  const level = accuracy >= 75 ? "is-good" : accuracy >= 50 ? "is-mid" : "is-low";
  const verdict = accuracy >= 75 ? "Làm tốt lắm" : accuracy >= 50 ? "Khá ổn, còn vài chỗ cần xem lại" : "Cần luyện thêm";
  const practiceHref = (kind: string) => `/app/${skill.toLowerCase()}?type=${skill === "Reading" ? "passage" : "part"}&kind=${encodeURIComponent(kind)}`;
  if (summary) return <main className={`bx-page br-summary bl-tone-${skill.toLowerCase()}`}><nav className="bx-crumbs"><Link href={backHref}><ArrowLeft size={15} /> {skill}</Link><span>/</span>Kết quả</nav>
    <section className="br-summary-card"><span className="bx-kicker">KẾT QUẢ BÀI LÀM{onePart ? ` · ${sectionLabel(0).toUpperCase()}` : ""}</span><h1>{partTitle || displayTitle}</h1><p>{partTitle ? `${displayTitle} · ` : ""}Mở lại bài để đối chiếu đáp án với {skill === "Listening" ? "transcript và âm thanh" : "từng đoạn đọc"}.</p>
      <div className={`br-result-hero ${level}`}><strong>{uncalibrated ? `${accuracy}%` : band === null ? "—" : band.toFixed(1)}<small>{uncalibrated ? "Tỉ lệ đúng" : "Band ước tính"}</small></strong><div><span>{verdict}</span><b>{correct}/{review.length} câu đúng</b><small>{accuracy}% chính xác{skipped ? ` · ${skipped} câu bỏ trống` : ""}</small></div></div>
      <div className="br-result-table-wrap"><table className="br-result-table"><caption>Chi tiết bài làm</caption><thead><tr><th>Đề</th><th>Thời gian</th><th>Ngày nộp</th><th>Tổng câu</th><th>Đúng</th><th>Sai</th><th>Bỏ qua</th><th>Tỉ lệ đúng</th></tr></thead><tbody><tr><td>{displayTitle}</td><td>{duration === null ? "—" : `${duration} phút`}</td><td>{submittedAt ? new Date(submittedAt).toLocaleDateString("vi-VN") : "—"}</td><td>{review.length}</td><td className="is-right">{correct}</td><td className="is-wrong">{wrong}</td><td>{skipped}</td><td>{review.length ? Math.round(correct / review.length * 100) : 0}%</td></tr></tbody></table></div>
      {byType.length > 1 && <div className="br-type-breakdown"><h2>Phân tích theo dạng câu hỏi</h2><p>Sắp xếp từ dạng làm yếu nhất. Ưu tiên luyện thêm các dạng dưới 60%.</p>
        <ul>{byType.map(([label, row]) => { const rate = Math.round(row.right / row.total * 100); return <li key={label} className={rate >= 75 ? "is-good" : rate >= 50 ? "is-mid" : "is-low"}>
          <span className="br-type-name">{label}</span>
          <span className="br-type-bar" aria-hidden="true"><i style={{ width: `${rate}%` }} /></span>
          <b>{row.right}/{row.total}</b><small>{rate}%{row.skipped ? ` · bỏ ${row.skipped}` : ""}</small>
          {rate < 75 && row.id !== "other" ? <Link className="br-type-practice" href={practiceHref(row.id)}>Luyện dạng này →</Link> : <span />}
        </li>; })}</ul>
      </div>}
      <div className="br-summary-actions"><button type="button" className="bx-start" onClick={() => setSummary(false)}>Xem lại bài làm <ChevronRight size={18} /></button><button type="button" className="bx-ghost" onClick={startGuided}>Ôn từng bước</button>{onRetry ? <button type="button" className="bx-ghost" onClick={onRetry}><RotateCcw size={16} /> Làm lại</button> : retryHref && <Link href={retryHref} className="bx-ghost"><RotateCcw size={16} /> Làm lại</Link>}{skill === "Reading" && attemptId && <ReadingShare attemptId={attemptId} />}</div>
      <small>{uncalibrated ? "Đề chưa hiệu chuẩn. Kết quả chỉ phản ánh số câu đúng, chưa quy đổi thành IELTS Band." : "Band chỉ là ước tính từ bài luyện tập."}</small>
    </section></main>;

  return <main className={`br-review bl-tone-${skill.toLowerCase()}`} style={{ "--br-left": `${split}%` } as CSSProperties}>
    <header className="br-review-head"><Link href={backHref} aria-label="Về ngân hàng đề"><ArrowLeft size={18} /></Link><div><strong>{displayTitle}</strong><small>{guided ? `Ôn từng bước · Câu ${guidedIndex + 1}/${questions.length}` : `Xem lại bài ${skill} · ${correct}/${review.length} câu đúng${uncalibrated ? "" : ` · Band ${band?.toFixed(1) ?? "—"}`}`}</small></div>{skill === "Reading" && attemptId && <ReadingShare attemptId={attemptId} />}{guided ? <button type="button" onClick={() => setGuided(false)}>Thoát ôn tập</button> : <button type="button" onClick={startGuided}>Ôn từng bước</button>}<button type="button" onClick={() => { setGuided(false); setSummary(true); }}>Xem kết quả</button></header>
    <div className="br-review-body" ref={body}>
      <article className="br-passage" ref={passagePane} aria-label={skill === "Listening" ? "Bản ghi và transcript" : "Bài đọc"}><span>{sectionLabel(part)}</span><h1>{section?.title}</h1>{skill === "Listening" && section?.audioUrl && <audio controls preload="metadata" src={section.audioUrl} aria-label={`Nghe lại ${section.title}`} />}{skill === "Listening" && <h2>Transcript</h2>}{skill === "Listening" && (section?.transcript ? <ListeningTranscript transcript={section.transcript} evidence={evidenceQuote} /> : <p>Part này chưa có transcript để đối chiếu.</p>)}{skill === "Reading" && section?.passage.split(/\n\s*\n/).map((paragraph, index) => { const letter = evidence?.paragraph.split("-").at(-1); const matchingParagraph = Boolean(letter && paragraph.startsWith(`**${letter}**`)); const start = evidence?.quote ? paragraph.toLowerCase().indexOf(evidence.quote.toLowerCase()) : -1; return <p key={index} data-paragraph={index} className={matchingParagraph || start >= 0 ? "is-evidence" : undefined}>{start >= 0 && evidence ? <><RichText text={paragraph.slice(0, start)} /><mark><RichText text={paragraph.slice(start, start + evidence.quote.length)} /></mark><RichText text={paragraph.slice(start + evidence.quote.length)} /></> : <RichText text={paragraph} />}</p>; })}</article>
      <div className="br-divider" role="separator" tabIndex={0} aria-label="Độ rộng bài đọc" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={split} onPointerDown={(event) => { if (window.matchMedia("(min-width: 901px)").matches) { event.currentTarget.setPointerCapture(event.pointerId); resize(event.clientX); } }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(30, Math.min(70, value + (event.key === "ArrowRight" ? 5 : -5)))); } }}><span>⋮</span></div>
      <div className="br-questions" ref={questionPane} aria-label="Câu hỏi và giải thích" id="br-question-start">{groups.map((group) => <section className="br-group" key={group.key}><h2 data-review-text>Questions {numberOf(group.questions[0].id)}–{numberOf(group.questions.at(-1)!.id)}</h2><p className="br-instructions" data-review-text><RichText text={group.instructions} /></p>{group.questions.find((question) => question.mediaUrl)?.mediaUrl && <figure className="br-group-media"><img src={group.questions.find((question) => question.mediaUrl)!.mediaUrl} alt={`Sơ đồ cho câu ${numberOf(group.questions[0].id)}–${numberOf(group.questions.at(-1)!.id)}`} /></figure>}{group.questions.map((question) => {
        const item = result.get(question.id);
        const open = active === question.id;
        const fixed = /true[_-]false/.test(question.type) ? ["TRUE", "FALSE", "NOT GIVEN"] : /yes[_-]no/.test(question.type) ? ["YES", "NO", "NOT GIVEN"] : [];
        const options = question.options.length ? question.options : fixed;
        const acceptedAnswers = question.group ? [...new Set(questions.filter((candidate) => candidate.group === question.group).flatMap((candidate) => result.get(candidate.id)?.answers || []))] : item?.answers || [];
        const explanation = open ? evidenceReview?.explanation : item?.explanation;
        const cleanExplanation = skill === "Reading" ? explanationWithoutEvidence(explanation || "") : explanation || "";
        return <div className={`br-question ${item?.correct ? "is-right" : item?.given ? "is-wrong" : "is-skipped"}`} key={question.id} id={`br-q-${question.id}`}><div className="br-question-title"><span>{numberOf(question.id)}</span><div data-review-text><RichText text={question.prompt} /></div><button type="button" aria-expanded={open} onClick={() => setActive(open ? null : question.id)}>{open ? "Ẩn giải thích" : "Xem giải thích"}</button></div>
          {options.length > 0 && <ul className="br-options">{options.map((option) => { const key = optionKey(option), chosen = item?.given && (option === item.given || key === item.given), answer = acceptedAnswers.some((value) => value === option || value === key); return <li key={option} className={`${chosen ? "is-chosen" : ""} ${answer ? "is-answer" : ""}`}><b>{key}</b><span data-review-text>{optionLabel(option) || option}</span>{chosen && <small>Bạn chọn</small>}{answer && <small>Đáp án</small>}</li>; })}</ul>}
          <div className="br-answer-feedback"><span className={item?.correct ? "is-correct" : item?.given ? "is-incorrect" : "is-empty"}>{item?.correct ? "Đúng" : item?.given ? "Sai" : "Chưa trả lời"} · Bạn: <strong>{item?.given || "—"}</strong></span><span className="is-correct">Đáp án đúng: <strong>{acceptedAnswers.join(" / ") || "—"}</strong>{question.group && " · Không cần đúng thứ tự"}</span></div>
          {open && <div className="br-explanation"><small>{typeLabel(question.type)}</small>{evidence?.quote && <blockquote><b>{guided ? "Bước 1 · Tìm dẫn chứng" : skill === "Listening" ? "Dẫn chứng trong transcript" : "Dẫn chứng trong bài đọc"}</b><br />“{evidence.quote}”</blockquote>}{guided && <b className="br-step-label">Bước 2 · Phân tích đáp án</b>}{cleanExplanation && !cleanExplanation.startsWith("Evidence:") ? <p><RichText text={cleanExplanation} /></p> : !evidence?.quote && <p>Đối chiếu đáp án với {skill === "Listening" ? "transcript bên trái" : "bài đọc bên trái"}.</p>}{guided && <div className="br-step-actions"><button type="button" disabled={guidedIndex <= 0} onClick={() => pickQuestion(guidedIndex - 1)}>Câu trước</button><button type="button" disabled={guidedIndex + 1 >= questions.length} onClick={() => pickQuestion(guidedIndex + 1)}>Câu tiếp <ChevronRight size={15} /></button></div>}</div>}
        </div>;
      })}</section>)}<div className="br-next">{part + 1 < sections.length && <button type="button" onClick={() => pick(part + 1)}>Sang {sectionLabel(part + 1)} <ChevronRight size={17} /></button>}</div></div>
    </div>
    <footer className="br-review-dock"><button type="button" disabled={part === 0} aria-label="Phần trước" onClick={() => pick(part - 1)}><ChevronLeft size={17} /></button><nav aria-label="Chọn câu hỏi">{sections.map((value, index) => { const right = value.questions.filter((question) => result.get(question.id)?.correct).length; return <div key={value.id} className={index === part ? "is-current" : "is-folded"}><button type="button" onClick={() => pick(index)} aria-label={`${sectionLabel(index)}: đúng ${right}/${value.questions.length}`}>{sectionLabel(index)}{index !== part && <small>{right}/{value.questions.length} đúng</small>}</button>{index === part && value.questions.map((question) => { const item = result.get(question.id); return <button type="button" key={question.id} className={`${item?.correct ? "is-right" : item?.given ? "is-wrong" : "is-skipped"} ${active === question.id ? "is-active" : ""}`} onClick={() => pick(index, question.id)} aria-label={`Câu ${numberOf(question.id)}: ${item?.correct ? "đúng" : item?.given ? "sai" : "bỏ qua"}`}>{numberOf(question.id)}</button>; })}</div>; })}</nav><button type="button" disabled={part + 1 === sections.length} aria-label="Phần sau" onClick={() => pick(part + 1)}><ChevronRight size={17} /></button><Link href={backHref}>Bài khác</Link></footer>
  </main>;
}
