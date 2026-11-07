"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Eraser, Highlighter, NotebookPen, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { RichText, type BankExam } from "./bank-exam";
import { groupQuestions, QuestionGroupView, type AnswerProps } from "./bank-questions";
import "./bank-test.css";

type Mark = { section: string; paragraph: number; start: number; end: number };
function savedMarks(value: string | undefined): Mark[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is [string, number, number, number] => Array.isArray(item) && item.length === 4 && typeof item[0] === "string" && item.slice(1).every((part) => Number.isInteger(part) && part >= 0) && item[3] > item[2])
      .map(([section, paragraph, start, end]) => ({ section, paragraph, start, end }));
  } catch { return []; }
}
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

function printedListeningLayout(passage: string, numbers: number[], flowChart = false) {
  const block = passage.split(/(?=\*\*Questions\s+\d+[–-]\d+\*\*)/).find((chunk) => {
    const range = /^\*\*Questions\s+(\d+)[–-](\d+)\*\*/.exec(chunk.trim());
    return range && numbers[0] >= Number(range[1]) && numbers.at(-1)! <= Number(range[2]);
  });
  const lines = block?.trim().split("\n").slice(2) || [];
  const lastGap = flowChart ? lines.findLastIndex((line) => line.includes(`**${numbers.at(-1)}**`)) : -1;
  const layout = (flowChart && lastGap >= 0 ? lines.slice(0, lastGap + 1) : lines).join("\n").trim();
  return layout && numbers.every((number) => layout.includes(`**${number}**`)) ? layout : undefined;
}

/** Practice allows playback controls; exam mode starts each part once and never offers rewind. */
function AudioDock({ src, title, autoPlayNext, onEnded, examMode, started, finished, initialPosition, onStart, onProgress }: { src: string; title: string; autoPlayNext?: boolean; onEnded?: () => void; examMode: boolean; started: boolean; finished: boolean; initialPosition: number; onStart: () => void; onProgress: (seconds: number) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const savedSecond = useRef(Math.floor(initialPosition / 5) * 5);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0), [duration, setDuration] = useState(0), [rate, setRate] = useState(1), [volume, setVolume] = useState(1);
  const [playError, setPlayError] = useState("");
  useEffect(() => {
    if (autoPlayNext && !examMode) void audio.current?.play().catch(() => { /* Browser may require another tap. */ });
  }, [autoPlayNext, examMode]);
  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  const skip = (seconds: number) => { if (audio.current) audio.current.currentTime = Math.max(0, Math.min(duration, audio.current.currentTime + seconds)); };
  return <div className="bt-audio" aria-label={`Bản ghi: ${title}`}>
    <audio ref={audio} src={src} preload="metadata" onPlay={() => { setPlaying(true); setPlayError(""); if (examMode && !started) onStart(); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); onEnded?.(); }} onTimeUpdate={(event) => { const seconds = event.currentTarget.currentTime; setTime(seconds); if (examMode && !finished && Math.floor(seconds / 5) * 5 > savedSecond.current) { savedSecond.current = Math.floor(seconds / 5) * 5; onProgress(savedSecond.current); } }} onLoadedMetadata={(event) => { const length = event.currentTarget.duration || 0; setDuration(length); if (examMode && started && !finished && initialPosition > 0) event.currentTarget.currentTime = Math.min(initialPosition, Math.max(0, length - 1)); }} />
    <input className="bt-seek" type="range" min={0} max={duration || 0} step={0.1} value={time} disabled={examMode} onChange={(event) => { if (audio.current && !examMode) audio.current.currentTime = Number(event.target.value); }} aria-label={examMode ? "Tiến độ bản ghi" : "Tua bản ghi"} style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` } as CSSProperties} />
    <div className="bt-audio-row">
      <span className="bt-audio-time">{clock(time)} / {clock(duration)}</span>
      <label className="bt-volume"><span className="sr-only">Âm lượng</span><input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (audio.current) audio.current.volume = value; }} /></label>
      {examMode ? <div className="bt-audio-status" role="status">{playing ? "Đang phát bản ghi" : started && !finished ? <button type="button" onClick={() => { void audio.current?.play().catch(() => setPlayError("Không phát được âm thanh. Kiểm tra loa rồi thử lại.")); }}>Tiếp tục nghe</button> : finished ? "Đã phát bản ghi" : "Sẵn sàng phát"}</div> : <div className="bt-audio-main">
        <button type="button" onClick={() => skip(-5)} aria-label="Lùi 5 giây"><RotateCcw size={18} /></button>
        <button type="button" className="bt-play" onClick={() => { const element = audio.current; if (!element) return; if (element.paused) void element.play().catch(() => setPlayError("Không phát được âm thanh. Kiểm tra loa rồi thử lại.")); else element.pause(); }} aria-label={playing ? "Tạm dừng" : "Phát"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
        <button type="button" onClick={() => skip(5)} aria-label="Tiến 5 giây"><RotateCw size={18} /></button>
      </div>}
      {!examMode && <label className="bt-speed">Tốc độ <select value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (audio.current) audio.current.playbackRate = value; }}>{[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>}
    </div>
    {playError && (!examMode || started) && <small className="bt-audio-error" role="alert">{playError}</small>}
    {examMode && !started && <div className="bt-audio-gate" role="dialog" aria-modal="true" aria-labelledby="bt-audio-gate-title"><div><span>IELTS Listening</span><h2 id="bt-audio-gate-title">{title}</h2><p>Bản ghi sẽ phát một lần. Trong giao diện thi thật, bạn không thể tạm dừng hoặc tua lại.</p><button type="button" onClick={() => { void audio.current?.play().catch(() => setPlayError("Không phát được âm thanh. Kiểm tra loa rồi thử lại.")); }}><Play size={18} /> Phát và bắt đầu</button>{playError && <small role="alert">{playError}</small>}</div></div>}
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
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  onFinish: () => void;
}) {
  const listening = exam.skill === "Listening";
  const canMark = !listening;
  const showRail = canMark && notes.__view !== "exam";
  const allQuestions = useMemo(() => content.sections.flatMap((section) => section.questions), [content]);
  const numbers = useMemo(() => new Map(allQuestions.map((question) => [question.id, question.number])), [allQuestions]);
  const sections = useMemo(() => content.sections.filter((section) => section.questions.length && (!scope || section.questions.some((question) => scope.includes(question.id)))), [content, scope]);
  const [part, setPart] = useState(0);
  const [split, setSplit] = useState(50);
  const [autoPlayPart, setAutoPlayPart] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [notesOpen, setNotesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markError, setMarkError] = useState("");
  const [navigationError, setNavigationError] = useState("");
  const marks = useMemo(() => savedMarks(notes.reading_highlights), [notes.reading_highlights]);
  const setMarks = useCallback((next: Mark[] | ((previous: Mark[]) => Mark[])) => {
    const updated = typeof next === "function" ? next(marks) : next;
    const encoded = JSON.stringify(updated.map(({ section, paragraph, start, end }) => [section, paragraph, start, end]));
    if (encoded.length <= 1900) { setNotes({ ...notes, reading_highlights: encoded }); setMarkError(""); }
    else setMarkError("Đã đạt giới hạn tô sáng cho bài này. Xóa vài đoạn để tiếp tục.");
  }, [marks, notes, setNotes]);
  const passage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const section = sections[Math.min(part, sections.length - 1)];
  const groups = useMemo(() => groupQuestions(section?.questions ?? []), [section]);
  const props: AnswerProps = {
    answers, setAnswer, flags,
    toggleFlag: (id) => setFlags(flags.includes(id) ? flags.filter((item) => item !== id) : [...flags, id]),
    numberOf: (id) => numbers.get(id) ?? 0,
  };

  const goTo = useCallback((sectionIndex: number, questionId?: string, playNext = false) => {
    if (listening && notes.__view === "exam" && sectionIndex !== part && !playNext && section && (notes.listening_played || "").split(",").includes(section.id) && !(notes.listening_finished || "").split(",").includes(section.id)) {
      setNavigationError("Hãy nghe hết bản ghi của Part hiện tại trước khi chuyển Part.");
      return;
    }
    setNavigationError("");
    setPart(sectionIndex);
    setAutoPlayPart(playNext ? sectionIndex : null);
    window.setTimeout(() => {
      const target = questionId ? document.getElementById(`q-${questionId}`) : document.querySelector(".bt-questions");
      target?.scrollIntoView({ behavior: "smooth", block: questionId ? "center" : "start" });
      (target?.querySelector("input:not([type=radio]):not([type=checkbox])") as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 60);
  }, [listening, notes, part, section]);

  // Paint saved highlights for the visible passage with the CSS Custom Highlight API (no DOM changes).
  useEffect(() => {
    if (!canHighlight() || !passage.current || !section) return;
    const paragraphs = passage.current.querySelectorAll<HTMLElement>("[data-paragraph]");
    const ranges = marks.filter((mark) => mark.section === section.id).map((mark) => paragraphs[mark.paragraph] ? rangeAt(paragraphs[mark.paragraph], mark.start, mark.end) : null).filter((range): range is Range => Boolean(range));
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    registry.set("bank-mark", new (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(...ranges));
    return () => { registry.delete("bank-mark"); };
  }, [marks, section, scale]);

  const captureSelection = useCallback(() => {
    if (!canMark) return;
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !passage.current || !section) return;
    const range = chosen.getRangeAt(0);
    const paragraph = (range.startContainer.parentElement?.closest("[data-paragraph]") as HTMLElement | null);
    if (!paragraph || !passage.current.contains(paragraph) || !paragraph.contains(range.endContainer)) return;
    const start = offsetIn(paragraph, range.startContainer, range.startOffset), end = offsetIn(paragraph, range.endContainer, range.endOffset);
    if (end <= start) return;
    if (!canHighlight()) { setMarkError("Trình duyệt này chưa hỗ trợ tô sáng. Hãy cập nhật trình duyệt rồi thử lại."); return; }
    const mark = { section: section.id, paragraph: Number(paragraph.dataset.paragraph), start, end };
    setMarks((previous) => previous.some((item) => item.section === mark.section && item.paragraph === mark.paragraph && item.start === mark.start && item.end === mark.end) ? previous : [...previous, mark]);
    chosen.removeAllRanges();
  }, [canMark, section, setMarks]);

  useEffect(() => {
    if (!canMark) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement)?.closest("input,textarea,select,button")) return;
      const key = event.key.toLowerCase();
      if (key === "h" && !window.getSelection()?.isCollapsed) { event.preventDefault(); captureSelection(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canMark, captureSelection]);

  if (!section) return <p className="bx-muted">Đề này chưa có câu hỏi.</p>;
  const scopedPart = Number(notes.__part);
  const label = (index: number) => {
    const number = sections.length === 1 && Number.isInteger(scopedPart) && scopedPart > 0 ? scopedPart : content.sections.indexOf(sections[index]) + 1;
    return `${listening ? "Part" : "Passage"} ${number}`;
  };
  const firstNumber = numbers.get(section.questions[0]?.id) ?? 1;
  const lastNumber = numbers.get(section.questions.at(-1)?.id ?? "") ?? section.questions.length;
  const resize = (clientX: number) => {
    if (!body.current) return;
    const bounds = body.current.getBoundingClientRect();
    setSplit(Math.round(Math.max(30, Math.min(70, ((clientX - bounds.left) / bounds.width) * 100))));
  };

  return <div className={`bt-runner ${listening ? "is-listening" : "is-reading"}`} style={{ "--bt-scale": scale } as CSSProperties}>
    <div className="bt-context"><div className="bt-context-copy"><strong>{label(part)}</strong><span>{listening ? "Listen and answer" : "Read the text and answer"} questions {firstNumber}–{lastNumber}</span></div><div className="bt-tools" role="toolbar" aria-label="Công cụ làm bài">
      {!listening && <button type="button" className={settingsOpen ? "is-on" : ""} onClick={() => setSettingsOpen(!settingsOpen)}>Cài đặt</button>}
      {settingsOpen && !listening && <div className="bt-settings" role="group" aria-label="Cài đặt giao diện"><span>Cỡ chữ</span>
      <button type="button" onClick={() => setScale((value) => Math.max(0.85, Math.round((value - 0.1) * 10) / 10))} aria-label="Chữ nhỏ hơn"><AArrowDown size={17} /></button>
      <button type="button" onClick={() => setScale((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))} aria-label="Chữ lớn hơn"><AArrowUp size={17} /></button>
      {marks.some((mark) => mark.section === section.id) && <button type="button" onClick={() => setMarks(marks.filter((mark) => mark.section !== section.id))}><Eraser size={16} /> Xóa tô sáng</button>}
      </div>}
      {listening && <><button type="button" onClick={() => setScale((value) => Math.max(0.85, Math.round((value - 0.1) * 10) / 10))} aria-label="Chữ nhỏ hơn"><AArrowDown size={17} /></button><button type="button" onClick={() => setScale((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))} aria-label="Chữ lớn hơn"><AArrowUp size={17} /></button>{notes.__view !== "exam" && <button type="button" className={notesOpen ? "is-on" : ""} onClick={() => setNotesOpen(!notesOpen)}><NotebookPen size={16} /> Ghi chú</button>}</>}
    </div></div>

    <div ref={body} className={`bt-body ${listening ? "" : "is-split"} ${showRail ? "has-tools" : ""}`} style={{ "--bt-left": `${split}%` } as CSSProperties}>
      {showRail && <aside className="bt-tool-rail" aria-label="Công cụ luyện tập"><button type="button" title="Bôi đen đoạn văn để tô sáng ngay" onMouseDown={(event) => event.preventDefault()} onClick={captureSelection}><Highlighter size={19} />Tô sáng<small>Chọn chữ</small></button></aside>}
      {!listening && <article className="bt-passage" ref={passage} tabIndex={-1} onMouseUp={captureSelection}>
        <h2>{section.title}</h2>
        {section.passage.split(/\n\s*\n/).map((paragraph, index) => <p key={index} data-paragraph={index}><RichText text={paragraph} /></p>)}
      </article>}
      {!listening && <div className="bt-divider" role="separator" aria-label="Độ rộng bài đọc" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={split} tabIndex={0}
        onPointerDown={(event) => { if (window.matchMedia("(min-width: 901px)").matches) { event.currentTarget.setPointerCapture(event.pointerId); resize(event.clientX); } }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(30, Math.min(70, value + (event.key === "ArrowRight" ? 5 : -5)))); } }}><span>⋮</span></div>}
      <div className="bt-questions">
        {listening && <header className="bt-part-head"><span>{label(part)}</span><h2>{section.title}</h2></header>}
        {groups.map((group) => <QuestionGroupView key={group.key} group={group} props={props} printed={listening && (group.kind === "gap" || /flow[_-]?chart[_-]completion/.test(group.type)) ? printedListeningLayout(section.passage, group.questions.map((question) => question.number), group.kind === "pick") : undefined} />)}
        <div className="bt-part-end">{part + 1 < sections.length ? <button type="button" className="bx-next" onClick={() => goTo(part + 1)}>Sang {label(part + 1)} <ChevronRight size={17} /></button> : <button type="button" className="bx-submit" onClick={onFinish}>Hoàn thành & nộp bài</button>}</div>
      </div>
    </div>

    {markError && <p className="bt-mark-error" role="status">{markError}</p>}
    {navigationError && <p className="bt-mark-error" role="status">{navigationError}</p>}

    {notesOpen && <aside className="bt-notes" aria-label="Ghi chú">
      <header><b>Ghi chú</b><button type="button" onClick={() => setNotesOpen(false)} aria-label="Đóng"><X size={16} /></button></header>
      <textarea value={notes.__general || ""} maxLength={2000} onChange={(event) => setNotes({ ...notes, __general: event.target.value })} placeholder="Từ khóa, paraphrase, câu cần xem lại…" />
      <small>Ghi chú được lưu cùng bài làm.</small>
    </aside>}

    <footer className="bt-dock">
      {listening && section.audioUrl && <AudioDock key={section.id} src={section.audioUrl} title={section.title} examMode={notes.__view === "exam"} started={(notes.listening_played || "").split(",").includes(section.id)} finished={(notes.listening_finished || "").split(",").includes(section.id)} initialPosition={Number(notes[`listening_position_${section.id}`]) || 0} onStart={() => setNotes((current) => ({ ...current, listening_played: [...new Set([...(current.listening_played || "").split(",").filter(Boolean), section.id])].join(",") }))} onProgress={(seconds) => setNotes((current) => ({ ...current, [`listening_position_${section.id}`]: String(seconds) }))}
        autoPlayNext={autoPlayPart === part}
        onEnded={() => { if (notes.__view === "exam") { setNotes((current) => ({ ...current, listening_finished: [...new Set([...(current.listening_finished || "").split(",").filter(Boolean), section.id])].join(",") })); if (!scope && sections.length === 4 && part + 1 < sections.length) goTo(part + 1, undefined, true); } }} />}
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
