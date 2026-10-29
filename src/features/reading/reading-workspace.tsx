"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AArrowDown, AArrowUp, BookOpenText, Clock3, Columns2, Highlighter, ListChecks, Minimize2, PanelRightOpen, Timer, Trash2, X } from "lucide-react";
import { addHighlight, highlightColors, parseHighlightCache, parseHighlights, segments, trimRange, type Highlight, type HighlightColor } from "@/lib/highlights";
import { Literata } from "next/font/google";
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import "./reading-workspace.css";

// A book face for long passages, loaded only on pages with a reader.
const readingFont = Literata({ subsets: ["latin", "vietnamese"], variable: "--font-reading", display: "swap" });

const sizes = [15, 16, 17, 18, 20, 22, 24];
const DEFAULT_SIZE = 3;
const SIZE_KEY = "ieltswithharry-reader-size";
const TOOLS_KEY = "ieltswithharry-reader-tools";
const colorName: Record<HighlightColor, string> = { sun: "vàng", mint: "xanh", rose: "hồng" };

type Range = Pick<Highlight, "p" | "start" | "end">;
type Popover = { x: number; y: number; below: boolean; touch: boolean; ranges?: Range[]; mark?: string; word?: string };

/** Questions shown beside the passage in practice mode. `setup` opens before a news practice starts. */
export type ReadingPractice = { answered: boolean[]; content: React.ReactNode; setup?: React.ReactNode; correct?: (boolean | undefined)[] };
type PracticeClock = { elapsed: () => number; restart: () => void };
const PracticeClockContext = createContext<PracticeClock>({ elapsed: () => 0, restart: () => {} });
/** Seconds on the practice timer, and a way to start it again for a new round. */
export function usePracticeClock() { return useContext(PracticeClockContext); }
/** A panel beside the passage. Minimised panels become icons; `onSelect` panels open when the reader selects a word. */
export type ReadingTool = { id: string; label: string; icon: React.ReactNode; count?: number; onSelect?: boolean; content: React.ReactNode };

function offsetIn(element: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return range.toString().length;
}
function letter(index: number) { return index < 26 ? String.fromCharCode(65 + index) : String(index + 1); }
function clock(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
/**
 * Places the highlight menu under the selection. Browsers put their own
 * selection menus (copy, search, translate) above it, which used to cover
 * ours; it only goes above when there is no room below.
 */
function anchor(rect: DOMRect, touch: boolean): Pick<Popover, "x" | "y" | "below" | "touch"> {
  const room = window.innerHeight - rect.bottom;
  const below = room > (touch ? 110 : 70) || rect.top < 200;
  return { x: Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2)), y: below ? rect.bottom : rect.top, below, touch };
}

/**
 * A passage with two modes. Reading mode is a calm article view with the
 * page's tools beside it; practice mode opens a full-screen split view with
 * the passage on the left, the questions on the right and a question strip
 * at the bottom. Highlights are synced to the learner account with a scoped
 * local copy; text size is a device preference.
 */
export function ReadingWorkspace({ docKey, title, paragraphs, translation, onSelectWord, lookupPreview, onReadEnd, toolbar, tools, after, practice }: {
  docKey: string;
  title: string;
  paragraphs: string[];
  translation?: (index: number) => React.ReactNode;
  onSelectWord?: (word: string) => void;
  lookupPreview?: { word: string; meaning: string; loading: boolean } | null;
  onReadEnd?: () => void;
  toolbar?: React.ReactNode;
  tools?: ReadingTool[];
  after?: React.ReactNode;
  practice?: ReadingPractice;
}) {
  const textKey = paragraphs.join("\u0000");
  const text = useMemo(() => textKey.split("\u0000"), [textKey]);
  const storageKey = `ieltswithharry-highlights:${docKey}`;
  const db = useMemo(() => liveMode ? createClient() : null, []);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "local">("saving");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [mode, setMode] = useState<"read" | "practice">("read");
  const [setupOpen, setSetupOpen] = useState(false);
  const [tab, setTab] = useState<"passage" | "questions">("passage");
  const [split, setSplit] = useState(52);
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  const practiceClock = useMemo<PracticeClock>(() => ({ elapsed: () => secondsRef.current, restart: () => { secondsRef.current = 0; setSeconds(0); } }), []);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [toolsMin, setToolsMin] = useState(false);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const readEndRef = useRef<HTMLDivElement>(null);
  const readStartedAt = useRef(0);
  const readCompleted = useRef(false);
  const readSeen = useRef(new Set<number>());
  const userIdRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const practicing = mode === "practice";
  const total = practice?.answered.length ?? 0;
  const done = practice?.answered.filter(Boolean).length ?? 0;
  const graded = Boolean(practice?.correct?.length) && practice!.correct!.every((item) => item !== undefined);
  const right = practice?.correct?.filter(Boolean).length ?? 0;
  const minutes = Math.max(1, Math.round(text.join(" ").split(/\s+/).length / 200));

  const syncRemote = useCallback((userId: string, next: Highlight[], updatedAt: string) => {
    if (!db) return;
    const version = ++saveVersion.current;
    setSaveStatus("saving");
    // Serialize writes so a slow earlier request cannot replace a newer highlight.
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      try {
        const { error } = await db.from("reading_highlights").upsert({
          user_id: userId, doc_key: docKey, highlights: next, updated_at: updatedAt,
        }, { onConflict: "user_id,doc_key" });
        if (version === saveVersion.current) setSaveStatus(error ? "local" : "saved");
      } catch {
        if (version === saveVersion.current) setSaveStatus("local");
      }
    });
  }, [db, docKey]);

  // Hydrate after mount so server and first client render match. The newest
  // copy wins; a local edit made while offline is sent on the next visit.
  useEffect(() => {
    let active = true;
    void (async () => {
      let userId: string | null = null;
      if (db) {
        try { userId = (await db.auth.getUser()).data.user?.id ?? null; } catch { /* Use this device. */ }
      }
      if (!active) return;
      userIdRef.current = userId;
      const scopedKey = `${storageKey}:${userId ?? "guest"}`;
      let local = { updatedAt: "", highlights: [] as Highlight[] };
      try {
        local = parseHighlightCache(localStorage.getItem(scopedKey), text);
        const saved = localStorage.getItem(SIZE_KEY);
        if (saved !== null && Number.isInteger(Number(saved)) && Number(saved) >= 0 && Number(saved) < sizes.length) setSize(Number(saved));
        setToolsMin(localStorage.getItem(TOOLS_KEY) === "min");
      } catch { /* Private windows can block storage; the reader still works. */ }
      let latest = local;
      let status: "saved" | "local" = userId ? "saved" : "local";
      let syncLocal = false;
      if (db && userId) {
        try {
          const { data, error } = await db.from("reading_highlights").select("highlights,updated_at")
            .eq("user_id", userId).eq("doc_key", docKey).maybeSingle();
          if (!active) return;
          if (error) status = "local";
          else {
            const remote = { updatedAt: data?.updated_at ?? "", highlights: parseHighlights(JSON.stringify(data?.highlights ?? []), text) };
            const remoteTime = Date.parse(remote.updatedAt) || 0;
            const localTime = Date.parse(local.updatedAt) || 0;
            if (remoteTime > localTime) latest = remote;
            else if (localTime > remoteTime) syncLocal = true;
          }
        } catch { status = "local"; }
      }
      if (!active) return;
      setHighlights(latest.highlights);
      setSaveStatus(syncLocal ? "saving" : status);
      setReady(true);
      try { localStorage.setItem(scopedKey, JSON.stringify(latest)); } catch { /* Device storage is optional. */ }
      if (syncLocal && userId) syncRemote(userId, local.highlights, local.updatedAt);
    })();
    return () => { active = false; };
  }, [db, docKey, storageKey, syncRemote, text]);

  const save = useCallback((next: Highlight[]) => {
    setHighlights(next);
    const updatedAt = new Date().toISOString();
    const userId = userIdRef.current;
    try {
      localStorage.setItem(`${storageKey}:${userId ?? "guest"}`, JSON.stringify({ updatedAt, highlights: next }));
    } catch { /* Highlights stay for this visit. */ }
    if (userId) syncRemote(userId, next, updatedAt);
    else setSaveStatus("local");
  }, [storageKey, syncRemote]);

  function minimiseTools(next: boolean) {
    setToolsMin(next);
    setOpenTool(null);
    try { localStorage.setItem(TOOLS_KEY, next ? "min" : "full"); } catch { /* The choice stays for this visit. */ }
  }

  function resize(step: number) {
    const next = Math.min(sizes.length - 1, Math.max(0, size + step));
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* Size stays for this visit. */ }
  }

  useEffect(() => {
    if (!practicing) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.clearInterval(timer); document.body.style.overflow = overflow; };
  }, [practicing]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (popover) setPopover(null);
      else if (openTool) setOpenTool(null);
      else if (practicing) setMode("read");
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Element;
      if (popover && !target.closest?.(".rw-popover")) setPopover(null);
      // Tools stay open until the reader closes them explicitly.
    }
    function onScroll() { if (popover) setPopover(null); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [popover, practicing, openTool]);

  useEffect(() => {
    if (!onReadEnd || practicing || readCompleted.current || !readEndRef.current || !textRef.current) return;
    if (!readStartedAt.current) readStartedAt.current = Date.now();
    let visible = false;
    const finish = () => {
      if (!visible || document.visibilityState !== "visible" || readCompleted.current) return;
      if (Date.now() - readStartedAt.current < 20000) return;
      if (readSeen.current.size < Math.max(1, Math.ceil(text.length * 0.8))) return;
      readCompleted.current = true;
      onReadEnd();
    };
    const end = readEndRef.current;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === end) visible = entry.isIntersecting;
        else if (entry.isIntersecting) readSeen.current.add(Number((entry.target as HTMLElement).dataset.p));
      }
      finish();
    }, { threshold: 0.1 });
    observer.observe(readEndRef.current);
    textRef.current.querySelectorAll("p[data-p]").forEach((paragraph) => observer.observe(paragraph));
    const timer = window.setInterval(finish, 1000);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [onReadEnd, practicing, text.length]);

  function onSelect(event: React.MouseEvent | React.TouchEvent) {
    if (!ready) return;
    const root = textRef.current;
    const selection = window.getSelection();
    if (!root || !selection) return;
    if (selection.isCollapsed || !selection.rangeCount) {
      const mark = (event.target as Element).closest?.("mark[data-hl]");
      if (mark && root.contains(mark)) {
        setPopover({ ...anchor(mark.getBoundingClientRect(), event.type.startsWith("touch")), mark: mark.getAttribute("data-hl") ?? "" });
      }
      return;
    }
    const range = selection.getRangeAt(0);
    const ranges: Range[] = [];
    root.querySelectorAll<HTMLElement>("p[data-p]").forEach((element) => {
      if (!range.intersectsNode(element)) return;
      const p = Number(element.dataset.p);
      const start = element.contains(range.startContainer) ? offsetIn(element, range.startContainer, range.startOffset) : 0;
      const end = element.contains(range.endContainer) ? offsetIn(element, range.endContainer, range.endOffset) : text[p].length;
      const [from, to] = trimRange(text[p], start, end);
      if (to > from) ranges.push({ p, start: from, end: to });
    });
    if (!ranges.length) return;
    const word = selection.toString().trim();
    const lookupWord = !practicing && onSelectWord && /^[A-Za-z][A-Za-z'-]*$/.test(word) ? word.toLowerCase() : undefined;
    const position = anchor(range.getBoundingClientRect(), event.type.startsWith("touch"));
    if (lookupWord) { const margin = Math.min(170, window.innerWidth / 2); position.x = Math.max(margin, Math.min(window.innerWidth - margin, position.x)); }
    setPopover({ ...position, ranges, word: lookupWord });
    if (lookupWord && onSelectWord) {
      onSelectWord(word);
      if (toolsMin) setOpenTool(tools?.find((tool) => tool.onSelect)?.id ?? null);
    }
  }

  function paint(color: HighlightColor) {
    if (!popover) return;
    if (popover.mark) save(highlights.map((item) => item.id === popover.mark ? { ...item, color } : item));
    else {
      save((popover.ranges ?? []).reduce((list, range) => addHighlight(list, { ...range, color, id: `${range.p}:${range.start}:${range.end}` }), highlights));
      window.getSelection()?.removeAllRanges();
    }
    setPopover(null);
  }

  function enterPractice() { readStartedAt.current = 0; setMode("practice"); setTab("passage"); setPopover(null); setOpenTool(null); window.getSelection()?.removeAllRanges(); }
  function requestPractice() { if (practice?.setup) setSetupOpen(true); else enterPractice(); }
  function jump(number: number) {
    setTab("questions");
    requestAnimationFrame(() => sideRef.current?.querySelector(`[data-q="${number}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  function drag(event: React.PointerEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (!body) return;
    event.preventDefault();
    const rect = body.getBoundingClientRect();
    const move = (next: PointerEvent) => setSplit(Math.min(70, Math.max(30, ((next.clientX - rect.left) / rect.width) * 100)));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  const sizeControl = <div className="rw-size" role="group" aria-label="Cỡ chữ">
    <button type="button" onClick={() => resize(-1)} disabled={size === 0} aria-label="Giảm cỡ chữ"><AArrowDown size={18} /></button>
    <span aria-live="polite">{sizes[size]}px</span>
    <button type="button" onClick={() => resize(1)} disabled={size === sizes.length - 1} aria-label="Tăng cỡ chữ"><AArrowUp size={18} /></button>
  </div>;
  const clearControl = highlights.length > 0 && <button type="button" className="rw-clear" onClick={() => { if (window.confirm(`Xóa ${highlights.length} highlight trong bài này?`)) save([]); }} title="Xóa tất cả highlight">
    <Highlighter size={16} /> {highlights.length} <Trash2 size={14} />
  </button>;

  const flyout = tools?.find((tool) => tool.id === openTool);
  const toolPanel = tools?.length ? toolsMin ? <div className="rw-tools is-min">
    <div className="rw-rail" role="toolbar" aria-label="Công cụ đọc">
      {tools.map((tool) => <button type="button" key={tool.id} aria-pressed={openTool === tool.id} aria-label={tool.label} title={tool.label} onClick={() => setOpenTool(openTool === tool.id ? null : tool.id)}>
        {tool.icon}{tool.count ? <i>{tool.count > 99 ? "99+" : tool.count}</i> : null}</button>)}
      <button type="button" className="rw-rail-expand" onClick={() => minimiseTools(false)} aria-label="Mở rộng công cụ" title="Mở rộng công cụ"><PanelRightOpen size={17} /></button>
    </div>
    {flyout && <div className="rw-flyout" role="dialog" aria-label={flyout.label}>
      <button type="button" className="rw-flyout-close" onClick={() => setOpenTool(null)} aria-label="Đóng"><X size={16} /></button>
      {flyout.content}
    </div>}
  </div> : <div className="rw-tools">
    {tools.map((tool) => <div className="rw-tool" key={tool.id}>
      <button type="button" className="rw-tool-min" onClick={() => minimiseTools(true)} aria-label="Thu nhỏ công cụ thành biểu tượng" title="Thu nhỏ"><Minimize2 size={15} /></button>
      {tool.content}
    </div>)}
  </div> : null;

  return <div className={`rw ${readingFont.variable} ${practicing ? "is-practice" : "is-read"} ${tools?.length ? "" : "no-tools"} ${toolsMin ? "tools-min" : ""}`} data-tab={tab} style={{ "--rw-split": `${split}%`, "--rw-size": `${sizes[size]}px` } as React.CSSProperties}>
    <div className="rw-bar" role="toolbar" aria-label={practicing ? "Thanh làm bài" : "Công cụ đọc"}>
      {practicing ? <>
        <button type="button" className="rw-exit" onClick={() => setMode("read")}><X size={17} /> Thoát</button>
        <strong className="rw-title">{title}</strong>
        <span className="rw-timer" title="Thời gian làm bài"><Timer size={16} /> {clock(seconds)}</span>
        <div className="rw-tabs" role="tablist" aria-label="Chọn khung">
          <button type="button" role="tab" aria-selected={tab === "passage"} onClick={() => setTab("passage")}><BookOpenText size={15} /> Bài đọc</button>
          <button type="button" role="tab" aria-selected={tab === "questions"} onClick={() => setTab("questions")}><ListChecks size={15} /> Câu hỏi {done}/{total}</button>
        </div>
      </> : <>
        <div className="rw-modes" role="group" aria-label="Chế độ">
          <button type="button" aria-pressed="true"><BookOpenText size={16} /> Đọc</button>
          {total > 0 && <button type="button" aria-pressed="false" onClick={requestPractice}><Columns2 size={16} /> Luyện đề · {total} câu</button>}
        </div>
        <span className="rw-meta"><Clock3 size={15} /> ~{minutes} phút đọc</span>
        {toolbar}
      </>}
      <div className="rw-bar-end">{clearControl}{sizeControl}</div>
    </div>

    <div className="rw-body" ref={bodyRef}>
      <div className="rw-pane rw-passage-pane">
        {practicing && <h2 className="rw-pane-title">{title}</h2>}
        <div ref={textRef} className="rw-text" onMouseUp={onSelect} onTouchEnd={(event) => {
          // Mobile browsers finish their native text-selection gesture after touchend.
          event.persist();
          requestAnimationFrame(() => onSelect(event));
        }}>
          {text.map((paragraph, index) => <div className="rw-para" key={index}>
            <span className="rw-letter" aria-hidden="true">{letter(index)}</span>
            <p data-p={index} lang="en">{segments(paragraph, index, highlights).map((part) => part.highlight
              ? <mark key={part.start} data-hl={part.highlight.id} className={`rw-mark ${part.highlight.color}`}>{part.text}</mark>
              : <Fragment key={part.start}>{part.text}</Fragment>)}</p>
            {translation?.(index)}
          </div>)}
        </div>
        {!practicing && onReadEnd && <div ref={readEndRef} className="rw-read-end" aria-hidden="true" />}
        {!practicing && <p className="rw-hint" role="status"><Highlighter size={15} /> {ready ? saveStatus === "local" ? "Bôi đen để highlight. Bản này đang lưu trên thiết bị; sẽ thử đồng bộ khi có kết nối." : saveStatus === "saving" ? "Đang đồng bộ highlight…" : "Bôi đen để highlight. Highlight tự lưu vào tài khoản của bạn." : "Đang tải highlight…"}</p>}
        {!practicing && after}
        {!practicing && total > 0 && <div className="rw-cta">
          <span className="rw-cta-icon"><Columns2 size={22} /></span>
          <div className="rw-cta-text"><strong>Luyện đề IELTS từ bài này</strong><span>{total} câu hỏi · màn hình chia đôi để vừa đọc vừa làm, có đồng hồ bấm giờ</span></div>
          <button type="button" className="button primary" onClick={requestPractice}>Làm {total} câu</button>
        </div>}
      </div>
      {practicing && <div className="rw-divider" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng hai khung" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(split)} tabIndex={0}
        onPointerDown={drag} onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplit((value) => Math.max(30, value - 4)); if (event.key === "ArrowRight") setSplit((value) => Math.min(70, value + 4)); }}><i /></div>}
      <div className="rw-pane rw-side-pane" ref={sideRef}>
        {toolPanel}
        {practice && <div className="rw-questions"><PracticeClockContext.Provider value={practiceClock}>{practice.content}</PracticeClockContext.Provider></div>}
      </div>
    </div>

    {setupOpen && practice?.setup && <div className="rw-setup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSetupOpen(false); }}>
      <section className="rw-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="rw-setup-title" onKeyDown={(event) => { if (event.key === "Escape") setSetupOpen(false); }}>
        <button type="button" className="rw-setup-close" onClick={() => setSetupOpen(false)} aria-label="Đóng"><X size={18}/></button>
        <span className="eyebrow">LUYỆN ĐỀ IELTS</span><h2 id="rw-setup-title">Chọn dạng câu hỏi</h2>
        <p>Chọn một, nhiều hoặc tất cả các dạng được tạo cho bài đọc này.</p>
        {practice.setup}
        <div className="rw-setup-actions"><button type="button" className="button subtle" onClick={() => setSetupOpen(false)}>Để sau</button><button type="button" className="button primary" onClick={() => { setSetupOpen(false); enterPractice(); }}>Bắt đầu · {total} câu</button></div>
      </section>
    </div>}

    {practicing && total > 0 && <nav className="rw-nav" aria-label="Đi tới câu hỏi">
      {graded ? <span className="rw-nav-score">Đúng <b>{right}</b>/{total}</span> : <span>Đã làm <b>{done}</b>/{total}</span>}
      <div>{practice?.answered.map((answered, index) => {
        const result = graded ? practice.correct?.[index] : undefined;
        return <button type="button" key={index} className={result === true ? "is-right" : result === false ? "is-wrong" : answered ? "is-answered" : ""} onClick={() => jump(index + 1)}
          aria-label={`Câu ${index + 1}${result === true ? ", đúng" : result === false ? ", sai" : answered ? ", đã trả lời" : ""}`}>{index + 1}</button>;
      })}</div>
    </nav>}

    {popover && <div className={`rw-popover ${popover.below ? "below" : ""} ${popover.touch ? "touch" : ""}`} style={{ left: popover.x, top: popover.y }} role="dialog" aria-label="Highlight">
      {highlightColors.map((color) => <button type="button" key={color} className={`rw-swatch ${color}`} onClick={() => paint(color)} aria-label={`Highlight màu ${colorName[color]}`} />)}
      {popover.mark && <button type="button" className="rw-unmark" onClick={() => { save(highlights.filter((item) => item.id !== popover.mark)); setPopover(null); }}><X size={14} /> Bỏ</button>}
      {popover.word && <span className="rw-lookup-preview" role="status"><strong>{popover.word}</strong>{lookupPreview?.word === popover.word ? lookupPreview.loading ? "Đang tra nghĩa…" : lookupPreview.meaning || "Chưa có nghĩa tiếng Việt" : "Đang tra nghĩa…"}</span>}
    </div>}
  </div>;
}
