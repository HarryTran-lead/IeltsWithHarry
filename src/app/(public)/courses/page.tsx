import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { displayCourseTitle, stages } from "@/lib/demo-data";
import { learnStageAvailable, liveMode } from "@/lib/runtime";
import { getPublicCourses } from "@/lib/public-courses";

const stageStickers: StickerName[] = ["abc", "book", "rocket", "star"];

export default async function CoursesPage() {
  const courses = liveMode ? await getPublicCourses().catch(() => []) : [];
  const visibleCourses = courses.filter((course) => learnStageAvailable(course.stage_id));
  return (
    <div className="public-container">
      <header className="public-page-head">
        <div>
          <span className="eyebrow">EXPLORE THE ROADMAP</span>
          <h1>Find your next <span className="hl">learning step</span></h1>
          <p>
            Start with sample lessons and explore four learning milestones. Full
            courses are being developed.
          </p>
        </div>
        <div className="sticker-cluster">
          <Sticker name="mountain" size={100} tilt={-6} float />
          <Sticker name="plane" size={62} tilt={8} delay={140} />
          <Sticker name="star" label="7.5" size={58} tilt={-10} delay={240} />
        </div>
      </header>
      <div className="public-course-grid stagger">
        {stages.map((stage, index) => {
          const locked = !learnStageAvailable(stage.id);
          const content = <>
            <div className="course-stage-top">
              <span className="course-stage-index">{String(index + 1).padStart(2, "0")}</span>
              <Sticker name={stageStickers[index]} size={48} tilt={index % 2 ? 8 : -8} pop={false} />
            </div>
            <span className="course-stage-band">{stage.range}</span>
            <h2>{stage.name}</h2>
            <p>{stage.description}</p>
            <b>
              {locked ? "Đang biên soạn" : "Explore stage"} {!locked && <ArrowRight size={16} />}
            </b>
          </>;
          return locked ? <div key={stage.id} className="card course-stage" aria-disabled="true">{content}</div> : <Link href={`/courses/${stage.id}`} key={stage.id} className="card course-stage">{content}</Link>;
        })}
        <Link href="/register" className="card course-stage course-stage-cta">
          <Sticker name="harry" size={72} tilt={-6} pop={false} />
          <h2>Ready to start?</h2>
          <p>Create a free account to practise and save your progress.</p>
          <b>
            Bắt đầu học <ArrowRight size={16} />
          </b>
        </Link>
      </div>
      {liveMode && <section className="published-courses"><h2>Published courses</h2><div className="public-course-grid">{visibleCourses.map((course) => <Link href={`/courses/${course.slug}`} key={course.slug} className="card course-stage"><h3>{displayCourseTitle(course.stage_id, course.title)}</h3><p>{course.description}</p><b>View course <ArrowRight size={16} /></b></Link>)}</div>{!visibleCourses.length && <p>New courses are being prepared.</p>}</section>}
      <p className="guest-footnote">Milestones are guidance, not official IELTS scores.</p>
    </div>
  );
}
