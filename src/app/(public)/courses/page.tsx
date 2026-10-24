import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { stages } from "@/lib/demo-data";
import { liveMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
export default async function CoursesPage() {
  const courses = liveMode ? (await (await createClient()).from("courses").select("slug,title,description").eq("published", true).order("title")).data ?? [] : [];
  return (
    <div className="public-container">
      <span className="eyebrow">EXPLORE THE ROADMAP</span>
      <h1>Find your next learning step</h1>
      <p>
        Start with sample lessons and explore seven learning milestones. Full
        courses are being developed.
      </p>
      <div className="public-course-grid">
        {stages.map((stage) => (
          <Link href={`/app/learn/${stage.id}`} key={stage.id} className="card">
            <span>{stage.range}</span>
            <h2>{stage.name}</h2>
            <p>{stage.description}</p>
            <b>
              Explore stage <ArrowRight size={16} />
            </b>
          </Link>
        ))}
      </div>
      {liveMode && <section className="published-courses"><h2>Published courses</h2><div className="public-course-grid">{courses.map((course) => <Link href={`/courses/${course.slug}`} key={course.slug} className="card"><h3>{course.title}</h3><p>{course.description}</p><b>View course <ArrowRight size={16} /></b></Link>)}</div>{!courses.length && <p>New courses are being prepared.</p>}</section>}
    </div>
  );
}
