import { notFound, redirect } from "next/navigation";
import { CourseAssessment } from "@/features/learning/course-assessment";
import { createClient } from "@/lib/supabase/server";
import { learnStageAvailable } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";

export default async function CheckPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if ((await getViewerRole()) === "guest") redirect(`/login?next=${encodeURIComponent(`/app/check/${slug}`)}`);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: assessment } = await supabase.from("package_assessments").select("title,content,course_id").eq("slug", slug).maybeSingle();
  if (!assessment) notFound();
  const { data: course } = await supabase.from("courses").select("stage_id").eq("id", assessment.course_id).single();
  if (!course) notFound();
  if (!learnStageAvailable(course.stage_id)) notFound();
  return <CourseAssessment content={{ ...assessment.content as Record<string, unknown>, title: assessment.title }} stageId={course.stage_id} />;
}
