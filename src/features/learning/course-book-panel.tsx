"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bookmark, Check, FileText, Grid3x3, List, Search, StickyNote, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import type { StageCourse } from "./stage-courses";
import { describePage, lessonShortTitle, splitUnitTitle, themeOf, unitColor, unitLabel, type BookLesson, type BookPage } from "./course-book-pages";
import { resultTone, type PracticeResult } from "./practice-results";

export type BookMark = { id: string; page: number; kind: "bookmark" | "note"; title: string; body: string };
export type PanelTab = "contents" | "pages" | "search" | "marks";

type SearchHit = { key: string; kind: string; text: string; detail: string; page: number; lesson?: BookLesson };
type LessonIndex = { lesson_id: string; vocabulary: { en: string; vi: string }[] | null; passage_title: string | null; grammar_title: string | null };
const indexCache = new Map<string, Promise<LessonIndex[]>>();

/** Lower-case and strip Vietnamese accents so "dich chuyen" finds "dịch chuyển". */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

function loadIndex(course: StageCourse) {
  let request = indexCache.get(course.id);
  if (!request) {
    const ids = course.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.id));
    request = Promise.resolve(createClient().from("package_lesson_content")
      .select("lesson_id,vocabulary:content->vocabulary,passage_title:content->>passage_title,grammar_title:content->>grammar_title")
      .in("lesson_id", ids)).then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as unknown as LessonIndex[]; });
    request.catch(() => indexCache.delete(course.id));
    indexCache.set(course.id, request);
  }
  return request;
}

export function scoreLabel(result: PracticeResult | undefined) {
  if (!result) return "";
  return result.checked >= result.total ? `${result.correct}/${result.total} đúng` : `Đã làm ${result.checked}/${result.total} · đúng ${result.correct}`;
}

/**
 * The book's side panel: an outline of every unit and lesson, a thumbnail
 * grid of the pages, search across titles and vocabulary, and the learner's
 * own bookmarks and sticky notes. Also holds the display settings.
 */
export function BookPanel({ course, pages, unitStart, lessonStart, finishPage, visible, single, tab, onTab, onClose, goTo, openLesson, isDone, current, results, marks, removeMark, settings }: {
  course: StageCourse;
  pages: BookPage[];
  unitStart: Map<string, number>;
  lessonStart: Map<string, number>;
  finishPage: number;
  visible: number[];
  single: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  goTo: (page: number) => void;
  openLesson: (lesson: BookLesson) => void;
  isDone: (lesson: BookLesson) => boolean;
  current?: BookLesson;
  results: Record<string, PracticeResult>;
  marks: BookMark[];
  removeMark: (mark: BookMark) => void;
  settings: React.ReactNode;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<LessonIndex[] | null>(null);
  const [indexError, setIndexError] = useState("");
  const jump = (page: number) => { goTo(page); if (single) onClose(); };

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    if (tab !== "search" || index) return;
    let active = true;
    loadIndex(course).then((rows) => { if (active) setIndex(rows); }, (error: Error) => { if (active) setIndexError(error.message); });
    return () => { active = false; };
  }, [course, index, tab]);

  const hits = useMemo<SearchHit[]>(() => {
    const needle = fold(query.trim());
    if (needle.length < 2) return [];
    const found: SearchHit[] = [];
    const byId = new Map((index ?? []).map((row) => [row.lesson_id, row]));
    course.units.forEach((unit) => {
      const title = splitUnitTitle(unit.title);
      if (fold(`${title.en} ${title.vi}`).includes(needle)) found.push({ key: `u-${unit.id}`, kind: "Unit", text: title.en, detail: title.vi, page: unitStart.get(unit.id) ?? 0 });
      unit.lessons.forEach((lesson) => {
        const page = lessonStart.get(lesson.id) ?? 0;
        if (fold(lesson.title).includes(needle)) found.push({ key: `l-${lesson.id}`, kind: lesson.skill, text: lessonShortTitle(lesson), detail: unitLabel(unit, course).short, page, lesson });
        const row = byId.get(lesson.id);
        if (row?.passage_title && fold(row.passage_title).includes(needle)) found.push({ key: `p-${lesson.id}`, kind: "Bài đọc", text: row.passage_title, detail: unitLabel(unit, course).short, page, lesson });
        if (row?.grammar_title && fold(row.grammar_title).includes(needle)) found.push({ key: `g-${lesson.id}`, kind: "Ngữ pháp", text: row.grammar_title, detail: unitLabel(unit, course).short, page, lesson });
        (row?.vocabulary ?? []).forEach((word, wordIndex) => {
          if (fold(`${word.en} ${word.vi}`).includes(needle)) found.push({ key: `v-${lesson.id}-${wordIndex}`, kind: "Từ vựng", text: word.en, detail: `${word.vi} · ${unitLabel(unit, course).short}`, page, lesson });
        });
      });
    });
    pages.forEach((page, pageNumber) => {
      if (page.kind !== "source-detail" || found.length >= 60) return;
      const content = (page.sections ?? [page]).map((section) => `${section.title} ${section.subtitle ?? ""} ${section.paragraphs?.join(" ") ?? ""} ${section.items?.map((item) => `${item.question_en ?? item.question ?? ""} ${item.question_vi ?? ""}`).join(" ") ?? ""} ${section.words?.map((word) => word.join(" ")).join(" ") ?? ""}`).join(" ");
      if (fold(content).includes(needle)) found.push({ key: `s-${pageNumber}`, kind: page.lesson.skill, text: page.title, detail: `${unitLabel(page.unit, course).short} · trang ${pageNumber}`, page: pageNumber, lesson: page.lesson });
    });
    marks.forEach((mark) => { if (fold(`${mark.title} ${mark.body}`).includes(needle)) found.push({ key: `m-${mark.id}`, kind: mark.kind === "note" ? "Ghi chú" : "Dấu trang", text: mark.kind === "note" ? mark.body : mark.title, detail: `Trang ${mark.page}`, page: mark.page }); });
    return found.slice(0, 60);
  }, [course, index, lessonStart, marks, pages, query, unitStart]);

  // Thumbnails come in spreads on wide screens, single pages on narrow ones.
  const groups = useMemo(() => {
    if (single) return pages.map((_, page) => [page]);
    const spreads: number[][] = [[0]];
    for (let page = 1; page < pages.length; page += 2) spreads.push(page + 1 < pages.length ? [page, page + 1] : [page]);
    return spreads;
  }, [pages, single]);
  const marked = useMemo(() => new Map(marks.map((mark) => [mark.page, mark.kind])), [marks]);

  const tabs: { id: PanelTab; label: string; icon: typeof List }[] = [
    { id: "contents", label: "Mục lục", icon: List },
    { id: "pages", label: "Trang", icon: Grid3x3 },
    { id: "search", label: "Tìm", icon: Search },
    { id: "marks", label: `Đánh dấu${marks.length ? ` · ${marks.length}` : ""}`, icon: Bookmark },
  ];

  return <div className="bk-panel-layer">
    <button type="button" className="bk-panel-backdrop" aria-label="Đóng bảng điều hướng" tabIndex={-1} onClick={onClose} />
    <aside className="bk-panel" role="dialog" aria-modal="false" aria-label="Điều hướng sách" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <header className="bk-panel-head">
        <div><small>{course.title}</small><b>Điều hướng sách</b></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
      </header>
      <nav className="bk-panel-tabs" role="tablist">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => onTab(item.id)}><Icon size={15} /> {item.label}</button>; })}</nav>

      <div className="bk-panel-body">
        {tab === "contents" && <div className="bk-outline">
          <button type="button" className="bk-outline-front" onClick={() => jump(2)}><FileText size={15} /> Trang Mục lục trong sách <span>2</span></button>
          {course.units.map((unit, unitIndex) => {
            const title = splitUnitTitle(unit.title);
            const done = unit.lessons.filter(isDone).length;
            const open = unit.lessons.some((lesson) => visible.includes(lessonStart.get(lesson.id) ?? -1) || visible.includes((lessonStart.get(lesson.id) ?? -2) + 1)) || visible.includes(unitStart.get(unit.id) ?? -1);
            return <details key={unit.id} open={open || undefined} className="bk-outline-unit" style={{ "--tone": unitColor(unitIndex) } as CSSProperties}>
              <summary><span className="bk-outline-no">{unitLabel(unit, course).number}</span><span><b>{title.en}</b><small>{done}/{unit.lessons.length} bài · trang {unitStart.get(unit.id)}</small></span></summary>
              <ol>{unit.lessons.map((lesson) => {
                const result = results[lesson.slug];
                return <li key={lesson.id}><button type="button" className={`${current?.id === lesson.id ? "is-here" : ""}`} onClick={() => jump(lessonStart.get(lesson.id) ?? 0)}>
                  <i style={{ background: themeOf(lesson.skill).color }} />
                  <span>{lessonShortTitle(lesson)}{result && <small className={`bk-score ${resultTone(result)}`}>{scoreLabel(result)}</small>}</span>
                  <em>{isDone(lesson) ? <Check size={13} strokeWidth={3} /> : lessonStart.get(lesson.id)}</em>
                </button></li>;
              })}</ol>
            </details>;
          })}
          <button type="button" className="bk-outline-front" onClick={() => jump(finishPage)}><Check size={15} /> Tổng kết & kiểm tra cuối khóa <span>{finishPage}</span></button>
        </div>}

        {tab === "pages" && <div className={`bk-thumbs ${single ? "is-single" : ""}`}>{groups.map((group) => {
          const here = group.some((page) => visible.includes(page));
          return <button key={group[0]} type="button" className={`bk-thumb ${here ? "is-here" : ""}`} onClick={() => jump(group[0])} aria-label={`Trang ${group.join("–")}: ${group.map((page) => describePage(pages[page], course)).join(", ")}`}>
            <span className="bk-thumb-sheet">{group.map((page) => <MiniPage key={page} page={pages[page]} mark={marked.get(page)} />)}</span>
            <small>{group[0] === 0 ? "Bìa" : group.join("–")}</small>
          </button>;
        })}</div>}

        {tab === "search" && <div className="bk-search">
          <label className="bk-search-field"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bài, từ vựng, bài đọc, ghi chú…" aria-label="Tìm trong sách" /></label>
          {!index && !indexError && <small className="bk-search-note">Đang tải từ vựng của khóa…</small>}
          {indexError && <small className="bk-search-note">Chỉ tìm được tên bài: {indexError}</small>}
          {query.trim().length >= 2 && !hits.length && <p className="bk-search-note">Không tìm thấy “{query}”.</p>}
          <ul className="bk-hits">{hits.map((hit) => <li key={hit.key}>
            <button type="button" onClick={() => jump(hit.page)}><small>{hit.kind}</small><b>{hit.text}</b><span>{hit.detail}</span><em>{hit.page}</em></button>
            {hit.lesson && <button type="button" className="bk-hit-open" onClick={() => openLesson(hit.lesson!)}>Mở bài</button>}
          </li>)}</ul>
        </div>}

        {tab === "marks" && <div className="bk-marks">
          {!marks.length && <p className="bk-search-note">Chưa có dấu trang hay ghi chú. Dùng nút <Bookmark size={13} /> và <StickyNote size={13} /> trên thanh công cụ để đánh dấu trang đang mở. Tất cả được lưu vào Sổ tay.</p>}
          <ul className="bk-hits">{[...marks].sort((a, b) => a.page - b.page).map((mark) => <li key={mark.id} className={`is-${mark.kind}`}>
            <button type="button" onClick={() => jump(mark.page)}><small>{mark.kind === "note" ? "Ghi chú" : "Dấu trang"}</small><b>{mark.kind === "note" ? mark.body : describePage(pages[mark.page], course)}</b><span>{mark.kind === "note" ? describePage(pages[mark.page], course) : ""}</span><em>{mark.page}</em></button>
            <button type="button" className="bk-hit-open" onClick={() => removeMark(mark)} aria-label="Xóa"><Trash2 size={14} /></button>
          </li>)}</ul>
        </div>}
      </div>
      <footer className="bk-panel-settings">{settings}</footer>
    </aside>
  </div>;
}

function MiniPage({ page, mark }: { page: BookPage | undefined; mark?: "bookmark" | "note" }) {
  if (!page) return null;
  let style: CSSProperties = {};
  let label = "";
  if (page.kind === "cover" || page.kind === "back") { style = { background: "var(--board)" }; label = page.kind === "cover" ? "Bìa" : "Bìa sau"; }
  else if (page.kind === "unit-art") { style = { background: unitColor(page.unitIndex) }; label = `U${page.unit.sort_order}`; }
  else if (page.kind === "lesson-open") { style = { "--band": themeOf(page.lesson.skill).color } as CSSProperties; label = page.lesson.skill.slice(0, 5); }
  else if (page.kind === "source-detail") { style = { "--band": themeOf(page.lesson.skill).color } as CSSProperties; label = page.type === "group" ? "Bài tập" : page.lesson.skill.slice(0, 5); }
  else if (page.kind === "contents") label = "Mục lục";
  return <span className={`bk-mini is-${page.kind}`} style={style}>
    {label && <b>{label}</b>}
    {mark && <i className={`bk-mini-mark is-${mark}`} />}
  </span>;
}
