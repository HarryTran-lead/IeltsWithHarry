"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { AArrowDown, AArrowUp, BookmarkPlus, Check, ChevronLeft, ChevronRight, Eraser, Highlighter, NotebookPen, Pause, Play, RotateCcw, RotateCw, Search, Volume2, X } from "lucide-react";
import { useOptionalNotebook } from "@/features/notebook/notebook-store";
import { translateEnglishToVietnamese } from "@/lib/news/browser-translation";
import { quickDefine } from "@/lib/vocabulary/quick-define";
import type { ExamContent, ExamQuestion } from "@/lib/ielts-bank/schema";
import { RichText, type BankExam } from "./bank-exam";
import { groupQuestions, optionKey, optionLabel, QuestionGroupView, type AnswerProps } from "./bank-questions";
import { encodeReadingMarks, rangeAt, savedReadingMarks, textOffset, type ReadingMark } from "./reading-highlights";
import "./bank-test.css";

const canHighlight = () => typeof window !== "undefined" && "Highlight" in window && Boolean((CSS as unknown as { highlights?: unknown }).highlights);

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

/** A paragraph's heading slot inside the passage, as on the computer-delivered test: drop a heading here or clear it. */
export function HeadingDrop({ question, number, value, held, onPlace, onClear, onLocate }: { question: ExamQuestion; number: number; value: string; held: string | null; onPlace: (key: string) => void; onClear: () => void; onLocate: () => void }) {
  const [over, setOver] = useState(false);
  const chosen = value ? question.options.find((option) => optionKey(option) === value) : undefined;
  return <div className={`bt-heading-drop ${chosen ? "is-filled" : ""} ${over || held ? "is-over" : ""}`}
    onClick={(event) => { if (held && !(event.target as HTMLElement).closest("button")) onPlace(held); }}
    onDragOver={(event) => { event.preventDefault(); setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={(event) => { event.preventDefault(); setOver(false); const key = event.dataTransfer.getData("text/plain"); if (question.options.some((option) => optionKey(option) === key)) onPlace(key); }}>
    <button type="button" className="bt-heading-no" onClick={onLocate} title={`Đến câu ${number}`} aria-label={`Đến câu ${number}`}>{number}</button>
    {chosen ? <span><b>{optionKey(chosen)}</b> {optionLabel(chosen)}</span> : <i>{held ? "Bấm để đặt heading vào đây" : "Kéo heading vào đây"}</i>}
    {chosen && <button type="button" className="bt-heading-clear" onClick={onClear} aria-label={`Bỏ heading câu ${number}`}><X size={14} /></button>}
  </div>;
}

/** A selection worth looking up: one to three English words, returned lower-case without edge punctuation. */
function lookupWord(text: string) {
  const word = text.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").replace(/\s+/g, " ");
  return word.length <= 40 && /^[A-Za-z][A-Za-z'-]*(?: [A-Za-z][A-Za-z'-]*){0,2}$/.test(word) ? word.toLowerCase() : null;
}

/** Vietnamese meaning, pronunciation and a definition for a word picked in the passage, with "save to notebook". */
function LookupCard({ word, x, y, onClose }: { word: string; x: number; y: number; onClose: () => void }) {
  const notebook = useOptionalNotebook();
  const card = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<{ phonetic: string; part: string; definition: string; example: string } | null>(null);
  const [meaningVi, setMeaningVi] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Each source fills its part as soon as it answers; a slow translation stops waiting after 8 s.
  useEffect(() => {
    let live = true;
    void quickDefine(word).then((value) => { if (live) setFound({ phonetic: value.phonetic ?? "", part: value.part ?? "", definition: value.definition ?? "", example: value.example ?? "" }); });
    const timeout = new Promise<string[]>((resolve) => window.setTimeout(() => resolve([""]), 8000));
    void Promise.race([translateEnglishToVietnamese([word]), timeout]).then((value) => { if (live) setMeaningVi(value[0] ?? ""); }, () => { if (live) setMeaningVi(""); });
    return () => { live = false; };
  }, [word]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!card.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [onClose]);
  const already = notebook?.entries.some((entry) => entry.kind === "word" && entry.title.toLowerCase() === word);
  async function save() {
    if (!notebook || !meaningVi) return;
    setSaved("saving");
    try { await notebook.addEntry({ kind: "word", title: word, body: "", meaningVi: meaningVi.slice(0, 200), example: (found?.example ?? "").slice(0, 500) }, window.location.pathname); setSaved("saved"); }
    catch { setSaved("error"); }
  }
  const left = Math.max(12, Math.min(x - 170, (typeof window === "undefined" ? 1200 : window.innerWidth) - 352));
  const top = Math.max(12, Math.min(y + 28, (typeof window === "undefined" ? 800 : window.innerHeight) - 330));
  return <div ref={card} className="bt-lookup" role="dialog" aria-label={`Tra từ ${word}`} style={{ left, top }}>
    <header>
      <div><strong>{word}</strong>{found?.phonetic && <span>{found.phonetic}</span>}</div>
      <button type="button" aria-label="Nghe phát âm" onClick={() => { if ("speechSynthesis" in window) { const voice = new SpeechSynthesisUtterance(word); voice.lang = "en-US"; window.speechSynthesis.speak(voice); } }}><Volume2 size={17} /></button>
      <button type="button" aria-label="Đóng" onClick={onClose}><X size={17} /></button>
    </header>
    {meaningVi === null ? <p className="bt-lookup-loading" role="status">Đang dịch…</p> : meaningVi ? <p className="bt-lookup-vi">{meaningVi}</p> : <p className="bt-lookup-muted">Chưa dịch được từ này.</p>}
    {found === null ? <p className="bt-lookup-loading" role="status">Đang tra từ điển…</p> : found.definition ? <>
      <p className="bt-lookup-def">{found.part && <em>{found.part}</em>}{found.definition}</p>
      {found.example && <p className="bt-lookup-ex">“{found.example}”</p>}
    </> : <p className="bt-lookup-muted">Từ điển chưa có mục từ này.</p>}
    <footer>
      {notebook && <button type="button" disabled={!meaningVi || already || saved === "saving" || saved === "saved"} onClick={() => void save()}>{already || saved === "saved" ? <><Check size={15} /> Đã có trong Sổ tay</> : <><BookmarkPlus size={15} /> {saved === "saving" ? "Đang lưu…" : "Lưu vào Sổ tay"}</>}</button>}
      {saved === "error" && <small role="alert">Chưa lưu được.</small>}
      <small>Từ điển mở · dịch máy</small>
    </footer>
  </div>;
}

type CaretDocument = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };

/**
 * Reading and Listening as on test day: a passage (or the recording) per part,
 * every question group of that part, and a part-by-part question bar.
 */
export function TestRunner({ exam, content, scope, answers, setAnswer, flags, setFlags, notes, setNotes, onFinish, jumpTo }: {
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
  /** Set by the submit dialog to open a question; `at` makes a repeat jump to the same question fire again. */
  jumpTo?: { id: string; at: number } | null;
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
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [markError, setMarkError] = useState("");
  const [navigationError, setNavigationError] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [markPop, setMarkPop] = useState<{ x: number; y: number; mark?: ReadingMark; word?: string | null } | null>(null);
  const [lookup, setLookup] = useState<{ word: string; x: number; y: number } | null>(null);
  // The dictionary is a practice aid: the real-test view keeps the sheet clean.
  const lookupAllowed = canMark && notes.__view !== "exam";
  const closeLookup = useCallback(() => setLookup(null), []);
  const [leading, setLeading] = useState<"tight" | "normal" | "loose">("normal");
  const [pane, setPane] = useState<"passage" | "questions">("passage");
  const tools = useRef<HTMLDivElement>(null);
  // Font size and line spacing are a reader's own preference: remember them on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("ielts-reading-display") || "{}") as { scale?: number; leading?: string };
      const frame = window.requestAnimationFrame(() => {
        if (typeof saved.scale === "number" && saved.scale >= 0.85 && saved.scale <= 1.4) setScale(saved.scale);
        if (saved.leading === "tight" || saved.leading === "normal" || saved.leading === "loose") setLeading(saved.leading);
      });
      return () => window.cancelAnimationFrame(frame);
    } catch { /* Private mode: keep the defaults. */ }
  }, []);
  const saveDisplay = (next: { scale?: number; leading?: string }) => {
    try { window.localStorage.setItem("ielts-reading-display", JSON.stringify({ scale, leading, ...next })); } catch { /* Not stored. */ }
  };
  const changeScale = (value: number) => { const next = Math.max(0.85, Math.min(1.4, Math.round(value * 100) / 100)); setScale(next); saveDisplay({ scale: next }); };
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: MouseEvent) => { if (!tools.current?.contains(event.target as Node)) setSettingsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setSettingsOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [settingsOpen]);
  const marks = useMemo(() => savedReadingMarks(notes.reading_highlights), [notes.reading_highlights]);
  const setMarks = useCallback((next: ReadingMark[] | ((previous: ReadingMark[]) => ReadingMark[])) => {
    const updated = typeof next === "function" ? next(marks) : next;
    const encoded = encodeReadingMarks(updated);
    if (encoded.length <= 14000) { setNotes((current) => ({ ...current, reading_highlights: encoded })); setMarkError(""); }
    else setMarkError("Đã đạt giới hạn tô sáng cho bài này. Xóa vài đoạn để tiếp tục.");
  }, [marks, setNotes]);
  const passage = useRef<HTMLDivElement>(null);
  const questionPane = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const section = sections[Math.min(part, sections.length - 1)];
  const groups = useMemo(() => groupQuestions(section?.questions ?? []), [section]);
  // "Paragraph C" in a Matching Headings group also gets a drop slot above paragraph C of the passage.
  const headingSlots = useMemo(() => {
    const slots = new Map<string, ExamQuestion>();
    for (const question of section?.questions ?? []) {
      const letter = /matching[_-]headings/.test(question.type) ? /^\s*paragraph\s+([A-Z])\s*$/i.exec(question.prompt)?.[1] : undefined;
      if (letter && question.options.length) slots.set(letter.toUpperCase(), question);
    }
    return slots;
  }, [section]);
  const props: AnswerProps = {
    answers, setAnswer, flags,
    toggleFlag: (id) => setFlags(flags.includes(id) ? flags.filter((item) => item !== id) : [...flags, id]),
    numberOf: (id) => numbers.get(id) ?? 0,
    held, setHeld,
  };
  const headingGroupKey = (question: ExamQuestion) => groups.find((group) => group.questions.includes(question))?.key ?? "";
  const heldFor = (question: ExamQuestion) => { const key = headingGroupKey(question); return key && held?.startsWith(`${key}:`) ? held.slice(key.length + 1) : null; };

  const goTo = useCallback((sectionIndex: number, questionId?: string, playNext = false) => {
    if (listening && notes.__view === "exam" && sectionIndex !== part && !playNext && section && (notes.listening_played || "").split(",").includes(section.id) && !(notes.listening_finished || "").split(",").includes(section.id)) {
      setNavigationError("Hãy nghe hết bản ghi của Part hiện tại trước khi chuyển Part.");
      return;
    }
    setNavigationError("");
    const changed = sectionIndex !== part;
    setPart(sectionIndex);
    setAutoPlayPart(playNext ? sectionIndex : null);
    setCurrent(questionId ?? null);
    if (questionId) setPane("questions");
    if (changed) setHeld(null);
    setMarkPop(null);
    window.setTimeout(() => {
      const pane = questionPane.current;
      // Each pane scrolls on its own; scrollIntoView would also shift the fixed test sheet sideways.
      if (changed) passage.current?.scrollTo({ top: 0 });
      if (!pane) return;
      const target = questionId ? document.getElementById(`q-${questionId}`) : null;
      const scrollsItself = pane.scrollHeight > pane.clientHeight + 1;
      if (!target) { if (scrollsItself) pane.scrollTo({ top: 0, behavior: changed ? "auto" : "smooth" }); else pane.scrollIntoView({ block: "start" }); return; }
      if (scrollsItself) pane.scrollTo({ top: target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pane.clientHeight / 3, behavior: changed ? "auto" : "smooth" });
      else target.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = (target.matches("input") ? target : target.querySelector("input:not([type=radio]):not([type=checkbox])")) as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
    }, 60);
  }, [listening, notes, part, section]);

  useEffect(() => {
    if (!jumpTo) return;
    const index = sections.findIndex((item) => item.questions.some((question) => question.id === jumpTo.id));
    if (index < 0) return;
    const frame = window.requestAnimationFrame(() => goTo(index, jumpTo.id));
    return () => window.cancelAnimationFrame(frame);
    // Only a new request should move the sheet, not every re-render of goTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  // Paint saved highlights in both panes without changing the answer controls' DOM.
  useEffect(() => {
    if (!canHighlight() || !passage.current || !questionPane.current || !section) return;
    const blocks = {
      passage: passage.current.querySelectorAll<HTMLElement>("[data-paragraph]"),
      questions: questionPane.current.querySelectorAll<HTMLElement>("[data-highlight-block]"),
    };
    const ranges = marks.filter((mark) => mark.section === section.id).map((mark) => {
      const block = blocks[mark.pane][mark.block];
      return block ? rangeAt(block, mark.start, mark.end) : null;
    }).filter((range): range is Range => Boolean(range));
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    registry.set("bank-mark", new (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(...ranges));
    return () => { registry.delete("bank-mark"); };
  }, [marks, section, scale, answers]);

  const captureSelection = useCallback((force = false) => {
    if (!canMark || (!highlightEnabled && !force)) return;
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !passage.current || !questionPane.current || !section) return;
    const range = chosen.getRangeAt(0);
    const pane = passage.current.contains(range.commonAncestorContainer) ? "passage" : questionPane.current.contains(range.commonAncestorContainer) ? "questions" : null;
    if (!pane) return;
    if (!canHighlight()) { setMarkError("Trình duyệt này chưa hỗ trợ tô sáng. Hãy cập nhật trình duyệt rồi thử lại."); return; }
    const blocks = (pane === "passage" ? passage.current : questionPane.current).querySelectorAll<HTMLElement>(pane === "passage" ? "[data-paragraph]" : "[data-highlight-block]");
    const captured: ReadingMark[] = [];
    blocks.forEach((block, index) => {
      if (!range.intersectsNode(block)) return;
      const contents = document.createRange();
      contents.selectNodeContents(block);
      const portion = range.cloneRange();
      if (portion.compareBoundaryPoints(Range.START_TO_START, contents) < 0) portion.setStart(contents.startContainer, contents.startOffset);
      if (portion.compareBoundaryPoints(Range.END_TO_END, contents) > 0) portion.setEnd(contents.endContainer, contents.endOffset);
      const start = textOffset(block, portion.startContainer, portion.startOffset);
      const end = textOffset(block, portion.endContainer, portion.endOffset);
      if (end > start) captured.push({ section: section.id, pane, block: index, start, end, quote: pane === "questions" ? portion.toString().slice(0, 180) : undefined });
    });
    if (!captured.length) return;
    setMarks((previous) => [...previous, ...captured.filter((mark) => !previous.some((item) => item.section === mark.section && item.pane === mark.pane && item.block === mark.block && item.start === mark.start && item.end === mark.end))]);
    // A word or short phrase just highlighted can be looked up straight away.
    const word = lookupAllowed ? lookupWord(range.toString()) : null;
    if (word) { const box = range.getBoundingClientRect(); setMarkPop({ x: box.left + box.width / 2, y: box.top, mark: captured.length === 1 ? captured[0] : undefined, word }); }
    chosen.removeAllRanges();
  }, [canMark, highlightEnabled, section, setMarks, lookupAllowed]);

  // With the highlighter off, selecting a word only offers the dictionary.
  const offerLookup = useCallback(() => {
    if (!lookupAllowed) return;
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !passage.current?.contains(chosen.getRangeAt(0).commonAncestorContainer)) return;
    const word = lookupWord(chosen.toString());
    if (!word) return;
    const box = chosen.getRangeAt(0).getBoundingClientRect();
    setMarkPop({ x: box.left + box.width / 2, y: box.top, word });
  }, [lookupAllowed]);

  // A plain click on highlighted text offers to remove just that highlight.
  const pickMark = useCallback((x: number, y: number, target: EventTarget | null) => {
    if (!canMark || !section || !passage.current || !questionPane.current || (target as HTMLElement | null)?.closest?.("input,button,label,select,textarea,.bt-heading-drop")) { setMarkPop(null); return; }
    if (window.getSelection() && !window.getSelection()?.isCollapsed) return;
    const caret = document as CaretDocument;
    const position = caret.caretPositionFromPoint?.(x, y);
    const range = position ? null : caret.caretRangeFromPoint?.(x, y);
    const node = position?.offsetNode ?? range?.startContainer;
    const element = node ? (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element) : null;
    const inPassage = Boolean(element && passage.current.contains(element));
    const pane: ReadingMark["pane"] | null = inPassage ? "passage" : element && questionPane.current.contains(element) ? "questions" : null;
    const selector = inPassage ? "[data-paragraph]" : "[data-highlight-block]";
    const block = element?.closest<HTMLElement>(selector);
    if (!node || !pane || !block) { setMarkPop(null); return; }
    const index = [...(inPassage ? passage.current : questionPane.current).querySelectorAll(selector)].indexOf(block);
    const at = textOffset(block, node, position?.offset ?? range?.startOffset ?? 0);
    const hit = marks.find((mark) => mark.section === section.id && mark.pane === pane && mark.block === index && at >= mark.start && at <= mark.end);
    const word = hit && lookupAllowed ? lookupWord((block.textContent ?? "").slice(hit.start, hit.end)) : null;
    setMarkPop(hit ? { x, y, mark: hit, word } : null);
  }, [canMark, marks, section, lookupAllowed]);

  useEffect(() => {
    if (!markPop) return;
    const close = () => setMarkPop(null);
    const panes = [passage.current, questionPane.current];
    panes.forEach((pane) => pane?.addEventListener("scroll", close, { passive: true }));
    return () => panes.forEach((pane) => pane?.removeEventListener("scroll", close));
  }, [markPop]);

  useEffect(() => {
    if (!canMark) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.altKey || event.ctrlKey || event.metaKey || target.isContentEditable || target.closest("textarea,select,input:not([type=radio]):not([type=checkbox])")) return;
      const key = event.key.toLowerCase();
      if (key === "h") {
        event.preventDefault();
        if (window.getSelection() && !window.getSelection()?.isCollapsed) { setHighlightEnabled(true); captureSelection(true); }
        else setHighlightEnabled((enabled) => !enabled);
      }
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

  const sectionDone = section.questions.filter((question) => answers[question.id]).length;
  return <div className={`bt-runner ${listening ? "is-listening" : "is-reading"}`} style={{ "--bt-scale": scale, "--bt-leading": leading === "tight" ? 1.5 : leading === "loose" ? 1.95 : 1.7 } as CSSProperties}>
    <div className="bt-context"><div className="bt-context-copy"><strong>{label(part)}</strong><span>{listening ? "Listen and answer" : "Read the text and answer"} questions {firstNumber}–{lastNumber}</span></div><div className="bt-tools" ref={tools} role="toolbar" aria-label="Công cụ làm bài">
      {!listening && <button type="button" className={`bt-display-toggle ${settingsOpen ? "is-on" : ""}`} aria-expanded={settingsOpen} aria-label={`Hiển thị: cỡ chữ ${Math.round(scale * 100)}%`} onClick={() => setSettingsOpen(!settingsOpen)}>Aa · {Math.round(scale * 100)}%</button>}
      {settingsOpen && !listening && <div className="bt-settings" role="group" aria-label="Hiển thị">
        <div className="bt-set-block">
          <label htmlFor="bt-scale">Cỡ chữ <b>{Math.round(scale * 100)}%</b></label>
          <div className="bt-set-scale">
            <button type="button" onClick={() => changeScale(scale - 0.05)} aria-label="Chữ nhỏ hơn"><AArrowDown size={17} /></button>
            <input id="bt-scale" type="range" min={85} max={140} step={5} value={Math.round(scale * 100)} onChange={(event) => changeScale(Number(event.target.value) / 100)} />
            <button type="button" onClick={() => changeScale(scale + 0.05)} aria-label="Chữ lớn hơn"><AArrowUp size={17} /></button>
          </div>
        </div>
        <div className="bt-set-block">
          <span>Giãn dòng bài đọc</span>
          <div className="bt-seg" role="group" aria-label="Giãn dòng bài đọc">{([["tight", "Hẹp"], ["normal", "Vừa"], ["loose", "Rộng"]] as const).map(([id, name]) => <button type="button" key={id} aria-pressed={leading === id} onClick={() => { setLeading(id); saveDisplay({ leading: id }); }}>{name}</button>)}</div>
        </div>
        {marks.some((mark) => mark.section === section.id) && <div className="bt-set-line"><span><b>Tô sáng</b> · {marks.filter((mark) => mark.section === section.id).length} đoạn ở {label(part)}</span><button type="button" onClick={() => { setMarks(marks.filter((mark) => mark.section !== section.id)); setMarkPop(null); }}>Xóa hết</button></div>}
        <p className="bt-set-keys"><b>Mẹo</b><br />Bôi đen chữ để tô sáng · H: bật/tắt bút tô · bấm vào chỗ đã tô để bỏ</p>
      </div>}
      {listening && <><button type="button" onClick={() => setScale((value) => Math.max(0.85, Math.round((value - 0.1) * 10) / 10))} aria-label="Chữ nhỏ hơn"><AArrowDown size={17} /></button><button type="button" onClick={() => setScale((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))} aria-label="Chữ lớn hơn"><AArrowUp size={17} /></button>{notes.__view !== "exam" && <button type="button" className={notesOpen ? "is-on" : ""} onClick={() => setNotesOpen(!notesOpen)}><NotebookPen size={16} /> Ghi chú</button>}</>}
    </div></div>

    {!listening && <div className="bt-mobile-tabs" role="tablist" aria-label="Chế độ xem">
      <button type="button" role="tab" aria-selected={pane === "passage"} onClick={() => setPane("passage")}>Bài đọc</button>
      <button type="button" role="tab" aria-selected={pane === "questions"} onClick={() => setPane("questions")}>Câu hỏi · {sectionDone}/{section.questions.length}</button>
    </div>}
    <div ref={body} className={`bt-body ${listening ? "" : "is-split"} ${showRail ? "has-tools" : ""} shows-${pane}`} style={{ "--bt-left": `${split}%` } as CSSProperties}>
      {showRail && <aside className="bt-tool-rail" aria-label="Công cụ luyện tập"><button type="button" className={highlightEnabled ? "is-on" : ""} aria-pressed={highlightEnabled} title="Bật hoặc tắt bút tô sáng (H)" onMouseDown={(event) => event.preventDefault()} onClick={() => { if (window.getSelection() && !window.getSelection()?.isCollapsed) { setHighlightEnabled(true); captureSelection(true); } else setHighlightEnabled((enabled) => !enabled); }}><Highlighter size={19} />Tô sáng<small>{highlightEnabled ? "H · Đang bật" : "H · Đã tắt"}</small></button>
        <button type="button" className={notesOpen ? "is-on" : ""} aria-pressed={notesOpen} title="Ghi chú từ khóa, paraphrase" onClick={() => setNotesOpen(!notesOpen)}><NotebookPen size={19} />Ghi chú<small>{notes.__general ? "Đã ghi" : "Mở"}</small></button>
        {marks.some((mark) => mark.section === section.id) && <button type="button" title="Xóa mọi tô sáng của phần này" onClick={() => { setMarks(marks.filter((mark) => mark.section !== section.id)); setMarkPop(null); }}><Eraser size={19} />Xóa tô<small>{marks.filter((mark) => mark.section === section.id).length} đoạn</small></button>}
      </aside>}
      {!listening && <article className="bt-passage" ref={passage} tabIndex={-1} onMouseUp={(event) => { if (window.getSelection()?.isCollapsed) pickMark(event.clientX, event.clientY, event.target); else if (highlightEnabled) captureSelection(); else offerLookup(); }}>
        <h2>{section.title}</h2>
        {section.passage.split(/\n\s*\n/).map((paragraph, index) => {
          const letter = /^\s*\*\*([A-Z])\*\*/.exec(paragraph)?.[1];
          const slot = letter ? headingSlots.get(letter) : undefined;
          return <Fragment key={index}>
            {slot && <HeadingDrop question={slot} number={numbers.get(slot.id) ?? 0} value={answers[slot.id] || ""} held={heldFor(slot)} onPlace={(key) => { setAnswer(slot.id, key); setHeld(null); }} onClear={() => setAnswer(slot.id, "")} onLocate={() => goTo(part, slot.id)} />}
            <p data-paragraph={index}><RichText text={paragraph} /></p>
          </Fragment>;
        })}
      </article>}
      {!listening && <div className="bt-divider" role="separator" aria-label="Độ rộng bài đọc" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={split} tabIndex={0}
        onPointerDown={(event) => { if (window.matchMedia("(min-width: 901px)").matches) { event.currentTarget.setPointerCapture(event.pointerId); resize(event.clientX); } }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(30, Math.min(70, value + (event.key === "ArrowRight" ? 5 : -5)))); } }}><span>⋮</span></div>}
      <div className="bt-questions" ref={questionPane} onMouseUp={(event) => { if (window.getSelection()?.isCollapsed) pickMark(event.clientX, event.clientY, event.target); else if (highlightEnabled) captureSelection(); else offerLookup(); }} onFocus={(event) => { const id = (event.target as HTMLElement).closest("[id^='q-']")?.id.slice(2); if (id) setCurrent(id); }}>
        {listening && <header className="bt-part-head"><span>{label(part)}</span><h2>{section.title}</h2></header>}
        {groups.map((group) => <QuestionGroupView key={group.key} group={group} props={props} printed={listening && (group.kind === "gap" || /flow[_-]?chart[_-]completion/.test(group.type)) ? printedListeningLayout(section.passage, group.questions.map((question) => question.number), group.kind === "pick") : undefined} />)}
        <div className="bt-part-end">{part + 1 < sections.length ? <button type="button" className="bx-next" onClick={() => goTo(part + 1)}>Sang {label(part + 1)} <ChevronRight size={17} /></button> : <button type="button" className="bx-submit" onClick={onFinish}>Hoàn thành & nộp bài</button>}</div>
      </div>
    </div>

    {markPop && (markPop.word || markPop.mark) && <div className="bt-mark-pop" style={{ left: markPop.x, top: markPop.y }}>
      {markPop.word && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setLookup({ word: markPop.word!, x: markPop.x, y: markPop.y }); setMarkPop(null); window.getSelection()?.removeAllRanges(); }}><Search size={15} /> Tra “{markPop.word}”</button>}
      {markPop.mark && <button type="button" onClick={() => { const hit = markPop.mark!; setMarks(marks.filter((mark) => !(mark.section === hit.section && mark.pane === hit.pane && mark.block === hit.block && mark.start === hit.start && mark.end === hit.end))); setMarkPop(null); }}><Eraser size={15} /> Bỏ tô sáng</button>}
    </div>}
    {lookup && <LookupCard key={lookup.word} word={lookup.word} x={lookup.x} y={lookup.y} onClose={closeLookup} />}
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
        {/* Like the computer-delivered test: the open part lists its numbers, the others fold into "Passage 2 · 3/13". */}
        <div className="bt-part-list">{sections.map((item, index) => {
          const done = item.questions.filter((question) => answers[question.id]).length;
          return <div key={item.id} className={`bt-part ${index === part ? "is-current" : "is-folded"}`}>
            <button type="button" className="bt-part-name" onClick={() => goTo(index)} aria-label={`${label(index)}: đã làm ${done}/${item.questions.length} câu`}>{label(index)}{index !== part && <small className={done === item.questions.length ? "is-complete" : ""}>{done}/{item.questions.length}</small>}</button>
            {index === part && <div>{item.questions.map((question) => <button
              type="button"
              key={question.id}
              className={`${answers[question.id] ? "is-answered" : ""} ${flags.includes(question.id) ? "is-flagged" : ""} ${current === question.id ? "is-active" : ""}`}
              onClick={() => goTo(index, question.id)}
              aria-current={current === question.id ? "step" : undefined}
              aria-label={`Câu ${numbers.get(question.id)}${answers[question.id] ? ", đã trả lời" : ""}${flags.includes(question.id) ? ", đã đánh dấu" : ""}`}
            >{numbers.get(question.id)}</button>)}</div>}
          </div>;
        })}</div>
        <button type="button" className="bt-arrow" disabled={part + 1 >= sections.length} onClick={() => goTo(part + 1)} aria-label="Phần sau"><ChevronRight size={18} /></button>
        <button type="button" className="bx-submit bt-finish" onClick={onFinish}>Hoàn thành</button>
      </nav>
    </footer>
  </div>;
}
