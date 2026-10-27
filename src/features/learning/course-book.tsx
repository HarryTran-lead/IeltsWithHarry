"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AArrowDown, AArrowUp, Bookmark, BookmarkCheck, BookMarked, BookOpen, ChevronLeft, ChevronRight, List, Maximize2, Minimize2, Sparkles, StickyNote, Trash2, Type, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { stages } from "@/lib/demo-data";
import type { StageCourse } from "./stage-courses";
import { useNotebook } from "@/features/notebook/notebook-store";
import { BookWorkbook } from "./course-book-lesson";
import { BookPanel, type BookMark, type PanelTab } from "./course-book-panel";
import { loadPracticeResults, subscribePracticeResults, type PracticeResult } from "./practice-results";
import { BookPageView, describePage, splitUnitTitle, unitColor, unitLabel, type BookContent, type BookContext, type BookLesson, type BookPage } from "./course-book-pages";
import "./course-book.css";
import "./course-book-tools.css";

const PAGE_W = 540;
const PAGE_H = 740;
const FLIP_MS = 760;

type Flip = { dir: 1 | -1; from: number; to: number; riffle: number };
type OpenItem = { kind: "lesson"; slug: string } | { kind: "check"; slug: string; title: string };
const ZOOMS = [1, 1.5, 2, 2.5];
const BOOKMARK_PREFIX = "Dấu trang";

/** Reads "l=<lesson>" or "c=<check>&t=<title>" from the hash, so a reload reopens the workbook. */
function openFromHash(): OpenItem | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const lesson = params.get("l");
  if (lesson) return { kind: "lesson", slug: lesson };
  const check = params.get("c");
  return check ? { kind: "check", slug: check, title: params.get("t") ?? "Bài kiểm tra" } : null;
}

/** Lays the course out as printed pages: cover, guide, contents, then per unit an opener spread and one spread per lesson. */
function buildPages(course: StageCourse) {
  const pages: BookPage[] = [{ kind: "cover" }, { kind: "guide" }, { kind: "contents" }];
  const unitStart = new Map<string, number>();
  const lessonStart = new Map<string, number>();
  course.units.forEach((unit, unitIndex) => {
    unitStart.set(unit.id, pages.length);
    pages.push({ kind: "unit-art", unit, unitIndex }, { kind: "unit-overview", unit, unitIndex });
    unit.lessons.forEach((lesson, lessonIndex) => {
      lessonStart.set(lesson.id, pages.length);
      pages.push({ kind: "lesson-open", unit, unitIndex, lesson, lessonIndex }, { kind: "lesson-practice", unit, unitIndex, lesson, lessonIndex });
    });
  });
  const finishPage = pages.length;
  pages.push({ kind: "finish" }, { kind: "certificate" }, { kind: "back" });
  return { pages, unitStart, lessonStart, finishPage };
}

// Page 0 is the cover on its own; spread s then shows pages 2s-1 (left) and 2s (right).
const spreadOf = (page: number) => Math.floor((page + 1) / 2);
const spreadPages = (spread: number, last: number): [number | null, number | null] => [spread === 0 ? null : 2 * spread - 1, 2 * spread <= last ? 2 * spread : null];
const firstPageOf = (spread: number) => (spread === 0 ? 0 : 2 * spread - 1);

/** Stacked paper edges: thicker on the side that holds more pages. */
function paperEdge(count: number, side: "left" | "right") {
  const sign = side === "left" ? -1 : 1;
  const layers = Array.from({ length: count }, (_, i) => `${sign * (i + 1)}px ${i * 0.5}px 0 ${i % 2 ? "#fffdf7" : "#e2d9c4"}`);
  return [...layers, "0 18px 36px -20px rgba(60, 40, 10, 0.45)"].join(", ");
}

function useLessonContents(lessonIds: string[]) {
  const [contents, setContents] = useState<Record<string, BookContent | null>>({});
  const requested = useRef(new Set<string>());
  const key = lessonIds.join(",");
  useEffect(() => {
    const missing = key.split(",").filter((id) => id && !requested.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requested.current.add(id));
    const settle = (rows: { lesson_id: string; content: BookContent }[]) => setContents((previous) => {
      const next = { ...previous };
      for (const id of missing) next[id] = null;
      for (const row of rows) next[row.lesson_id] = row.content;
      return next;
    });
    let client: ReturnType<typeof createClient>;
    try { client = createClient(); } catch { settle([]); return; }
    void client.from("package_lesson_content").select("lesson_id,content").in("lesson_id", missing).then(({ data }) => settle((data ?? []) as { lesson_id: string; content: BookContent }[]));
  }, [key]);
  return contents;
}

/** A soft paper "swish" made with filtered noise, so no audio file is needed. */
function usePageSound(enabled: boolean) {
  const context = useRef<AudioContext | null>(null);
  return useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    try {
      context.current ??= new AudioContext();
      const ctx = context.current;
      const duration = 0.34;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 2 * (1 - t * 0.6);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(3200, ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    } catch { /* audio is a nicety */ }
  }, [enabled]);
}

function readStored(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}

/**
 * The course as a 3D coursebook: a hardcover with a contents page, coloured
 * unit tabs and lesson spreads. Pages turn with a 3D flip; the open page is
 * kept in the URL hash and remembered, so returning from a lesson reopens it.
 */
export function CourseBook({ course, isDone, hasChecks, finalCheckSlug, toolbarStart }: {
  course: StageCourse;
  isDone: (lesson: BookLesson) => boolean;
  hasChecks: boolean;
  finalCheckSlug: string;
  toolbarStart?: ReactNode;
}) {
  const { pages, unitStart, lessonStart, finishPage } = useMemo(() => buildPages(course), [course]);
  const last = pages.length - 1;
  const storageKey = `course-book:${course.id}`;
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ single: false, narrow: false, scale: 1, height: 0 });
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return 0;
    const fromHash = Number(window.location.hash.match(/^#p=(\d+)/)?.[1]);
    const stored = Number(readStored(storageKey));
    const value = Number.isFinite(fromHash) && window.location.hash ? fromHash : Number.isFinite(stored) ? stored : 0;
    return Math.min(Math.max(0, value), last);
  });
  const [flip, setFlip] = useState<Flip | null>(null);
  // The lesson or check open as a workbook over the book, kept in the hash.
  const [openItem, setOpenItem] = useState<OpenItem | null>(openFromHash);
  const [panelTab, setPanelTab] = useState<PanelTab | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Reading mode shows one page at a time at a comfortable width, with adjustable text size.
  const [reading, setReading] = useState(() => typeof window !== "undefined" && readStored("course-book:reading") === "on");
  const [textScale, setTextScale] = useState(() => {
    const stored = typeof window === "undefined" ? NaN : Number(readStored("course-book:text"));
    return Number.isFinite(stored) && stored >= 0.9 && stored <= 1.6 ? stored : 1;
  });
  const [results, setResults] = useState<Record<string, PracticeResult>>({});
  const { entries, addEntry, removeEntry } = useNotebook();
  const [sound, setSound] = useState(() => typeof window === "undefined" || readStored("course-book:sound") !== "off");
  // Page turns follow the system's reduced-motion setting until the learner picks for themselves.
  const [motion, setMotion] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = readStored("course-book:motion");
    return stored ? stored === "on" : !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const flipping = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const playSound = usePageSound(sound);

  const lessons = course.units.flatMap((unit) => unit.lessons);
  const current = lessons.find((lesson) => !isDone(lesson));
  const finished = lessons.filter(isDone).length;
  const stageIndex = stages.findIndex((item) => item.id === course.stage_id);
  const stage = { name: stages[stageIndex]?.name ?? course.title, range: stages[stageIndex]?.range ?? "", number: stageIndex + 1 };

  // Measure the desk: two pages scaled to fit on wide screens, one fluid page on narrow ones.
  // On wide screens the desk fills the viewport height left below it, so the whole book is on screen.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      if (width < 860 || reading) { setLayout({ single: true, narrow: width < 860, scale: 1, height: 0 }); return; }
      const fullscreen = Boolean(document.fullscreenElement);
      const top = element.getBoundingClientRect().top + (fullscreen ? 0 : window.scrollY);
      const height = Math.max(520, Math.round(window.innerHeight - top - (fullscreen ? 10 : 14)));
      // Room for the thumb tabs and side arrows across, and the cover board's edge above and below.
      const scale = Math.max(0.5, Math.min((width - 140) / (PAGE_W * 2 + 84), (height - 28) / (PAGE_H + 22), 1.9));
      setLayout({ single: false, narrow: false, scale, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [reading]);

  // In spread view the canonical page is always the left page of a spread (or the cover).
  const anchor = layout.single ? page : firstPageOf(spreadOf(page));
  useEffect(() => {
    writeStored(storageKey, String(anchor));
    const open = !openItem ? "" : openItem.kind === "lesson" ? `&l=${encodeURIComponent(openItem.slug)}` : `&c=${encodeURIComponent(openItem.slug)}&t=${encodeURIComponent(openItem.title)}`;
    window.history.replaceState(window.history.state, "", `#p=${anchor}${open}`);
  }, [anchor, openItem, storageKey]);

  const goTo = useCallback((target: number) => {
    const clamped = Math.min(Math.max(0, target), last);
    if (flipping.current) return;
    const from = layout.single ? anchor : spreadOf(anchor);
    const to = layout.single ? clamped : spreadOf(clamped);
    if (from === to) return;
    // A single page can be taller than the screen; bring the new page's top back into view.
    if (layout.single && (shellRef.current?.getBoundingClientRect().top ?? 0) < 0) shellRef.current?.scrollIntoView({ block: "start", behavior: motion ? "smooth" : "auto" });
    if (!motion) { setPage(layout.single ? to : firstPageOf(to)); return; }
    flipping.current = true;
    playSound();
    setFlip({ dir: to > from ? 1 : -1, from, to, riffle: layout.single ? 0 : Math.min(3, Math.abs(to - from) - 1) });
    window.setTimeout(() => {
      setPage(layout.single ? to : firstPageOf(to));
      setFlip(null);
      flipping.current = false;
    }, FLIP_MS + 40);
  }, [anchor, last, layout.single, motion, playSound]);

  const next = useCallback(() => goTo(layout.single ? anchor + 1 : firstPageOf(spreadOf(anchor) + 1)), [anchor, goTo, layout.single]);
  const previous = useCallback(() => goTo(layout.single ? anchor - 1 : firstPageOf(spreadOf(anchor) - 1)), [anchor, goTo, layout.single]);

  // Opening a lesson also turns the book to it, without an animation behind the sheet.
  const openLesson = useCallback((lesson: BookLesson) => {
    setOpenItem({ kind: "lesson", slug: lesson.slug });
    setPanelTab(null);
    const start = lessonStart.get(lesson.id);
    if (start !== undefined && !flipping.current) setPage(start);
  }, [lessonStart]);
  const openCheck = useCallback((slug: string, title = "Bài kiểm tra") => { setOpenItem({ kind: "check", slug, title }); setPanelTab(null); }, []);
  const closeLesson = useCallback(() => setOpenItem(null), []);

  // Practice scores for every lesson in the course, kept fresh while the learner works.
  const lessonSlugKey = course.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.slug)).join(",");
  useEffect(() => {
    let active = true;
    loadPracticeResults(lessonSlugKey.split(",").filter(Boolean)).then((found) => { if (active) setResults(found); }, () => undefined);
    const unsubscribe = subscribePracticeResults((slug, result) => setResults((previous) => ({ ...previous, [slug]: result })));
    return () => { active = false; unsubscribe(); };
  }, [lessonSlugKey]);

  // Bookmarks and sticky notes live in the notebook, linked to "/app/learn/<stage>#p=<page>".
  const bookPath = `/app/learn/${course.stage_id}`;
  const marks = useMemo<BookMark[]>(() => entries.flatMap((entry) => {
    if (entry.kind !== "note" || !entry.sourcePath.startsWith(`${bookPath}#p=`)) return [];
    const page = Number(entry.sourcePath.slice(bookPath.length + 3).split("&")[0]);
    if (!Number.isInteger(page) || page < 0 || page > last) return [];
    return [{ id: entry.id, page, kind: entry.title.startsWith(BOOKMARK_PREFIX) ? "bookmark" as const : "note" as const, title: entry.title, body: entry.body }];
  }), [bookPath, entries, last]);

  useEffect(() => {
    if (openItem || panelTab || noteDraft !== null) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const box = shellRef.current?.getBoundingClientRect();
      if (!box || box.bottom < 80 || box.top > window.innerHeight - 80) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); previous(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, noteDraft, openItem, panelTab, previous]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Which pages are on screen (including both sides of a turning leaf).
  const visible = useMemo(() => {
    if (layout.single) return flip ? [flip.from, flip.to] : [anchor];
    const spreads = flip ? [flip.from, flip.to] : [spreadOf(anchor)];
    return spreads.flatMap((spread) => spreadPages(spread, last)).filter((value): value is number => value !== null);
  }, [anchor, flip, last, layout.single]);

  // Load lesson content for the units on screen and the unit after, so the next turn is ready.
  const wantedLessonIds = useMemo(() => {
    const unitIndexes = new Set<number>();
    for (const index of visible) {
      const item = pages[index];
      if (item && "unitIndex" in item) { unitIndexes.add(item.unitIndex); unitIndexes.add(item.unitIndex + 1); }
    }
    return [...unitIndexes].flatMap((unitIndex) => course.units[unitIndex]?.lessons.map((lesson) => lesson.id) ?? []).sort();
  }, [course.units, pages, visible]);
  const contents = useLessonContents(wantedLessonIds);

  const ctx: BookContext = { course, stage, isDone, current, contents, unitStart, lessonStart, finishPage, finished, total: lessons.length, hasChecks, finalCheckSlug, goTo, openLesson, openCheck, results };
  const openIndex = openItem?.kind === "lesson" ? lessons.findIndex((lesson) => lesson.slug === openItem.slug) : -1;
  const render = (index: number | null, side: "left" | "right") => index === null || !pages[index] ? null : <BookPageView page={pages[index]} index={index} side={side} ctx={ctx} />;

  // Static pages under the turning leaf, the leaf faces, and how far the closed book shifts to stay centred.
  let base: [number | null, number | null];
  let leaf: { front: number | null; back: number | null } | null = null;
  let resting: [number | null, number | null];
  if (layout.single) {
    base = [null, flip ? (flip.dir > 0 ? flip.to : flip.from) : anchor];
    resting = base;
  } else {
    const from = spreadPages(flip ? flip.from : spreadOf(anchor), last);
    const to = flip ? spreadPages(flip.to, last) : from;
    base = flip ? (flip.dir > 0 ? [from[0], to[1]] : [to[0], from[1]]) : from;
    if (flip) leaf = flip.dir > 0 ? { front: from[1], back: to[0] } : { front: to[1], back: from[0] };
    resting = to;
  }
  const shift = layout.single ? 0 : resting[0] === null ? -PAGE_W / 2 : resting[1] === null ? PAGE_W / 2 : 0;
  const [leftIndex, rightIndex] = base;
  const showLeftBoard = !layout.single && resting[0] !== null && resting[0] !== last;
  const showRightBoard = !layout.single && resting[1] !== null && resting[1] !== 0;
  const edge = (pagesOnSide: number) => Math.max(1, Math.min(8, Math.round((pagesOnSide / Math.max(1, last)) * 10)));
  const visibleRight = layout.single ? anchor : spreadPages(spreadOf(anchor), last)[1] ?? last;

  const unitTabs = course.units.map((unit, unitIndex) => {
    const start = unitStart.get(unit.id) ?? 0;
    const end = unitIndex + 1 < course.units.length ? (unitStart.get(course.units[unitIndex + 1].id) ?? finishPage) : finishPage;
    return { unit, unitIndex, start, active: anchor >= start - 1 && anchor < end, side: start <= (layout.single ? anchor : visibleRight - 1) ? "left" : "right" };
  });
  const tabHeight = Math.min(66, (PAGE_H - 60) / Math.max(1, course.units.length) - 5);
  const currentPage = current ? lessonStart.get(current.id) : undefined;
  const pageLabel = layout.single ? `${anchor}` : (() => { const [l, r] = spreadPages(spreadOf(anchor), last); return [l, r].filter((value) => value !== null && value !== 0).join("–") || "Bìa"; })();
  const atStart = anchor === 0;
  const atEnd = layout.single ? anchor >= last : spreadPages(spreadOf(anchor), last)[1] === null;

  const shownPages = layout.single ? [anchor] : spreadPages(spreadOf(anchor), last).filter((value): value is number => value !== null);
  const markPage = anchor;
  const pageBookmarks = marks.filter((mark) => mark.kind === "bookmark" && shownPages.includes(mark.page));
  const markLabel = (page: number) => describePage(pages[page], course);

  function toggleBookmark() {
    if (pageBookmarks.length) { pageBookmarks.forEach((mark) => void removeEntry(mark.id).catch(() => undefined)); return; }
    void addEntry({ kind: "note", title: `${BOOKMARK_PREFIX} · Trang ${markPage} · ${markLabel(markPage)}`.slice(0, 100), body: `Đánh dấu trong sách ${course.title}`, meaningVi: "", example: "" }, `${bookPath}#p=${markPage}`).catch(() => undefined);
  }

  function saveNote() {
    const body = (noteDraft ?? "").trim();
    if (!body) return;
    void addEntry({ kind: "note", title: `Ghi chú sách · Trang ${markPage} · ${markLabel(markPage)}`.slice(0, 100), body: body.slice(0, 5000), meaningVi: "", example: "" }, `${bookPath}#p=${markPage}`).catch(() => undefined);
    setNoteDraft(null);
  }

  function changeZoom(step: 1 | -1) {
    const nextZoom = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + step))];
    setZoom(nextZoom);
    if (nextZoom === 1) setPan({ x: 0, y: 0 });
  }

  function clampPan(x: number, y: number) {
    const desk = stageRef.current;
    if (!desk) return { x, y };
    const maxX = Math.max(0, (PAGE_W * 2 * layout.scale * zoom - desk.clientWidth) / 2 + 60);
    const maxY = Math.max(0, (PAGE_H * layout.scale * zoom - desk.clientHeight) / 2 + 40);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  function toggleReading() {
    setReading((value) => { writeStored("course-book:reading", value ? "off" : "on"); return !value; });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function changeText(step: number) {
    setTextScale((value) => {
      const nextValue = Math.round(Math.min(1.6, Math.max(0.9, value + step)) * 10) / 10;
      writeStored("course-book:text", String(nextValue));
      return nextValue;
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen?.();
  }

  function submitPage() {
    const value = Number(pageInput);
    if (pageInput && Number.isFinite(value)) goTo(value);
    setPageInput("");
  }

  // A single page grows with its content and scrolls with the page; spreads are scaled to fit the desk.
  const bookStyle = {
    "--flip-ms": `${FLIP_MS}ms`,
    ...(layout.single ? {} : { width: PAGE_W * 2, height: PAGE_H, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) translateX(${shift * layout.scale * zoom}px) scale(${layout.scale * zoom})` }),
  } as CSSProperties;

  const toggleMotion = () => setMotion((value) => { writeStored("course-book:motion", value ? "off" : "on"); return !value; });
  const toggleSound = () => setSound((value) => { writeStored("course-book:sound", value ? "off" : "on"); return !value; });
  const notesOn = (page: number) => marks.filter((mark) => mark.kind === "note" && mark.page === page);

  // The learner's sticky notes for a page; on a single fluid page they sit below it instead of over the text.
  const stickies = (page: number, flow = false) => {
    const notes = notesOn(page);
    if (!notes.length) return null;
    return <div className={`bk-stickies ${flow ? "is-flow" : ""}`}>{notes.map((note, index) => {
      const open = expandedNote === note.id;
      return <div key={note.id} className={`bk-sticky ${open ? "is-open" : ""}`} style={{ "--tilt": `${index % 2 ? 2 : -2}deg` } as CSSProperties}>
        <button type="button" onClick={() => setExpandedNote(open ? null : note.id)} aria-expanded={open}>{open || note.body.length <= 70 ? note.body : `${note.body.slice(0, 70)}…`}</button>
        {open && <button type="button" className="bk-sticky-delete" onClick={() => { void removeEntry(note.id).catch(() => undefined); setExpandedNote(null); }}><Trash2 size={13} /> Gỡ ghi chú</button>}
      </div>;
    })}</div>;
  };

  // The learner's own bookmark flag and sticky notes on a page, hidden while a leaf turns.
  const markLayer = (page: number | null, side: "left" | "right" | "single") => {
    if (flip || page === null) return null;
    const flagged = marks.some((mark) => mark.kind === "bookmark" && mark.page === page);
    const notes = side === "single" ? null : stickies(page);
    if (!flagged && !notes) return null;
    return <div className={`bk-mark-layer is-${side}`}>
      {flagged && <span className="bk-flag" title="Trang bạn đã đánh dấu"><Bookmark size={14} /></span>}
      {notes}
    </div>;
  };

  const settings = <div className="bk-settings">
    <span>Hiển thị</span>
    <button type="button" aria-pressed={motion} onClick={toggleMotion}><Sparkles size={15} /> Lật trang 3D</button>
    <button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />} Tiếng lật trang</button>
    {!layout.narrow && <button type="button" aria-pressed={reading} onClick={toggleReading}><Type size={15} /> Chế độ đọc</button>}
    {layout.single && <span className="bk-text-size"><button type="button" onClick={() => changeText(-0.1)} disabled={textScale <= 0.9} aria-label="Chữ nhỏ hơn"><AArrowDown size={16} /></button><b>{Math.round(textScale * 100)}%</b><button type="button" onClick={() => changeText(0.1)} disabled={textScale >= 1.6} aria-label="Chữ lớn hơn"><AArrowUp size={16} /></button></span>}
  </div>;

  return <div ref={shellRef} className={`bk-shell ${fullscreen ? "is-fullscreen" : ""} ${motion ? "" : "is-still"} ${reading && !layout.narrow ? "is-reading" : ""}`} style={{ "--board": boardColor(course.stage_id), "--bk-text": textScale } as CSSProperties}>
    <div className="bk-toolbar" role="toolbar" aria-label="Điều khiển sách">
      <div className="bk-toolbar-start">{toolbarStart}</div>
      <div className="bk-toolbar-main">
        <button type="button" className="bk-tool-wide" onClick={() => goTo(0)} title="Bìa sách" aria-label="Bìa sách"><BookOpen size={18} /></button>
        <button type="button" onClick={() => setPanelTab((tab) => tab ? null : "contents")} aria-pressed={Boolean(panelTab)} title="Mục lục, trang, tìm kiếm và đánh dấu" aria-label="Mở bảng điều hướng"><List size={18} /><span>Mục lục</span></button>
        <button type="button" onClick={previous} disabled={atStart} title="Trang trước (←)" aria-label="Trang trước"><ChevronLeft size={19} /></button>
        <form className="bk-page-field" onSubmit={(event) => { event.preventDefault(); submitPage(); }}>
          <label><span className="sr-only">Đi tới trang</span>
            <input inputMode="numeric" value={pageInput} placeholder={pageLabel} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))} onBlur={submitPage} aria-label={`Trang ${pageLabel} trên ${last}. Nhập số trang để đi tới`} />
          </label>
          <span>/ {last}</span>
        </form>
        <button type="button" onClick={next} disabled={atEnd} title="Trang sau (→)" aria-label="Trang sau"><ChevronRight size={19} /></button>
        {currentPage !== undefined && <button type="button" className="bk-bookmark-button" onClick={() => goTo(currentPage)} title="Lật tới bài đang học" aria-label="Lật tới bài đang học"><BookMarked size={18} /><span>Bài đang học</span></button>}
      </div>
      <div className="bk-toolbar-end">
        <button type="button" onClick={toggleBookmark} aria-pressed={pageBookmarks.length > 0} title={pageBookmarks.length ? "Bỏ đánh dấu trang này" : "Đánh dấu trang này"} aria-label="Đánh dấu trang">{pageBookmarks.length ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button>
        <button type="button" onClick={() => setNoteDraft((draft) => draft === null ? "" : null)} aria-pressed={noteDraft !== null} title="Dán ghi chú lên trang" aria-label="Dán ghi chú lên trang"><StickyNote size={18} /></button>
        {!layout.single && <>
          <button type="button" className="bk-tool-wide" onClick={() => changeZoom(-1)} disabled={zoom === 1} title="Thu nhỏ" aria-label="Thu nhỏ"><ZoomOut size={18} /></button>
          <button type="button" className="bk-tool-wide" onClick={() => changeZoom(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} title={zoom > 1 ? `Phóng to (${zoom * 100}%) · kéo để di chuyển` : "Phóng to"} aria-label="Phóng to"><ZoomIn size={18} /></button>
        </>}
        {reading && !layout.narrow && <>
          <button type="button" className="bk-tool-wide" onClick={() => changeText(-0.1)} disabled={textScale <= 0.9} title="Chữ nhỏ hơn" aria-label="Chữ nhỏ hơn"><AArrowDown size={18} /></button>
          <button type="button" className="bk-tool-wide" onClick={() => changeText(0.1)} disabled={textScale >= 1.6} title="Chữ lớn hơn" aria-label="Chữ lớn hơn"><AArrowUp size={18} /></button>
        </>}
        {!layout.narrow && <button type="button" className="bk-tool-wide" onClick={toggleReading} aria-pressed={reading} title={reading ? "Về trang đôi" : "Chế độ đọc: từng trang, chỉnh cỡ chữ"} aria-label="Chế độ đọc"><Type size={18} /></button>}
        <button type="button" className="bk-tool-wide" onClick={toggleMotion} aria-pressed={motion} title={motion ? "Tắt hiệu ứng lật trang 3D" : "Bật hiệu ứng lật trang 3D"} aria-label="Hiệu ứng lật trang 3D"><Sparkles size={18} /></button>
        <button type="button" className="bk-tool-wide" onClick={toggleSound} aria-pressed={sound} title={sound ? "Tắt tiếng lật trang" : "Bật tiếng lật trang"} aria-label="Tiếng lật trang">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button type="button" className="bk-tool-wide" onClick={toggleFullscreen} title="Toàn màn hình" aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
      </div>
      {noteDraft !== null && <form className="bk-composer" aria-label="Ghi chú cho trang" onSubmit={(event) => { event.preventDefault(); saveNote(); }} onKeyDown={(event) => { if (event.key === "Escape") setNoteDraft(null); if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) saveNote(); }}>
        <header><b>Ghi chú · Trang {markPage}</b><small>{markLabel(markPage)}</small><button type="button" onClick={() => setNoteDraft(null)} aria-label="Đóng"><X size={16} /></button></header>
        <textarea autoFocus value={noteDraft} maxLength={5000} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Viết điều cần nhớ, câu hỏi chưa rõ, từ muốn ôn…" rows={4} />
        <footer><small>Lưu vào Sổ tay và dán lên trang này.</small><button type="submit" className="button primary" disabled={!noteDraft.trim()}>Dán lên trang</button></footer>
      </form>}
    </div>

    {layout.single && <div className="bk-unit-strip" aria-label="Chọn unit">{unitTabs.map((tab) => <button type="button" key={tab.unit.id} className={tab.active ? "is-active" : ""} style={{ "--tone": unitColor(tab.unitIndex) } as CSSProperties} onClick={() => goTo(tab.start)}>{unitLabel(tab.unit, course).short}</button>)}</div>}

    <div
      ref={stageRef}
      className={`bk-desk ${layout.single ? "is-single" : ""} ${zoom > 1 ? "is-zoomed" : ""}`}
      style={layout.height ? { height: layout.height } : undefined}
      onPointerDown={(event) => {
        if (zoom === 1 || event.pointerType !== "mouse" || (event.target as HTMLElement).closest("button, a, input, textarea, audio, summary, label")) return;
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => { const start = drag.current; if (start) setPan(clampPan(start.panX + event.clientX - start.x, start.panY + event.clientY - start.y)); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      {!layout.single && <button type="button" className="bk-arrow is-prev" onClick={previous} disabled={atStart} aria-label="Trang trước"><ChevronLeft size={26} /></button>}
      <div
        className={`bk-book ${flip ? "is-flipping" : ""} ${layout.single ? "is-single" : ""}`}
        style={bookStyle}
        role="region"
        aria-roledescription="sách"
        aria-label={`${course.title}, trang ${pageLabel}`}
        onPointerDown={(event) => { if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          if (Math.abs(dx) > 60 && Math.abs(event.clientY - start.y) < 70) { if (dx < 0) next(); else previous(); }
        }}
      >
        {showLeftBoard && <span className="bk-board is-left" aria-hidden="true" />}
        {showRightBoard && <span className="bk-board is-right" aria-hidden="true" />}
        {!layout.single && <div className="bk-slot is-left" style={{ boxShadow: leftIndex !== null && leftIndex !== last ? paperEdge(edge(leftIndex), "left") : undefined }}>{render(leftIndex, "left")}{markLayer(leftIndex, "left")}</div>}
        <div className={`bk-slot ${layout.single ? "is-single" : "is-right"}`} style={{ boxShadow: rightIndex !== null && rightIndex !== 0 ? paperEdge(edge(last - rightIndex), "right") : undefined }}>{render(rightIndex, "right")}{markLayer(rightIndex, layout.single ? "single" : "right")}</div>
        {layout.single && !flip && stickies(anchor, true)}
        {flip && !layout.single && leaf && <>
          {Array.from({ length: flip.riffle }, (_, i) => <div key={i} className={`bk-leaf is-riffle ${flip.dir > 0 ? "is-next" : "is-prev"}`} style={{ animationDelay: `${(i + 1) * 70}ms`, animationDuration: `${FLIP_MS - 160}ms` }} aria-hidden="true"><div className="bk-leaf-face is-front"><div className="bk-page is-right bk-blank" /></div><div className="bk-leaf-face is-back"><div className="bk-page is-left bk-blank" /></div></div>)}
          <div className={`bk-leaf ${flip.dir > 0 ? "is-next" : "is-prev"}`} aria-hidden="true">
            <div className="bk-leaf-face is-front">{render(leaf.front, "right")}<i className="bk-leaf-shade" /></div>
            <div className="bk-leaf-face is-back">{render(leaf.back, "left")}<i className="bk-leaf-shade" /></div>
          </div>
        </>}
        {flip && layout.single && <div className={`bk-leaf is-single ${flip.dir > 0 ? "is-next" : "is-prev"}`} aria-hidden="true"><div className="bk-leaf-face is-front">{render(flip.dir > 0 ? flip.from : flip.to, "right")}<i className="bk-leaf-shade" /></div></div>}
        {!layout.single && unitTabs.map((tab) => <button
          type="button"
          key={tab.unit.id}
          className={`bk-tab is-${tab.side} ${tab.active ? "is-active" : ""}`}
          style={{ "--tone": unitColor(tab.unitIndex), top: 30 + tab.unitIndex * (tabHeight + 5), height: tabHeight } as CSSProperties}
          onClick={() => goTo(tab.start)}
          title={splitUnitTitle(tab.unit.title).en}
          aria-label={`Mở ${unitLabel(tab.unit, course).short}: ${splitUnitTitle(tab.unit.title).en}`}
        ><span>{unitLabel(tab.unit, course).short.toUpperCase()}</span></button>)}
        {!flip && !layout.single && !atEnd && rightIndex !== null && <button type="button" className="bk-corner is-next" onClick={next} aria-label="Lật trang sau" />}
        {!flip && !layout.single && !atStart && leftIndex !== null && <button type="button" className="bk-corner is-prev" onClick={previous} aria-label="Lật trang trước" />}
      </div>
      {!layout.single && <button type="button" className="bk-arrow is-next" onClick={next} disabled={atEnd} aria-label="Trang sau"><ChevronRight size={26} /></button>}
      {layout.single && <div className="bk-single-nav"><button type="button" onClick={previous} disabled={atStart}><ChevronLeft size={18} /> Trang trước</button><button type="button" onClick={next} disabled={atEnd}>Trang sau <ChevronRight size={18} /></button></div>}
    </div>
    {panelTab && createPortal(<div className="bk-panel-scope" style={{ "--board": boardColor(course.stage_id) } as CSSProperties}><BookPanel
      course={course} pages={pages} unitStart={unitStart} lessonStart={lessonStart} finishPage={finishPage}
      visible={shownPages} single={layout.single} tab={panelTab} onTab={setPanelTab} onClose={() => setPanelTab(null)}
      goTo={goTo} openLesson={openLesson} isDone={isDone} current={current} results={results}
      marks={marks} removeMark={(mark) => void removeEntry(mark.id).catch(() => undefined)} settings={settings}
    /></div>, document.fullscreenElement ?? document.body)}
    {openItem && (openItem.kind === "check" || openIndex >= 0) && <BookWorkbook
      item={openItem.kind === "lesson" ? { kind: "lesson", lesson: lessons[openIndex] } : openItem}
      stageId={course.stage_id}
      position={openIndex + 1}
      total={lessons.length}
      previous={openIndex > 0 ? lessons[openIndex - 1] : undefined}
      next={openIndex >= 0 ? lessons[openIndex + 1] : undefined}
      onOpenLesson={openLesson}
      onOpenCheck={(slug) => openCheck(slug, "Ôn tập & kiểm tra unit")}
      onClose={closeLesson}
      onFinishLesson={(nextLesson) => {
        setOpenItem(null);
        if (nextLesson) {
          const targetPage = lessonStart.get(nextLesson.id);
          if (targetPage !== undefined) {
            window.setTimeout(() => goTo(targetPage), 80);
          }
        }
      }}
    />}
    <p className="sr-only" aria-live="polite">Trang {pageLabel} trên {last}</p>
  </div>;
}

function boardColor(stageId: string) {
  return ({ foundation: "#1f6f62", elementary: "#2a5f9e", "pre-ielts": "#6a46a8", "ielts-starter": "#b4532a", "ielts-builder": "#1d5a85", "ielts-advanced": "#1a3159" } as Record<string, string>)[stageId] ?? "#0d5c63";
}
