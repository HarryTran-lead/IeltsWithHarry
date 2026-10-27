import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Sticker, Tape, type StickerName } from "@/components/stickers/stickers";
import { stages } from "@/lib/demo-data";
import { liveMode, releaseLocks } from "@/lib/runtime";
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
    const { data: course } = await supabase.from("courses").select("id,title,description,stage_id").eq("slug", slug).eq("published", true).maybeSingle();
    if (course && releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(course.stage_id)) notFound();
    if (course) {
      const { data: units } = await supabase.from("units").select("id,title").eq("course_id", course.id).eq("published", true).order("sort_order");
      const unitIds = (units ?? []).map((unit) => unit.id);
      const { data: lessons } = unitIds.length ? await supabase.from("lessons").select("id,unit_id,slug,title,skill,summary").in("unit_id", unitIds).eq("published", true).order("sort_order") : { data: [] };
      return <div className="public-container"><span className="eyebrow">PUBLISHED COURSE</span><h1>{course.title}</h1><p>{course.description}</p>{(units ?? []).map((unit) => <section className="card public-message" key={unit.id}><h2>{unit.title}</h2>{(lessons ?? []).filter((lesson) => lesson.unit_id === unit.id).map((lesson) => <p key={lesson.id}><Link href={`/app/lesson/${lesson.slug}`}>{lesson.skill} · {lesson.title} →</Link></p>)}</section>)}</div>;
    }
  }
  if (!stage) notFound();
  if (releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(stage.id)) notFound();
  const index = stages.indexOf(stage);
  return (
    <div className="public-container">
      <Link href="/courses" className="public-back"><ArrowLeft size={16} /> All stages</Link>
      <header className="public-page-head">
        <div>
          <span className="eyebrow">LEARNING STAGE {String(index + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}</span>
          <h1>
            {stage.range} · {stage.name}
          </h1>
          <p>{stage.description}</p>
        </div>
        <div className="sticker-cluster">
          <Sticker name="star" label={stage.range.split("–")[0]} size={100} tilt={-8} float />
          <Sticker name="book" size={60} tilt={-10} delay={140} />
          <Sticker name="pencil" size={48} tilt={14} delay={240} />
        </div>
      </header>
      <div className="stage-detail">
        <div className="card public-message">
          <Tape tone="teal" />
          <h2>Explore the sample curriculum</h2>
          <p>
            Activities for each skill are available in demo mode. This stage is a
            learning milestone, not an official IELTS certification.
          </p>
          <ul className="stage-skill-list">
            {skills.map((skill) => <li key={skill.name}><Sticker name={skill.sticker} size={36} pop={false} /> {skill.name}</li>)}
          </ul>
          <Link href="/login" className="button primary">
            Đăng nhập để học <ArrowRight size={16} />
          </Link>
        </div>
        <aside className="card stage-neighbours">
          <h3>Roadmap</h3>
          <ol>
            {stages.map((item) => <li key={item.id} className={item.id === stage.id ? "current" : ""}><Link href={`/courses/${item.id}`}><span>{item.range}</span>{item.name}</Link></li>)}
          </ol>
        </aside>
      </div>
    </div>
  );
}

const skills: { name: string; sticker: StickerName }[] = [
  { name: "Vocabulary", sticker: "abc" },
  { name: "Grammar", sticker: "pencil" },
  { name: "Reading", sticker: "book" },
  { name: "Listening", sticker: "headphones" },
  { name: "Writing", sticker: "chart" },
  { name: "Speaking", sticker: "mic" },
];
