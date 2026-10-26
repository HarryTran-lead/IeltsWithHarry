"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { skillMaterialSchema } from "@/lib/skill-material";
import { useNotebook } from "@/features/notebook/notebook-store";
import { LessonDetail } from "./lesson-detail";
import { PackageLessonSteps, type PackageLessonProps } from "./course-package-lesson-shell";
import type { PackageLesson } from "./course-package-practice";
import { lessonShortTitle, themeOf, type BookLesson } from "./course-book-pages";

type LessonData = Omit<PackageLessonProps, "packageContent"> & { packageContent: PackageLesson | null };

// Lessons opened in this session stay loaded, so flipping back to one is instant.
const loaded = new Map<string, Promise<LessonData>>();

/** Loads what the lesson page loads on the server, through the learner's own session. */
function loadLesson(lesson: BookLesson) {
  const cached = loaded.get(lesson.id);
  if (cached) return cached;
  const request = (async () => {
    const supabase = createClient();
    const [blocks, questions, words, material, packageContent] = await Promise.all([
      supabase.from("lesson_blocks").select("id,kind,body").eq("lesson_id", lesson.id).order("sort_order"),
      supabase.from("exercise_questions").select("id,slug,prompt,options").eq("lesson_id", lesson.id).order("sort_order"),
      supabase.from("vocabulary_entries").select("id,word,phonetic,meaning_vi,definition,example,sentence_prompt_vi,accepted_sentences").eq("lesson_id", lesson.id).order("sort_order"),
      supabase.from("lesson_materials").select("content").eq("lesson_id", lesson.id).maybeSingle(),
      supabase.from("package_lesson_content").select("content").eq("lesson_id", lesson.id).maybeSingle(),
    ]);
    const failure = blocks.error ?? questions.error ?? words.error ?? material.error ?? packageContent.error;
    if (failure) throw new Error(failure.message);
    const parsedMaterial = skillMaterialSchema.safeParse(material.data?.content);
    return {
      lesson: { slug: lesson.slug, title: lesson.title, skill: lesson.skill, summary: lesson.summary },
      blocks: blocks.data ?? [],
      questions: (questions.data ?? []).map((item) => ({ ...item, options: Array.isArray(item.options) ? item.options.filter((value): value is string => typeof value === "string") : [] })),
      words: words.data ?? [],
      material: parsedMaterial.success && parsedMaterial.data.skill === lesson.skill ? parsedMaterial.data : null,
      packageContent: (packageContent.data?.content as PackageLesson | undefined) ?? null,
    };
  })();
  loaded.set(lesson.id, request);
  request.catch(() => loaded.delete(lesson.id));
  return request;
}

/**
 * A lesson opened as a workbook sheet over the course book, so learners do
 * the full exercises without leaving the book. Closing it returns to the same
 * spread; the "Sổ tay" notebook stays available above it.
 */
export function LessonWorkbook({ lesson, position, total, previous, next, onOpen, onClose }: {
  lesson: BookLesson;
  position: number;
  total: number;
  previous?: BookLesson;
  next?: BookLesson;
  onOpen: (lesson: BookLesson) => void;
  onClose: () => void;
}) {
  const { recordVisit, setSourcePath } = useNotebook();
  const [result, setResult] = useState<{ id: string; data?: LessonData; error?: string } | null>(null);
  // Opened only by a click, so the document exists. Render into the fullscreen book when it is fullscreen.
  const [host] = useState<Element | null>(() => typeof document === "undefined" ? null : document.fullscreenElement ?? document.body);
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const theme = themeOf(lesson.skill);
  const path = `/app/lesson/${lesson.slug}`;

  useEffect(() => {
    let active = true;
    loadLesson(lesson).then((data) => { if (active) setResult({ id: lesson.id, data }); }, (error: Error) => { if (active) setResult({ id: lesson.id, error: error.message }); });
    scroller.current?.scrollTo({ top: 0 });
    return () => { active = false; };
  }, [lesson]);

  // Opening a lesson counts as visiting it, and notes taken meanwhile link back to it.
  useEffect(() => {
    void recordVisit(path);
    setSourcePath(path);
    return () => setSourcePath(null);
  }, [path, recordVisit, setSourcePath]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector(".notebook-drawer")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const data = result?.id === lesson.id ? result.data : undefined;
  const error = result?.id === lesson.id ? result.error : undefined;
  const finish = next
    ? <button type="button" className="button primary" onClick={() => onOpen(next)}>Bài tiếp theo: {lessonShortTitle(next)} <ArrowRight size={17} /></button>
    : <button type="button" className="button primary" onClick={onClose}>Gấp vở, về sách <ArrowRight size={17} /></button>;

  if (!host) return null;
  return createPortal(<div className="bk-workbook" role="dialog" aria-modal="true" aria-label={`Bài học: ${lesson.title}`} style={{ "--skill": theme.color, "--skill-ink": theme.ink } as CSSProperties}>
    <button type="button" className="bk-workbook-backdrop" aria-label="Đóng bài học" tabIndex={-1} onClick={onClose} />
    <div className="bk-workbook-sheet">
      <header className="bk-workbook-head">
        <button ref={closeButton} type="button" className="bk-workbook-back" onClick={onClose}><ArrowLeft size={17} /> <span>Về sách</span></button>
        <div className="bk-workbook-title">
          <small><b>{lesson.skill}</b> · Bài {position}/{total}</small>
          <h2>{lessonShortTitle(lesson)}</h2>
        </div>
        <nav className="bk-workbook-nav" aria-label="Chuyển bài">
          <button type="button" onClick={() => previous && onOpen(previous)} disabled={!previous} title={previous ? lessonShortTitle(previous) : undefined} aria-label="Bài trước"><ArrowLeft size={17} /></button>
          <button type="button" onClick={() => next && onOpen(next)} disabled={!next} title={next ? lessonShortTitle(next) : undefined} aria-label="Bài tiếp"><ArrowRight size={17} /></button>
          <Link href={path} className="bk-workbook-page" title="Mở thành trang riêng"><ExternalLink size={16} /></Link>
          <button type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </nav>
      </header>
      <div ref={scroller} className="bk-workbook-body">
        {error ? <div className="bk-workbook-state"><p>Không mở được bài học: {error}</p><Link className="button primary" href={path}>Mở thành trang riêng <ArrowRight size={16} /></Link></div>
          : !data ? <div className="bk-workbook-state" aria-busy="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
          : data.packageContent
            ? <div className="package-lesson-page bk-workbook-lesson"><PackageLessonSteps key={lesson.id} {...data} packageContent={data.packageContent} finish={finish} onStepChange={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })} /></div>
            : <div className="bk-workbook-lesson"><LessonDetail key={lesson.id} {...data} /><div className="package-panel-actions">{finish}</div></div>}
      </div>
    </div>
  </div>, host);
}
