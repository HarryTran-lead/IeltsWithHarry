"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AArrowDown, AArrowUp, BookOpenText, Clock3, Columns2, Highlighter, Languages, ListChecks, Minimize2, PanelRightOpen, Search, Timer, Trash2, X } from "lucide-react";
import { addHighlight, highlightColors, parseHighlightCache, parseHighlights, segments, trimRange, type Highlight, type HighlightColor } from "@/lib/highlights";
import { Literata, Nunito } from "next/font/google";
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { readingBlocks, readingComplete } from "@/lib/news/reading-progress";
import { findEvidenceLocation, type EvidenceLocation } from "@/lib/news/evidence-location";
import { readingMinutes } from "@/lib/news/daily-plan";
import { elapsedSeconds } from "@/lib/news/exam-session";
import "./reading-workspace.css";

// A book face for long passages, loaded only on pages with a reader.
const readingFont = Literata({ subsets: ["latin", "vietnamese"], variable: "--font-reading", display: "swap" });
// A rounded face for practice rounds, so the exam sheet reads soft and friendly.
const practiceFont = Nunito({ subsets: ["latin", "vietnamese"], weight: ["400", "600", "700", "800"], variable: "--font-practice", display: "swap", preload: false });

const sizes = [15, 16, 17, 18, 20, 22, 24];
const DEFAULT_SIZE = 3;
const SIZE_KEY = "ieltswithharry-reader-size";
const TOOLS_KEY = "ieltswithharry-reader-tools";
/** Screens wide enough to show the word-lookup panel beside the passage without covering it. */
const colorName: Record<HighlightColor, string> = { sun: "vàng", mint: "xanh", rose: "hồng" };

type Range = Pick<Highlight, "p" | "start" | "end">;
type Popover = { x: number; y: number; below: boolean; touch: boolean; ranges?: Range[]; mark?: string; word?: string; selectedText?: string };

/** Questions shown beside the passage in practice mode. `setup` opens before a news practice starts. */
export type ReadingPractice = { answered: boolean[]; content: React.ReactNode; setup?: React.ReactNode; correct?: (boolean | undefined)[] };
type PracticeClock = { elapsed: () => number; restart: () => void; stop: (seconds?: number) => void; resume: () => void };
const PracticeClockContext = createContext<PracticeClock>({ elapsed: () => 0, restart: () => {}, stop: () => {}, resume: () => {} });
/** Seconds on the practice timer, and ways to start it again, stop it, or carry on from where it stopped. */
export function usePracticeClock() { return useContext(PracticeClockContext); }
const EvidenceNavigationContext = createContext<((quote: string) => boolean) | null>(null);
/** Jump from a graded question's citation to its location in the passage. */
export function useReadingEvidenceNavigation() { return useContext(EvidenceNavigationContext); }
/** Word look-up shared with the question pane, so its selection popover matches the passage one. */
export type ReadingLookup = { lookUp?: (word: string, context?: string) => void; preview: { word: string; meaning: string; loading: boolean } | null; openDetails?: () => void };
const ReadingLookupContext = createContext<ReadingLookup>({ preview: null });
export function useReadingLookup() { return useContext(ReadingLookupContext); }
/** Grows a selection that starts or ends inside a word to the whole word ("tertainm" → "entertainment"). */
export function wholeWordAt(text: string, start: number, end: number) {
  const letter = /[A-Za-z'-]/;
  let from = start, to = end;
  while (from > 0 && letter.test(text[from - 1])) from -= 1;
  while (to < text.length && letter.test(text[to])) to += 1;
  const word = text.slice(from, to).replace(/^['-]+|['-]+$/g, "");
  return /^[A-Za-z][A-Za-z'-]*$/.test(word) ? word : "";
}
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
function sentenceAt(paragraph: string, offset: number) {
  const before = paragraph.slice(0, offset);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!")) + 1;
  const after = paragraph.slice(offset).search(/[.!?]/);
  return paragraph.slice(start, after < 0 ? undefined : offset + after + 1).trim().slice(0, 600);
}
/**
 * Places the highlight menu under the selection. Browsers put their own
 * selection menus (copy, search, translate) above it, which used to cover
 * ours; it only goes above when there is no room below.
 */
export function anchor(rect: DOMRect, touch: boolean): Pick<Popover, "x" | "y" | "below" | "touch"> {
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
export function ReadingWorkspace({ docKey, title, paragraphs, persist = true, sectionHeadings, translation, afterParagraph, onSelectWord, onTranslateSelection, lookupPreview, onReadEnd, onParagraphSeen, resumeAt, resumeRequested, startPractice = false, toolbar, tools, after, practice, practiceLimitSeconds, practiceStartedAt, timedPractice }: {
  docKey: string;
  title: string;
  paragraphs: string[];
  persist?: boolean;
  sectionHeadings?: Record<number,string>;
  translation?: (index: number) => React.ReactNode;
  afterParagraph?: (index: number) => React.ReactNode;
  onSelectWord?: (word: string, context?: string) => void;
  onTranslateSelection?: (text: string, paragraph: number) => Promise<string>;
  lookupPreview?: { word: string; meaning: string; loading: boolean } | null;
  onReadEnd?: () => void;
  onParagraphSeen?: (index: number) => void;
  resumeAt?: number | null;
  resumeRequested?: boolean;
  /** Open straight into practice once the questions are ready (a "Luyện lại" link). */
  startPractice?: boolean;
  toolbar?: React.ReactNode;
  tools?: ReadingTool[];
  after?: React.ReactNode;
  practice?: ReadingPractice;
  practiceLimitSeconds?: number;
  practiceStartedAt?: number;
  timedPractice?: { label: string; active?: boolean; questionCount?: number; onStart: () => Promise<boolean> | boolean | void; onExit: () => void };
}) {
  const newsReader=docKey.includes("news:");
  const textKey = paragraphs.join("\u0000");
  const text = useMemo(() => textKey.split("\u0000"), [textKey]);
  const blocks = useMemo(() => readingBlocks(text), [text]);
  const storageKey = `ieltswithharry-highlights:${docKey}`;
  const db = useMemo(() => liveMode && persist ? createClient() : null, [persist]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "local">("saving");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [mode, setMode] = useState<"read" | "practice">("read");
  const [passageWide, setPassageWide] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [timedSetup, setTimedSetup] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<"passage" | "questions">("passage");
  const [split, setSplit] = useState(52);
  const [seconds, setSeconds] = useState(0);
  const [paragraphsSeen, setParagraphsSeen] = useState(0);
  const secondsRef = useRef(0);
  const epochRef = useRef<number | null>(null);
  const stoppedRef = useRef<number | null>(null);
  const returnPosition = useRef<{ paragraph: number; top: number; scrollY: number } | null>(null);
  const [toolMenu, setToolMenu] = useState(false);
  const practiceClock = useMemo<PracticeClock>(() => ({
    elapsed: () => stoppedRef.current ?? (epochRef.current === null ? secondsRef.current : elapsedSeconds(epochRef.current)),
    restart: () => { epochRef.current = Date.now(); stoppedRef.current = null; secondsRef.current = 0; setSeconds(0); },
    stop: (value) => { const elapsed = value ?? (epochRef.current === null ? 0 : elapsedSeconds(epochRef.current)); stoppedRef.current = elapsed; secondsRef.current = elapsed; setSeconds(elapsed); },
    // Only a stopped clock moves again; a running or paused one is left as it is.
    resume: () => { if (stoppedRef.current === null) return; epochRef.current = Date.now() - stoppedRef.current * 1000; stoppedRef.current = null; },
  }), []);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [selectionTranslation, setSelectionTranslation] = useState<{ source: string; paragraph: number; result: string; error: string; busy: boolean } | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceLocation | null>(null);
  const [toolsMin, setToolsMin] = useState(newsReader);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const lookupToolId = tools?.find((tool) => tool.onSelect)?.id ?? null;
  const questionLookup = useMemo<ReadingLookup>(() => ({
    lookUp: onSelectWord,
    preview: lookupPreview ?? null,
    openDetails: lookupToolId ? () => setOpenTool(lookupToolId) : undefined,
  }), [onSelectWord, lookupPreview, lookupToolId]);
  const textRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const readCompleted = useRef(false);
  const resumeDone = useRef(false);
  const readTimes = useRef<number[]>([]);
  const readDocument = useRef("");
  const userIdRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const practicing = mode === "practice";
  const exitPractice=useCallback(()=>{if(!practiceLimitSeconds){secondsRef.current=practiceClock.elapsed();epochRef.current=null;}setMode("read");timedPractice?.onExit();},[practiceLimitSeconds,practiceClock,timedPractice]);
  const showEvidence = useCallback((quote: string) => {
    const location = findEvidenceLocation(text, quote);
    if (!location) return false;
    setPopover(null);
    setActiveEvidence(location);
    setTab("passage");
    return true;
  }, [text]);
  useEffect(() => {
    if (!practicing || !activeEvidence || tab !== "passage") return;
    const frame = requestAnimationFrame(() => {
      const target = textRef.current?.querySelector("[data-evidence]") ?? textRef.current?.querySelector(`[data-p="${activeEvidence.paragraph}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeEvidence, practicing, tab]);
  const total = practice?.answered.length ?? 0;
  const done = practice?.answered.filter(Boolean).length ?? 0;
  const graded = Boolean(practice?.correct?.length) && practice!.correct!.every((item) => item !== undefined);
  const right = practice?.correct?.filter(Boolean).length ?? 0;
  const minutes = readingMinutes(text.join(" ").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0);

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
        setToolsMin(newsReader || localStorage.getItem(TOOLS_KEY) === "min");
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
  }, [db, docKey, storageKey, syncRemote, text, newsReader]);

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
    epochRef.current ??= Date.now();
    const update = () => { const value = Math.min(practiceClock.elapsed(), practiceLimitSeconds ?? 36000); secondsRef.current = value; setSeconds(value); };
    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("pageshow", update); document.body.style.overflow = overflow; };
  }, [practicing, practiceLimitSeconds, practiceClock]);

  useEffect(() => {
    if (practiceStartedAt === undefined) return;
    epochRef.current = practiceStartedAt;
    stoppedRef.current = null;
    // A recovered timed session reopens the same workspace after reload.
    const frame=requestAnimationFrame(()=>{setSeconds(elapsedSeconds(practiceStartedAt, Date.now(), practiceLimitSeconds));setMode("practice");});
    return()=>cancelAnimationFrame(frame);
  }, [practiceStartedAt, practiceLimitSeconds]);

  useEffect(() => {
    if (practicing || !returnPosition.current) return;
    const position = returnPosition.current;
    returnPosition.current = null;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const paragraph = textRef.current?.querySelector<HTMLElement>(`[data-p="${position.paragraph}"]`);
      window.scrollTo({ top: paragraph ? window.scrollY + paragraph.getBoundingClientRect().top - position.top : position.scrollY, behavior: "instant" });
    }));
    return () => cancelAnimationFrame(frame);
  }, [practicing]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (popover) setPopover(null);
      else if (openTool) setOpenTool(null);
      else if (toolMenu) setToolMenu(false);
      else if (timedSetup) setTimedSetup(false);
      else if (practicing) exitPractice();
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Element;
      if (popover && !target.closest?.(".rw-popover")) setPopover(null);
      // While practising, tapping another word in the passage updates the open lookup panel instead of closing it.
      if (openTool && !target.closest?.(practicing ? ".rw-tools, .rw-lookup-toggle, .rw-text" : ".rw-tools, .rw-lookup-toggle")) setOpenTool(null);
      if (toolMenu && !target.closest?.(".rw-options")) setToolMenu(false);
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
  }, [popover, practicing, openTool, timedPractice, toolMenu, timedSetup, exitPractice]);

  useEffect(() => {
    const identity = `${docKey}\u0000${textKey}`;
    if (readDocument.current !== identity) {
      readDocument.current = identity;
      readTimes.current = blocks.map(() => 0);
      readCompleted.current = false;
    }
    if (!onReadEnd || practicing || readCompleted.current || !textRef.current || !blocks.length) return;
    const paragraphElements = Array.from(textRef.current.querySelectorAll<HTMLElement>("p[data-p]"));
    let previous = performance.now();
    const tick = () => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      // Delayed timers cannot credit time spent in another tab or app.
      if (elapsed > 750 || document.visibilityState !== "visible" || !document.hasFocus()) return;
      const viewportHeight = window.innerHeight;
      const rects = paragraphElements.map((paragraph) => paragraph.getBoundingClientRect());
      for (const [index, block] of blocks.entries()) {
        if (readTimes.current[index] >= block.targetMs) continue;
        const rect = rects[block.paragraphIndex];
        if (!rect || rect.height <= 0) continue;
        const bandHeight = rect.height / block.count;
        const top = rect.top + bandHeight * block.blockIndex;
        const visibleHeight = Math.min(top + bandHeight, viewportHeight) - Math.max(top, 0);
        if (visibleHeight >= Math.min(bandHeight, viewportHeight) * 0.5) {
          readTimes.current[index] = Math.min(block.targetMs, readTimes.current[index] + elapsed);
          // A large viewport cannot earn time for several blocks simultaneously.
          break;
        }
      }
      if (readingComplete(blocks, readTimes.current)) {
        readCompleted.current = true;
        onReadEnd();
      }
    };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [blocks, docKey, onReadEnd, practicing, textKey]);

  useEffect(() => {
    if (!onParagraphSeen || practicing || !textRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        const index = Number((entry.target as HTMLElement).dataset.p);
        if (!Number.isInteger(index)) continue;
        setParagraphsSeen((count) => Math.max(count, index + 1));
        onParagraphSeen(index);
      }
    }, { threshold: 0.4 });
    textRef.current.querySelectorAll("p[data-p]").forEach((paragraph) => observer.observe(paragraph));
    return () => observer.disconnect();
  }, [onParagraphSeen, practicing, text.length]);

  useEffect(() => {
    if (resumeDone.current || !resumeRequested || resumeAt == null || practicing || resumeAt < 0 || resumeAt >= text.length) return;
    resumeDone.current = true;
    const frame = requestAnimationFrame(() => textRef.current?.querySelector(`[data-p="${resumeAt}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [resumeAt, resumeRequested, practicing, text.length]);

  function onSelect(event: React.MouseEvent | React.TouchEvent) {
    if (!ready) return;
    if ((event.target as Element).closest?.(".rw-inline-translation")) return;
    const root = textRef.current;
    const selection = window.getSelection();
    if (!root || !selection) return;
    if (selection.isCollapsed || !selection.rangeCount) {
      const mark = (event.target as Element).closest?.("mark[data-hl]");
      if (mark && root.contains(mark)) {
        setPopover({ ...anchor(mark.getBoundingClientRect(), event.type.startsWith("touch")), mark: mark.getAttribute("data-hl") ?? "" });
      } else if (onSelectWord && "clientX" in event) {
        const point = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        const node = point?.startContainer;
        if (node?.nodeType === Node.TEXT_NODE && root.contains(node)) {
          const source = node.textContent ?? "";
          const offset = point?.startOffset ?? 0;
          const word = [...source.matchAll(/[A-Za-z][A-Za-z'-]*/g)].find((match) => match.index <= offset && offset < match.index + match[0].length);
          if (word) {
            const wordRange = document.createRange();
            wordRange.setStart(node, word.index);
            wordRange.setEnd(node, word.index + word[0].length);
            const position = anchor(wordRange.getBoundingClientRect(), false);
            const margin = Math.min(170, window.innerWidth / 2);
            position.x = Math.max(margin, Math.min(window.innerWidth - margin, position.x));
            setSelectionTranslation(null);
            setPopover({ ...position, word: word[0].toLowerCase() });
            const paragraph = node.parentElement?.closest<HTMLElement>("p[data-p]");
            const index = Number(paragraph?.getAttribute("data-p"));
            onSelectWord(word[0], paragraph && Number.isInteger(index) ? sentenceAt(text[index], offsetIn(paragraph, node, offset)) : undefined);
          }
        }
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
    // A drag that cuts a word ("tertainm") looks up the whole word it sits in.
    const firstRange = ranges[0];
    const fullWord = ranges.length === 1 && /^[A-Za-z'-]+$/.test(word) ? wholeWordAt(text[firstRange.p], firstRange.start, firstRange.end) : "";
    const lookupWord = onSelectWord && fullWord ? fullWord.toLowerCase() : undefined;
    const position = anchor(range.getBoundingClientRect(), event.type.startsWith("touch"));
    if (lookupWord || onTranslateSelection) { const margin = Math.min(onTranslateSelection ? 220 : 170, window.innerWidth / 2); position.x = Math.max(margin, Math.min(window.innerWidth - margin, position.x)); }
    setSelectionTranslation(null);
    setPopover({ ...position, ranges, word: lookupWord, selectedText: word });
    if (lookupWord && onSelectWord) {
      const first = ranges[0];
      onSelectWord(fullWord, sentenceAt(text[first.p], first.start));
      // On every screen size the popover shows the meaning first; the full lookup panel opens only from "Xem chi tiết".
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

  async function translateSelection(retry?: { source: string; paragraph: number }) {
    const source = retry?.source ?? popover?.selectedText;
    const paragraph = retry?.paragraph ?? popover?.ranges?.[0]?.p;
    if (!source || paragraph === undefined || !onTranslateSelection || selectionTranslation?.busy) return;
    setPopover(null);
    setSelectionTranslation({ source, paragraph, result: "", error: "", busy: true });
    try {
      const result = await onTranslateSelection(source, paragraph);
      setSelectionTranslation({ source, paragraph, result, error: "", busy: false });
    } catch (error) {
      setSelectionTranslation({ source, paragraph, result: "", error: error instanceof Error ? error.message : "Chưa dịch được đoạn đã chọn.", busy: false });
    }
  }

  function enterPractice() {
    const paragraphs = Array.from(textRef.current?.querySelectorAll<HTMLElement>("p[data-p]") ?? []);
    const visible = paragraphs.find((item) => item.getBoundingClientRect().bottom > 140);
    returnPosition.current = { paragraph: Number(visible?.dataset.p ?? 0), top: visible?.getBoundingClientRect().top ?? 140, scrollY: window.scrollY };
    if(!practiceLimitSeconds&&stoppedRef.current===null)epochRef.current=Date.now()-secondsRef.current*1000;
    epochRef.current ??= Date.now();
    setMode("practice"); setPassageWide(false); setTab("passage"); setActiveEvidence(null); setPopover(null); setOpenTool(null); window.getSelection()?.removeAllRanges();
  }
  async function enterTimedPractice() {
    if (!total || !timedPractice || starting) return;
    setStarting(true);
    try { if (await timedPractice.onStart() === false) return; setTimedSetup(false); enterPractice(); }
    finally { setStarting(false); }
  }
  function requestPractice() { if (practice?.setup) setSetupOpen(true); else enterPractice(); }
  const startDone = useRef(false);
  useEffect(() => {
    if (startDone.current || !startPractice || practicing || !total) return;
    startDone.current = true;
    if (!practiceLimitSeconds && stoppedRef.current === null) epochRef.current = Date.now() - secondsRef.current * 1000;
    epochRef.current ??= Date.now();
    setMode("practice"); setTab("passage");
  }, [startPractice, practicing, total, practiceLimitSeconds]);
  function jump(number: number) {
    setPassageWide(false);
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
      <div className="rw-tool-switch">{tools.map((tool)=><button type="button" key={tool.id} aria-pressed={tool.id===openTool} onClick={()=>setOpenTool(tool.id)}>{tool.icon}{newsReader?(tool.id==="saved"?"Sổ từ":"Tra từ"):tool.label}</button>)}</div>
      {flyout.content}
    </div>}
  </div> : <div className="rw-tools">
    {tools.map((tool) => <div className="rw-tool" key={tool.id}>
      <button type="button" className="rw-tool-min" onClick={() => minimiseTools(true)} aria-label="Thu nhỏ công cụ thành biểu tượng" title="Thu nhỏ"><Minimize2 size={15} /></button>
      {tool.content}
    </div>)}
  </div> : null;

  return <div className={`rw ${newsReader?"is-news":""} ${readingFont.variable} ${practiceFont.variable} ${practicing ? "is-practice" : "is-read"} ${passageWide ? "is-passage-wide" : ""} ${tools?.length ? "" : "no-tools"} ${toolsMin ? "tools-min" : ""}`} data-tab={tab} style={{ "--rw-split": `${split}%`, "--rw-size": `${sizes[size]}px` } as React.CSSProperties}>
    <div className="rw-bar" role="toolbar" aria-label={practicing ? "Thanh làm bài" : "Công cụ đọc"}>
      {practicing ? <>
        <button type="button" className="rw-exit" onClick={exitPractice}><X size={17} /> Thoát</button>
        <strong className="rw-title">{title}</strong>
        <span className="rw-timer" title={practiceLimitSeconds ? "Thời gian còn lại" : "Thời gian làm bài"}><Timer size={16} /> {clock(practiceLimitSeconds ? Math.max(0, practiceLimitSeconds - seconds) : seconds)}</span>
        {tools?.length ? <button type="button" className="rw-wide-toggle rw-lookup-toggle" aria-pressed={Boolean(openTool)} aria-label="Tra từ" onClick={() => setOpenTool(openTool ? null : lookupToolId ?? tools[0].id)}><Search size={15} />Tra từ</button> : null}
        <button type="button" className="rw-wide-toggle" aria-pressed={passageWide} onClick={() => { setPassageWide((value) => !value); setTab("passage"); }}>{passageWide ? <Columns2 size={15} /> : <BookOpenText size={15} />}{passageWide ? "Chia đôi" : "Xem toàn bài"}</button>
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
        {timedPractice && <button className="button subtle rw-timed-start" type="button" disabled={!total} onClick={() => setTimedSetup(true)}>{total ? timedPractice.label : "Chưa có đề luyện"}</button>}
        {tools?.length ? <button type="button" className="button subtle rw-lookup-toggle" aria-label="Tra từ và sổ từ" onClick={() => { setToolsMin(true); setOpenTool(openTool ? null : tools[0].id); }}><BookOpenText size={16}/>Tra cứu</button> : null}
        {!newsReader&&toolbar}
      </>}
      <div className="rw-bar-end">{practicing || !newsReader ? <>{clearControl}{sizeControl}</> : <div className="rw-options"><button className="button subtle" type="button" aria-expanded={toolMenu} onClick={() => setToolMenu(!toolMenu)}>Tùy chọn</button>{toolMenu && <div className="rw-options-menu">{toolbar}{sizeControl}{clearControl}</div>}</div>}</div>
    </div>

    <div className="rw-body" ref={bodyRef}>
      <div className="rw-pane rw-passage-pane">
        {practicing && <h2 className="rw-pane-title">{title}</h2>}
        {practicing && <p className="rw-scroll-hint">{practiceLimitSeconds ? "Mô phỏng 20 phút: đọc bài và trả lời câu hỏi trong thời gian còn lại." : "Cuộn trong khung này để xem hết bài đọc. Nhấn vào một từ để xem nghĩa."}</p>}
        {!practicing && onParagraphSeen && text.length > 1 && <div className="rw-reading-progress" role="status" aria-label={`Đã xem đến đoạn ${Math.max(paragraphsSeen, resumeAt == null ? 0 : resumeAt + 1)} trên ${text.length}`}><span>Vị trí đã xem</span><div aria-hidden="true">{text.map((_, index) => <i key={index} className={index < Math.max(paragraphsSeen, resumeAt == null ? 0 : resumeAt + 1) ? "seen" : ""} />)}</div><strong>{Math.max(paragraphsSeen, resumeAt == null ? 0 : resumeAt + 1)}/{text.length} đoạn</strong></div>}
        <div ref={textRef} className="rw-text" onMouseUp={onSelect} onTouchEnd={(event) => {
          // Mobile browsers finish their native text-selection gesture after touchend.
          event.persist();
          requestAnimationFrame(() => onSelect(event));
        }}>
          {text.map((paragraph, index) => <div className="rw-para" key={index}>
            <span className="rw-letter" aria-hidden="true">{letter(index)}</span>
            {!practicing&&sectionHeadings?.[index]&&<h2 className="rw-section-title">{sectionHeadings[index]}</h2>}
            <p data-p={index} lang="en">{segments(paragraph, index, activeEvidence?.paragraph === index
              ? addHighlight(highlights, { id: "active-evidence", p: index, start: activeEvidence.start, end: activeEvidence.end, color: "sun" }) : highlights).map((part) => part.highlight
              ? <mark key={part.start} data-hl={part.highlight.id} data-evidence={part.highlight.id === "active-evidence" ? "true" : undefined} className={`rw-mark ${part.highlight.id === "active-evidence" ? "rw-evidence" : part.highlight.color}`}>{part.text}</mark>
              : <Fragment key={part.start}>{part.text}</Fragment>)}</p>
            {translation?.(index)}
            {!practicing && afterParagraph?.(index)}
            {selectionTranslation?.paragraph === index && <aside className="rw-inline-translation" lang="vi" aria-live="polite">
              <div><strong>Bản dịch câu chứa phần bạn chọn</strong><button type="button" onClick={() => setSelectionTranslation(null)}>Ẩn</button></div>
              {selectionTranslation.busy ? <p>Đang dịch…</p> : selectionTranslation.error
                ? <p role="alert">{selectionTranslation.error} <button type="button" onClick={() => void translateSelection(selectionTranslation)}>Thử lại</button></p>
                : <p>{selectionTranslation.result}</p>}
            </aside>}
          </div>)}
        </div>
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
        {!practicing && toolPanel}
        {practice && <div className="rw-questions"><PracticeClockContext.Provider value={practiceClock}><EvidenceNavigationContext.Provider value={showEvidence}><ReadingLookupContext.Provider value={questionLookup}>{practice.content}</ReadingLookupContext.Provider></EvidenceNavigationContext.Provider></PracticeClockContext.Provider></div>}
      </div>
    </div>

    {timedSetup && <div className="rw-setup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) setTimedSetup(false); }}><section className="rw-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="timed-title"><button type="button" className="rw-setup-close" disabled={starting} onClick={() => setTimedSetup(false)} aria-label="Đóng"><X size={16}/></button><h2 id="timed-title">Luyện một bài đọc · 20 phút</h2><p>{timedPractice?.questionCount ?? total} câu hỏi từ bài này. Đây là lượt luyện một passage, không phải đề IELTS đầy đủ và không quy đổi band.</p><p>Không dùng dịch hoặc tra từ. Thời gian vẫn chạy khi đổi tab hoặc thoát màn luyện. Đáp án được tự lưu; tải lại sẽ khôi phục lượt đang làm. Hết giờ chỉ chấm bản nháp máy chủ đã nhận đúng hạn; hệ thống thử nộp khi tab hoạt động. Câu trống tính sai.</p><button type="button" className="button primary" disabled={starting} onClick={() => void enterTimedPractice()}>{starting ? "Đang mở lượt làm…" : "Bắt đầu / tiếp tục lượt đang làm"}</button></section></div>}
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

    {/* Untimed practice keeps the lookup: a floating panel over the questions. Timed practice passes no tools. */}
    {practicing && flyout && <div className="rw-tools rw-practice-tools"><div className="rw-flyout" role="dialog" aria-label={flyout.label}>
      <button type="button" className="rw-flyout-close" onClick={() => setOpenTool(null)} aria-label="Đóng"><X size={16} /></button>
      {tools && tools.length > 1 && <div className="rw-tool-switch">{tools.map((tool)=><button type="button" key={tool.id} aria-pressed={tool.id===openTool} onClick={()=>setOpenTool(tool.id)}>{tool.icon}{newsReader?(tool.id==="saved"?"Sổ từ":"Tra từ"):tool.label}</button>)}</div>}
      {flyout.content}
    </div></div>}

    {popover && <div className={`rw-popover ${popover.below ? "below" : ""} ${popover.touch ? "touch" : ""}`} style={{ left: popover.x, top: popover.y }} role="dialog" aria-label="Highlight">
      {highlightColors.map((color) => <button type="button" key={color} className={`rw-swatch ${color}`} onClick={() => paint(color)} aria-label={`Highlight màu ${colorName[color]}`} />)}
      {popover.mark && <button type="button" className="rw-unmark" onClick={() => { save(highlights.filter((item) => item.id !== popover.mark)); setPopover(null); }}><X size={14} /> Bỏ</button>}
      {popover.selectedText && onTranslateSelection && <button type="button" className="rw-translate-selection" disabled={popover.selectedText.length > 3500 || selectionTranslation?.busy} onClick={() => void translateSelection()} title={popover.selectedText.length > 3500 ? "Chọn tối đa 3.500 ký tự để dịch" : "Dịch câu chứa phần đã chọn"}><Languages size={14} /> {selectionTranslation?.busy ? "Đang dịch…" : "Dịch câu"}</button>}
      {popover.word && (() => {
        const meaning = lookupPreview?.word === popover.word ? lookupPreview.loading ? "Đang tra nghĩa…" : lookupPreview.meaning || "Chưa có nghĩa tiếng Việt" : "Đang tra nghĩa…";
        return lookupToolId && (toolsMin || practicing) && openTool !== lookupToolId
          ? <button type="button" className="rw-lookup-preview is-action" onClick={() => { setOpenTool(lookupToolId); setPopover(null); }} title="Mở bảng tra từ đầy đủ"><strong>{popover.word}</strong>{meaning}<small>Xem chi tiết ›</small></button>
          : <span className="rw-lookup-preview" role="status"><strong>{popover.word}</strong>{meaning}</span>;
      })()}
    </div>}
  </div>;
}
