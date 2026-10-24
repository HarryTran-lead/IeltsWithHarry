import { notFound } from "next/navigation";
import Link from "next/link";
import { stages } from "@/lib/demo-data";
import { liveMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stage = stages.find((item) => item.id === slug);
  if (!stage && liveMode) {
    const supabase = await createClient();
    const { data: course } = await supabase.from("courses").select("id,title,description").eq("slug", slug).eq("published", true).maybeSingle();
    if (course) {
      const { data: units } = await supabase.from("units").select("id,title").eq("course_id", course.id).eq("published", true).order("sort_order");
      const unitIds = (units ?? []).map((unit) => unit.id);
      const { data: lessons } = unitIds.length ? await supabase.from("lessons").select("id,unit_id,slug,title,skill,summary").in("unit_id", unitIds).eq("published", true).order("sort_order") : { data: [] };
      return <div className="public-container"><span className="eyebrow">PUBLISHED COURSE</span><h1>{course.title}</h1><p>{course.description}</p>{(units ?? []).map((unit) => <section className="card public-message" key={unit.id}><h2>{unit.title}</h2>{(lessons ?? []).filter((lesson) => lesson.unit_id === unit.id).map((lesson) => <p key={lesson.id}><Link href={`/app/lesson/${lesson.slug}`}>{lesson.skill} · {lesson.title} →</Link></p>)}</section>)}</div>;
    }
  }
  if (!stage) notFound();
  return (
    <div className="public-container">
      <span className="eyebrow">LEARNING STAGE</span>
      <h1>
        {stage.range} · {stage.name}
      </h1>
      <p>{stage.description}</p>
      <div className="card public-message">
        <h2>Explore the sample curriculum</h2>
        <p>
          Activities for each skill are available in demo mode. This stage is a
          learning milestone, not an official IELTS certification.
        </p>
        <Link href={`/app/learn/${stage.id}`} className="button primary">
          Open stage →
        </Link>
      </div>
    </div>
  );
}
