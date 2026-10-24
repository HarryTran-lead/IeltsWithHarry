import { notFound, redirect } from "next/navigation";
import { LessonShell } from "@/features/learning/lesson-detail";
import { Portal } from "@/features/portal";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { getViewerRole } from "@/lib/viewer-role";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  if (demoMode) return <Portal canManage={(await getViewerRole()) === "admin"} />;
  if (!supabaseConfigured) return <main className="setup-notice"><h1>Backend setup required</h1><p>Connect Supabase to see published lessons.</p></main>;
  const { slug } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: lesson } = await supabase.from("lessons").select("id,slug,title,skill,summary").eq("slug", slug).eq("published", true).maybeSingle();
  if (!lesson) notFound();
  const [blockResult, questionResult, wordResult] = await Promise.all([
    supabase.from("lesson_blocks").select("id,kind,body").eq("lesson_id", lesson.id).order("sort_order"),
    supabase.from("exercise_questions").select("id,slug,prompt,options").eq("lesson_id", lesson.id).order("sort_order"),
    supabase.from("vocabulary_entries").select("id,word,phonetic,meaning_vi,definition,example").eq("lesson_id", lesson.id).order("sort_order"),
  ]);
  if (blockResult.error || questionResult.error || wordResult.error) throw new Error("Could not load lesson content");
  const questions = (questionResult.data ?? []).map((item) => ({ ...item, options: Array.isArray(item.options) ? item.options.filter((value): value is string => typeof value === "string") : [] }));
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return <LessonShell lesson={lesson} blocks={blockResult.data ?? []} questions={questions} words={wordResult.data ?? []} canManage={isAdmin === true} />;
}
