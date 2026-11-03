"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import catalog from "@/data/book2/catalog.json";
import { Book2LessonPage, type Book2Content } from "./book2-lesson";

export function Book2LessonRoute({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [content, setContent] = useState<Book2Content | null>(null);
  const [error, setError] = useState("");
  const lessons = useMemo(() => catalog.units.flatMap((unit) => unit.lessons), []);
  const index = lessons.findIndex((lesson) => lesson.slug === slug);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/book-2/lessons/${slug}.json`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Không tải được dữ liệu bài học.");
      const value = await response.json() as Book2Content;
      if (value.book_id !== "BOOK_2" || value.source_id.toLowerCase() !== slug) throw new Error("Dữ liệu bài học không hợp lệ.");
      setContent(value);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được bài học."); });
    return () => controller.abort();
  }, [slug]);
  if (index < 0) return null;
  const lesson = lessons[index];
  const navigation = { previous: lessons[index - 1] ?? null, next: lessons[index + 1] ?? null, index: index + 1, total: lessons.length };
  return <DemoProvider><NotebookProvider>{content?.source_id.toLowerCase() === slug
    ? <Book2LessonPage key={slug} lesson={lesson} content={content} navigation={navigation} canManage={canManage} />
    : <AppShell canManage={canManage}><div className="content-page">{error || "Đang tải bài học…"}</div></AppShell>}
  </NotebookProvider></DemoProvider>;
}
