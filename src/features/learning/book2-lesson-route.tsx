"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import catalog from "@/data/book2/catalog.json";
import { Book2LessonPage, type Book2Content } from "./book2-lesson";

export function Book2LessonRoute({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [content, setContent] = useState<Book2Content | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lessons = useMemo(() => catalog.units.flatMap((unit) => unit.lessons), []);
  const index = lessons.findIndex((lesson) => lesson.slug === slug);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/book2/lessons/${slug}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (response.status === 401) throw new Error("Hãy đăng nhập để mở bài học.");
      if (!response.ok) throw new Error("Không tải được dữ liệu bài học.");
      const value = await response.json() as Book2Content;
      if (value.book_id !== "BOOK_2" || value.source_id.toLowerCase() !== slug) throw new Error("Dữ liệu bài học không hợp lệ.");
      setContent(value);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được bài học."); });
    return () => controller.abort();
  }, [slug, attempt]);
  if (index < 0) return null;
  const lesson = lessons[index];
  const navigation = { previous: lessons[index - 1] ?? null, next: lessons[index + 1] ?? null, index: index + 1, total: lessons.length };
  return <DemoProvider><NotebookProvider>{content?.source_id.toLowerCase() === slug
    ? <Book2LessonPage key={slug} lesson={lesson} content={content} navigation={navigation} canManage={canManage} />
    : <AppShell canManage={canManage}><div className="content-page book2-page"><div className="book2-card"><h1>{error ? "Chưa tải được bài học" : "Đang tải bài học…"}</h1>{error && <><p role="alert">{error}</p><div className="book2-next"><button className="button primary" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Thử tải lại</button><Link className="button subtle" href="/app/learn/ielts-builder">Về Level 2</Link></div></>}</div></div></AppShell>}
  </NotebookProvider></DemoProvider>;
}
