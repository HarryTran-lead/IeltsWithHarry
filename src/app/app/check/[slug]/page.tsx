import { notFound, redirect } from "next/navigation";
import { CourseAssessment } from "@/features/learning/course-assessment";
import { createClient } from "@/lib/supabase/server";
import { releaseLocks } from "@/lib/runtime";

export default async function CheckPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: assessment } = await supabase.from("package_assessments").select("title,content,course_id").eq("slug", slug).maybeSingle();
  if (!assessment) notFound();
  const { data: course } = await supabase.from("courses").select("stage_id").eq("id", assessment.course_id).single();
  if (!course) notFound();
  if (releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(course.stage_id)) notFound();
  return <CourseAssessment content={{ ...assessment.content as Record<string, unknown>, title: assessment.title }} stageId={course.stage_id} />;
}
