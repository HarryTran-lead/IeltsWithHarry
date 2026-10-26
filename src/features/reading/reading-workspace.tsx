"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AArrowDown, AArrowUp, BookOpenText, Clock3, Columns2, Highlighter, ListChecks, Timer, Trash2, X } from "lucide-react";
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
const colorName: Record<HighlightColor, string> = { sun: "vàng", mint: "xanh", rose: "hồng" };

type Range = Pick<Highlight, "p" | "start" | "end">;
type Popover = { x: number; y: number; below: boolean; ranges?: Range[]; mark?: string };

/** Questions shown beside the passage in practice mode. `answered` has one entry per question, in order. */
export type ReadingPractice = { answered: boolean[]; content: React.ReactNode };

function offsetIn(element: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return range.toString().length;
}
function letter(index: number) { return index < 26 ? String.fromCharCode(65 + index) : String(index + 1); }
function clock(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

/**
 * A passage with two modes. Reading mode is a calm article view with the
 * page's tools beside it; practice mode opens a full-screen split view with
 * the passage on the left, the questions on the right and a question strip
 * at the bottom. Highlights are synced to the learner account with a scoped
 * local copy; text size is a device preference.
 */
export function ReadingWorkspace({ docKey, title, paragraphs, translation, onSelectWord, toolbar, tools, after, practice }: {
  docKey: string;
  title: string;
  paragraphs: string[];
  translation?: (index: number) => React.ReactNode;
  onSelectWord?: (word: string) => void;
  toolbar?: React.ReactNode;
  tools?: React.ReactNode;
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
  const [tab, setTab] = useState<"passage" | "questions">("passage");
  const [split, setSplit] = useState(52);
  const [seconds, setSeconds] = useState(0);
  const [popover, setPopover] = useState<Popover | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const practicing = mode === "practice";
  const total = practice?.answered.length ?? 0;
  const done = practice?.answered.filter(Boolean).length ?? 0;
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
            if (remote.updatedAt > local.updatedAt) latest = remote;
            else if (local.updatedAt && local.updatedAt > remote.updatedAt) syncLocal = true;
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
      else if (practicing) setMode("read");
    }
    function onPointer(event: PointerEvent) {
      if (popover && !(event.target as Element).closest?.(".rw-popover")) setPopover(null);
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
  }, [popover, practicing]);

  function onSelect(event: React.MouseEvent | React.TouchEvent) {
    if (!ready) return;
    const root = textRef.current;
    const selection = window.getSelection();
    if (!root || !selection) return;
    if (selection.isCollapsed || !selection.rangeCount) {
      const mark = (event.target as Element).closest?.("mark[data-hl]");
      if (mark && root.contains(mark)) {
        const rect = mark.getBoundingClientRect();
        const below = rect.top < 90;
        setPopover({ x: Math.max(72, Math.min(window.innerWidth - 72, rect.left + rect.width / 2)), y: below ? rect.bottom : rect.top, below, mark: mark.getAttribute("data-hl") ?? "" });
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
    const rect = range.getBoundingClientRect();
    const below = rect.top < 90;
    setPopover({ x: Math.max(72, Math.min(window.innerWidth - 72, rect.left + rect.width / 2)), y: below ? rect.bottom : rect.top, below, ranges });
    const word = selection.toString().trim();
    if (!practicing && onSelectWord && /^[A-Za-z][A-Za-z'-]*$/.test(word)) onSelectWord(word);
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

  function enterPractice() { setMode("practice"); setTab("passage"); setPopover(null); window.getSelection()?.removeAllRanges(); }
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

  return <div className={`rw ${readingFont.variable} ${practicing ? "is-practice" : "is-read"} ${tools ? "" : "no-tools"}`} data-tab={tab} style={{ "--rw-split": `${split}%`, "--rw-size": `${sizes[size]}px` } as React.CSSProperties}>
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
          {total > 0 && <button type="button" aria-pressed="false" onClick={enterPractice}><Columns2 size={16} /> Luyện đề · {total} câu</button>}
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
        {!practicing && <p className="rw-hint" role="status"><Highlighter size={15} /> {ready ? saveStatus === "local" ? "Bôi đen để highlight. Bản này đang lưu trên thiết bị; sẽ thử đồng bộ khi có kết nối." : saveStatus === "saving" ? "Đang đồng bộ highlight…" : "Bôi đen để highlight. Highlight tự lưu vào tài khoản của bạn." : "Đang tải highlight…"}</p>}
        {!practicing && after}
        {!practicing && total > 0 && <div className="rw-cta">
          <span className="rw-cta-icon"><Columns2 size={22} /></span>
          <div><strong>Luyện đề IELTS từ bài này</strong><span>{total} câu hỏi · màn hình chia đôi để vừa đọc vừa làm, có đồng hồ bấm giờ</span></div>
          <button type="button" className="button primary" onClick={enterPractice}>Làm bài</button>
        </div>}
      </div>
      {practicing && <div className="rw-divider" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng hai khung" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(split)} tabIndex={0}
        onPointerDown={drag} onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplit((value) => Math.max(30, value - 4)); if (event.key === "ArrowRight") setSplit((value) => Math.min(70, value + 4)); }}><i /></div>}
      <div className="rw-pane rw-side-pane" ref={sideRef}>
        {tools && <div className="rw-tools">{tools}</div>}
        {practice && <div className="rw-questions">{practice.content}</div>}
      </div>
    </div>

    {practicing && total > 0 && <nav className="rw-nav" aria-label="Đi tới câu hỏi">
      <span>Đã làm <b>{done}</b>/{total}</span>
      <div>{practice?.answered.map((answered, index) => <button type="button" key={index} className={answered ? "is-answered" : ""} onClick={() => jump(index + 1)} aria-label={`Câu ${index + 1}${answered ? ", đã trả lời" : ""}`}>{index + 1}</button>)}</div>
    </nav>}

    {popover && <div className={`rw-popover ${popover.below ? "below" : ""}`} style={{ left: popover.x, top: popover.y }} role="dialog" aria-label="Highlight">
      {highlightColors.map((color) => <button type="button" key={color} className={`rw-swatch ${color}`} onClick={() => paint(color)} aria-label={`Highlight màu ${colorName[color]}`} />)}
      {popover.mark && <button type="button" className="rw-unmark" onClick={() => { save(highlights.filter((item) => item.id !== popover.mark)); setPopover(null); }}><X size={14} /> Bỏ</button>}
    </div>}
  </div>;
}
