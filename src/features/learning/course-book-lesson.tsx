"use client";

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { createClient } from "@/lib/supabase/browser";
import { skillMaterialSchema } from "@/lib/skill-material";
import { useNotebook } from "@/features/notebook/notebook-store";
import { LessonDetail } from "./lesson-detail";
import { PackageLessonSteps, type PackageLessonProps } from "./course-package-lesson-shell";
import { CheckOpener, OpenResponsePractice, type PackageLesson } from "./course-package-practice";
import { StarterVisual } from "./starter-visual";
import { AssessmentBody, type Assessment } from "./course-assessment";
import { lessonShortTitle, themeOf, type BookLesson } from "./course-book-pages";

type LessonData = Omit<PackageLessonProps, "packageContent"> & { packageContent: PackageLesson | null };
export type WorkbookItem = { kind: "lesson"; lesson: BookLesson; groupId?: string } | { kind: "check"; slug: string; title: string };

// What was opened in this session stays loaded, so going back to it is instant.
const loaded = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>) {
  const existing = loaded.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const request = load();
  loaded.set(key, request);
  request.catch(() => loaded.delete(key));
  return request;
}

/** Loads what the lesson page loads on the server, through the learner's own session. */
function loadLesson(lesson: BookLesson) {
  return cached(`lesson:${lesson.id}`, async (): Promise<LessonData> => {
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
  });
}

function loadCheck(slug: string) {
  return cached(`check:${slug}`, async (): Promise<Assessment> => {
    const { data, error } = await createClient().from("package_assessments").select("title,content").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Bài kiểm tra chưa được mở.");
    return { ...(data.content as Record<string, unknown>), title: data.title } as Assessment;
  });
}

function useLoaded<T>(key: string, load: () => Promise<T>) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const start = useEffectEvent(load);
  useEffect(() => {
    let active = true;
    start().then((data) => { if (active) setResult({ key, data }); }, (error: Error) => { if (active) setResult({ key, error: error.message }); });
    return () => { active = false; };
  }, [key]);
  return result?.key === key ? result : null;
}

/**
 * A lesson or unit check opened as a workbook sheet over the course book, so
 * learners work through it without leaving the book. Closing it returns to
 * the same spread; the "Sổ tay" notebook stays available above it.
 */
export function BookWorkbook({ item, stageId, position, total, previous, next, onOpenLesson, onOpenCheck, onClose, onFinishLesson }: {
  item: WorkbookItem;
  stageId: string;
  position?: number;
  total?: number;
  previous?: BookLesson;
  next?: BookLesson;
  onOpenLesson: (lesson: BookLesson) => void;
  onOpenCheck: (slug: string) => void;
  onClose: () => void;
  onFinishLesson?: (nextLesson?: BookLesson) => void;
}) {
  const { recordVisit, setSourcePath } = useNotebook();
  // Opened only by a click, so the document exists. Render into the fullscreen book when it is fullscreen.
  const [host] = useState<Element | null>(() => typeof document === "undefined" ? null : document.fullscreenElement ?? document.body);
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const key = item.kind === "lesson" ? `lesson:${item.lesson.id}:${item.groupId ?? "all"}` : `check:${item.slug}`;
  const path = item.kind === "lesson" ? `/app/lesson/${item.lesson.slug}` : `/app/check/${item.slug}`;
  const theme = item.kind === "lesson" ? themeOf(item.lesson.skill) : { color: "#10233f", ink: "#ffffff" };

  // Opening a lesson counts as visiting it, and notes taken meanwhile link back to it.
  useEffect(() => {
    if (item.kind === "lesson") void recordVisit(path);
    setSourcePath(path);
    scroller.current?.scrollTo({ top: 0 });
    return () => setSourcePath(null);
  }, [item.kind, path, recordVisit, setSourcePath]);

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

  if (!host) return null;
  return createPortal(<div className="bk-workbook" role="dialog" aria-modal="true" aria-label={item.kind === "lesson" ? `Bài học: ${item.lesson.title}` : item.title} style={{ "--skill": theme.color, "--skill-ink": theme.ink } as CSSProperties}>
    <button type="button" className="bk-workbook-backdrop" aria-label="Đóng" tabIndex={-1} onClick={onClose} />
    <div className="bk-workbook-sheet">
      <header className="bk-workbook-head">
        <button ref={closeButton} type="button" className="bk-workbook-back" onClick={onClose}><ArrowLeft size={17} /> <span>Về sách</span></button>
        {item.kind === "lesson" && <TopicArt topic={item.lesson.title} lessonSlug={item.lesson.slug} variant="lesson" badge={false} className="bk-workbook-art" />}
        <div className="bk-workbook-title">
          {item.kind === "lesson" ? <small><b>{item.lesson.skill}</b> · Bài {position}/{total}</small> : <small><b>Kiểm tra</b> · Ôn tập và tự đánh giá</small>}
          <h2>{item.kind === "lesson" ? item.groupId ? `Bài tập · ${lessonShortTitle(item.lesson)}` : lessonShortTitle(item.lesson) : item.title}</h2>
        </div>
        <nav className="bk-workbook-nav" aria-label="Chuyển bài">
          {item.kind === "lesson" && <>
            <button type="button" onClick={() => previous && onOpenLesson(previous)} disabled={!previous} title={previous ? lessonShortTitle(previous) : undefined} aria-label="Bài trước"><ArrowLeft size={17} /></button>
            <button type="button" onClick={() => next && onOpenLesson(next)} disabled={!next} title={next ? lessonShortTitle(next) : undefined} aria-label="Bài tiếp"><ArrowRight size={17} /></button>
          </>}
          <Link href={path} className="bk-workbook-page" title="Mở thành trang riêng"><ExternalLink size={16} /></Link>
          <button type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </nav>
      </header>
      <div ref={scroller} className="bk-workbook-body">
        <CheckOpener.Provider value={onOpenCheck}>
          {item.kind === "lesson"
            ? <LessonSheet key={key} lesson={item.lesson} groupId={item.groupId} next={next} onOpenLesson={onOpenLesson} onClose={onClose} onFinishLesson={onFinishLesson} path={path} scroller={scroller} />
            : <CheckSheet key={key} slug={item.slug} stageId={stageId} onClose={onClose} path={path} />}
        </CheckOpener.Provider>
      </div>
    </div>
  </div>, host);
}

function SheetState({ error, path }: { error?: string; path: string }) {
  return error ? <div className="bk-workbook-state"><p>Không mở được: {error}</p><Link className="button primary" href={path}>Mở thành trang riêng <ArrowRight size={16} /></Link></div>
    : <div className="bk-workbook-state" aria-busy="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>;
}

function LessonSheet({ lesson, groupId, next, onOpenLesson, onClose, onFinishLesson, path, scroller }: { lesson: BookLesson; groupId?: string; next?: BookLesson; onOpenLesson: (lesson: BookLesson) => void; onClose: () => void; onFinishLesson?: (nextLesson?: BookLesson) => void; path: string; scroller: React.RefObject<HTMLDivElement | null> }) {
  const result = useLoaded(`lesson:${lesson.id}`, () => loadLesson(lesson));
  const data = result?.data;
  if (!data) return <SheetState error={result?.error} path={path} />;
  if (groupId && data.packageContent) {
    const content = data.packageContent as PackageLesson & { source_groups?: { id: string; title: string; instruction_en?: string; instruction_vi?: string; visual_refs?: string[]; item_ids: string[] }[] };
    const group = content.source_groups?.find((entry) => entry.id === groupId);
    if (group) {
      const ids = new Set(group.item_ids);
      const items = content.activities?.filter((activity) => ids.has(activity.id)) ?? [];
      return <div className="bk-workbook-lesson bk-group-lesson">
        <p className="eyebrow">{lesson.skill} · {items.length} câu</p>
        <h3>{group.title}</h3>
        {group.instruction_en && <p>{group.instruction_en}</p>}
        {group.instruction_vi && <p>{group.instruction_vi}</p>}
        {group.visual_refs?.map((ref) => content.source_visuals?.[ref] && <StarterVisual key={ref} value={content.source_visuals[ref]} imageUrl={content.source_visual?.title === content.source_visuals[ref].title ? content.visual_url : undefined} />)}
        <OpenResponsePractice key={groupId} items={items} title={group.title} lessonSlug={lesson.slug} topic={lesson.title} />
        <div className="package-panel-actions"><button type="button" className="button primary" onClick={onClose}>Xong, về trang sách <ArrowRight size={17} /></button></div>
      </div>;
    }
  }
  const finish: ReactNode = next
    ? <div className="bk-finish-actions">
        <button type="button" className="button subtle" onClick={() => onOpenLesson(next)}>Mở luôn bài tập tiếp theo</button>
        <button type="button" className="button primary" onClick={() => onFinishLesson ? onFinishLesson(next) : onClose()}>Hoàn thành &amp; Lật sang trang sách tiếp theo: {lessonShortTitle(next)} <ArrowRight size={17} /></button>
      </div>
    : <button type="button" className="button primary" onClick={() => onFinishLesson ? onFinishLesson(undefined) : onClose()}>Gấp vở, về sách <ArrowRight size={17} /></button>;
  return data.packageContent
    ? <div className="package-lesson-page bk-workbook-lesson"><PackageLessonSteps {...data} packageContent={data.packageContent} finish={finish} onStepChange={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })} /></div>
    : <div className="bk-workbook-lesson"><LessonDetail {...data} /><div className="package-panel-actions">{finish}</div></div>;
}

function CheckSheet({ slug, stageId, onClose, path }: { slug: string; stageId: string; onClose: () => void; path: string }) {
  const result = useLoaded(`check:${slug}`, () => loadCheck(slug));
  if (!result?.data) return <SheetState error={result?.error} path={path} />;
  return <div className="bk-workbook-lesson bk-workbook-check">
    <AssessmentBody content={result.data} stageId={stageId} slug={slug} />
    <div className="package-panel-actions"><button type="button" className="button primary" onClick={onClose}>Xong, về sách <ArrowRight size={17} /></button></div>
  </div>;
}
