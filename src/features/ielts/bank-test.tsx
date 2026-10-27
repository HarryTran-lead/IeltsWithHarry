"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Eraser, Highlighter, NotebookPen, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { RichText, type BankExam } from "./bank-exam";
import { groupQuestions, QuestionGroupView, type AnswerProps } from "./bank-questions";
import "./bank-test.css";

type Mark = { section: string; paragraph: number; start: number; end: number };
const canHighlight = () => typeof window !== "undefined" && "Highlight" in window && Boolean((CSS as unknown as { highlights?: unknown }).highlights);

/** Text offset of a point inside a paragraph element, counting only text nodes. */
function offsetIn(root: Node, node: Node, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
  }
  return total;
}
function rangeAt(root: Node, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let total = 0, began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!began && start <= total + length) { range.setStart(node, start - total); began = true; }
    if (began && end <= total + length) { range.setEnd(node, end - total); return range; }
    total += length;
  }
  return null;
}

/** Plays one section's recording with ±5 s, speed and a seek bar, docked at the bottom of the test. */
function AudioDock({ src, title }: { src: string; title: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0), [duration, setDuration] = useState(0), [rate, setRate] = useState(1), [volume, setVolume] = useState(1);
  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  const skip = (seconds: number) => { if (audio.current) audio.current.currentTime = Math.max(0, Math.min(duration, audio.current.currentTime + seconds)); };
  return <div className="bt-audio" aria-label={`Bản ghi: ${title}`}>
    <audio ref={audio} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)} />
    <input className="bt-seek" type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} aria-label="Tua bản ghi" style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` } as CSSProperties} />
    <div className="bt-audio-row">
      <span className="bt-audio-time">{clock(time)} / {clock(duration)}</span>
      <label className="bt-volume"><span className="sr-only">Âm lượng</span><input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (audio.current) audio.current.volume = value; }} /></label>
      <div className="bt-audio-main">
        <button type="button" onClick={() => skip(-5)} aria-label="Lùi 5 giây"><RotateCcw size={18} /></button>
        <button type="button" className="bt-play" onClick={() => { const element = audio.current; if (!element) return; if (element.paused) void element.play(); else element.pause(); }} aria-label={playing ? "Tạm dừng" : "Phát"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
        <button type="button" onClick={() => skip(5)} aria-label="Tiến 5 giây"><RotateCw size={18} /></button>
      </div>
      <label className="bt-speed">Tốc độ <select value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (audio.current) audio.current.playbackRate = value; }}>{[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
    </div>
  </div>;
}

/**
 * Reading and Listening as on test day: a passage (or the recording) per part,
 * every question group of that part, and a part-by-part question bar.
 */
export function TestRunner({ exam, content, scope, answers, setAnswer, flags, setFlags, notes, setNotes, onFinish }: {
  exam: BankExam;
  content: ExamContent;
  scope: string[] | null;
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  flags: string[];
  setFlags: (flags: string[]) => void;
  notes: Record<string, string>;
  setNotes: (notes: Record<string, string>) => void;
  onFinish: () => void;
}) {
  const listening = exam.skill === "Listening";
  const allQuestions = useMemo(() => content.sections.flatMap((section) => section.questions), [content]);
  const numbers = useMemo(() => new Map(allQuestions.map((question, index) => [question.id, index + 1])), [allQuestions]);
  const sections = useMemo(() => content.sections.filter((section) => section.questions.length && (!scope || section.questions.some((question) => scope.includes(question.id)))), [content, scope]);
  const [part, setPart] = useState(0);
  const [scale, setScale] = useState(1);
  const [notesOpen, setNotesOpen] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selection, setSelection] = useState<{ x: number; y: number; mark: Mark } | null>(null);
  const passage = useRef<HTMLDivElement>(null);
  const section = sections[Math.min(part, sections.length - 1)];
  const groups = useMemo(() => groupQuestions(section?.questions ?? []), [section]);
  const props: AnswerProps = {
    answers, setAnswer, flags,
    toggleFlag: (id) => setFlags(flags.includes(id) ? flags.filter((item) => item !== id) : [...flags, id]),
    numberOf: (id) => numbers.get(id) ?? 0,
  };

  const goTo = useCallback((sectionIndex: number, questionId?: string) => {
    setPart(sectionIndex);
    setSelection(null);
    window.setTimeout(() => {
      const target = questionId ? document.getElementById(`q-${questionId}`) : document.querySelector(".bt-questions");
      target?.scrollIntoView({ behavior: "smooth", block: questionId ? "center" : "start" });
      (target?.querySelector("input:not([type=radio]):not([type=checkbox])") as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 60);
  }, []);

  // Paint saved highlights for the visible passage with the CSS Custom Highlight API (no DOM changes).
  useEffect(() => {
    if (!canHighlight() || !passage.current || !section) return;
    const paragraphs = passage.current.querySelectorAll<HTMLElement>("[data-paragraph]");
    const ranges = marks.filter((mark) => mark.section === section.id).map((mark) => paragraphs[mark.paragraph] ? rangeAt(paragraphs[mark.paragraph], mark.start, mark.end) : null).filter((range): range is Range => Boolean(range));
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    registry.set("bank-mark", new (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(...ranges));
    return () => { registry.delete("bank-mark"); };
  }, [marks, section, scale]);

  function captureSelection() {
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !passage.current || !section) { setSelection(null); return; }
    const range = chosen.getRangeAt(0);
    const paragraph = (range.startContainer.parentElement?.closest("[data-paragraph]") as HTMLElement | null);
    if (!paragraph || !passage.current.contains(paragraph) || !paragraph.contains(range.endContainer)) { setSelection(null); return; }
    const start = offsetIn(paragraph, range.startContainer, range.startOffset), end = offsetIn(paragraph, range.endContainer, range.endOffset);
    if (end <= start) return;
    const box = range.getBoundingClientRect();
    setSelection({ x: box.left + box.width / 2, y: box.top, mark: { section: section.id, paragraph: Number(paragraph.dataset.paragraph), start, end } });
  }

  if (!section) return <p className="bx-muted">Đề này chưa có câu hỏi.</p>;
  const label = (index: number) => listening ? `Part ${content.sections.indexOf(sections[index]) + 1}` : `Passage ${content.sections.indexOf(sections[index]) + 1}`;

  return <div className={`bt-runner ${listening ? "is-listening" : "is-reading"}`} style={{ "--bt-scale": scale } as CSSProperties}>
    <div className="bt-tools" role="toolbar" aria-label="Công cụ làm bài">
      <button type="button" onClick={() => setScale((value) => Math.max(0.85, Math.round((value - 0.1) * 10) / 10))} aria-label="Chữ nhỏ hơn"><AArrowDown size={17} /></button>
      <button type="button" onClick={() => setScale((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))} aria-label="Chữ lớn hơn"><AArrowUp size={17} /></button>
      {!listening && canHighlight() && <span className="bt-tool-hint"><Highlighter size={15} /> Bôi đen chữ trong bài đọc để tô sáng</span>}
      {marks.some((mark) => mark.section === section.id) && <button type="button" onClick={() => setMarks(marks.filter((mark) => mark.section !== section.id))}><Eraser size={16} /> Xóa tô sáng</button>}
      <button type="button" className={notesOpen ? "is-on" : ""} onClick={() => setNotesOpen(!notesOpen)}><NotebookPen size={16} /> Ghi chú</button>
    </div>

    <div className={`bt-body ${listening ? "" : "is-split"}`}>
      {!listening && <article className="bt-passage" ref={passage} onMouseUp={captureSelection} onKeyUp={captureSelection}>
        <h2>{section.title}</h2>
        {section.passage.split(/\n\s*\n/).map((paragraph, index) => <p key={index} data-paragraph={index}><RichText text={paragraph} /></p>)}
      </article>}
      <div className="bt-questions">
        {listening && <header className="bt-part-head"><span>{label(part)}</span><h2>{section.title}</h2></header>}
        {groups.map((group) => <QuestionGroupView key={group.key} group={group} props={props} />)}
        <div className="bt-part-end">{part + 1 < sections.length ? <button type="button" className="bx-next" onClick={() => goTo(part + 1)}>Sang {label(part + 1)} <ChevronRight size={17} /></button> : <button type="button" className="bx-submit" onClick={onFinish}>Hoàn thành & nộp bài</button>}</div>
      </div>
    </div>

    {selection && <div className="bt-mark-pop" style={{ left: selection.x, top: selection.y }}>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setMarks([...marks, selection.mark]); setSelection(null); window.getSelection()?.removeAllRanges(); }}><Highlighter size={15} /> Tô sáng</button>
    </div>}

    {notesOpen && <aside className="bt-notes" aria-label="Ghi chú">
      <header><b>Ghi chú</b><button type="button" onClick={() => setNotesOpen(false)} aria-label="Đóng"><X size={16} /></button></header>
      <textarea value={notes.__general || ""} maxLength={2000} onChange={(event) => setNotes({ ...notes, __general: event.target.value })} placeholder="Từ khóa, paraphrase, câu cần xem lại…" />
      <small>Ghi chú được lưu cùng bài làm.</small>
    </aside>}

    <footer className="bt-dock">
      {listening && section.audioUrl && <AudioDock key={section.id} src={section.audioUrl} title={section.title} />}
      <nav className="bt-parts" aria-label="Chọn câu hỏi">
        <button type="button" className="bt-arrow" disabled={part === 0} onClick={() => goTo(part - 1)} aria-label="Phần trước"><ChevronLeft size={18} /></button>
        <div className="bt-part-list">{sections.map((item, index) => <div key={item.id} className={`bt-part ${index === part ? "is-current" : ""}`}>
          <button type="button" className="bt-part-name" onClick={() => goTo(index)}>{label(index)}</button>
          <div>{item.questions.map((question) => <button
            type="button"
            key={question.id}
            className={`${answers[question.id] ? "is-answered" : ""} ${flags.includes(question.id) ? "is-flagged" : ""}`}
            onClick={() => goTo(index, question.id)}
            aria-label={`Câu ${numbers.get(question.id)}${answers[question.id] ? ", đã trả lời" : ""}`}
          >{numbers.get(question.id)}</button>)}</div>
        </div>)}</div>
        <button type="button" className="bt-arrow" disabled={part + 1 >= sections.length} onClick={() => goTo(part + 1)} aria-label="Phần sau"><ChevronRight size={18} /></button>
        <button type="button" className="bx-submit bt-finish" onClick={onFinish}>Hoàn thành</button>
      </nav>
    </footer>
  </div>;
}
