import { notFound, redirect } from "next/navigation";
import { LessonShell } from "@/features/learning/lesson-detail";
import { CoursePackageLessonShell } from "@/features/learning/course-package-lesson-shell";
import { Portal } from "@/features/portal";
import { demoMode, releaseLocks, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { getViewerRole } from "@/lib/viewer-role";
import { skillMaterialSchema } from "@/lib/skill-material";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  if (demoMode) return <Portal canManage={(await getViewerRole()) === "admin"} />;
  if (!supabaseConfigured) return <main className="setup-notice"><h1>Backend setup required</h1><p>Connect Supabase to see published lessons.</p></main>;
  const { slug } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  let lessonQuery = supabase.from("lessons").select("id,unit_id,slug,title,skill,summary").eq("slug", slug);
  if (isAdmin !== true) lessonQuery = lessonQuery.eq("published", true);
  const { data: lesson } = await lessonQuery.maybeSingle();
  if (!lesson) notFound();
  if (releaseLocks && isAdmin !== true) {
    const { data: unit } = await supabase.from("units").select("course_id").eq("id", lesson.unit_id).maybeSingle();
    const { data: course } = unit ? await supabase.from("courses").select("stage_id").eq("id", unit.course_id).maybeSingle() : { data: null };
    if (course && ["foundation", "elementary", "pre-ielts"].includes(course.stage_id)) notFound();
  }
  const [blockResult, questionResult, wordResult, materialResult, packageResult] = await Promise.all([
    supabase.from("lesson_blocks").select("id,kind,body").eq("lesson_id", lesson.id).order("sort_order"),
    supabase.from("exercise_questions").select("id,slug,prompt,options").eq("lesson_id", lesson.id).order("sort_order"),
    supabase.from("vocabulary_entries").select("id,word,phonetic,meaning_vi,definition,example,sentence_prompt_vi,accepted_sentences").eq("lesson_id", lesson.id).order("sort_order"),
    supabase.from("lesson_materials").select("content").eq("lesson_id", lesson.id).maybeSingle(),
    supabase.from("package_lesson_content").select("content").eq("lesson_id", lesson.id).maybeSingle(),
  ]);
  if (blockResult.error || questionResult.error || wordResult.error || materialResult.error || packageResult.error) throw new Error("Could not load lesson content");
  const questions = (questionResult.data ?? []).map((item) => ({ ...item, options: Array.isArray(item.options) ? item.options.filter((value): value is string => typeof value === "string") : [] }));
  const parsedMaterial = skillMaterialSchema.safeParse(materialResult.data?.content);
  const material = parsedMaterial.success && parsedMaterial.data.skill === lesson.skill ? parsedMaterial.data : null;
  const props = { lesson, blocks: blockResult.data ?? [], questions, words: wordResult.data ?? [], material, canManage: isAdmin === true };
  let navigation: { previous: { slug: string; title: string } | null; next: { slug: string; title: string } | null; index: number; total: number } | null = null;
  if (packageResult.data?.content) {
    const { data: unit, error: unitError } = await supabase.from("units").select("course_id").eq("id", lesson.unit_id).single();
    if (unitError || !unit) throw new Error("Could not load course navigation");
    let unitsQuery = supabase.from("units").select("id,sort_order").eq("course_id", unit.course_id).order("sort_order");
    if (isAdmin !== true) unitsQuery = unitsQuery.eq("published", true);
    const { data: units, error: unitsError } = await unitsQuery;
    if (unitsError) throw new Error("Could not load course units");
    const unitIds = (units ?? []).map((item) => item.id);
    if (unitIds.length) {
      let lessonsQuery = supabase.from("lessons").select("slug,title,unit_id,sort_order").in("unit_id", unitIds);
      if (isAdmin !== true) lessonsQuery = lessonsQuery.eq("published", true);
      const { data: courseLessons, error: lessonsError } = await lessonsQuery;
      if (lessonsError) throw new Error("Could not load lesson navigation");
      const order = new Map(unitIds.map((id, index) => [id, index]));
      const ordered = (courseLessons ?? []).sort((a, b) => (order.get(a.unit_id) ?? 0) - (order.get(b.unit_id) ?? 0) || a.sort_order - b.sort_order);
      const index = ordered.findIndex((item) => item.slug === slug);
      if (index >= 0) navigation = { previous: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null, index: index + 1, total: ordered.length };
    }
  }
  return packageResult.data?.content
    ? <CoursePackageLessonShell key={lesson.slug} {...props} packageContent={packageResult.data.content} navigation={navigation} />
    : <LessonShell {...props} />;
}
