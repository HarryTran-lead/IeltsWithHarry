"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, Check, Headphones, Languages, MapPin, Mic, PenLine, SpellCheck, Ticket, type LucideIcon } from "lucide-react";
import { Sticker } from "@/components/stickers/stickers";
import { celebrate } from "@/lib/celebrate";
import type { StageCourse } from "./stage-courses";

const skillIcon: Record<string, LucideIcon> = {
  Vocabulary: Languages, Grammar: SpellCheck, Reading: BookOpenText, Listening: Headphones, Writing: PenLine, Speaking: Mic,
};
// Each unit is drawn as its own coloured line on the study map.
const lineTones = ["teal", "lavender", "coral", "sky", "sun", "mint"] as const;

type PathLesson = StageCourse["units"][number]["lessons"][number];

/**
 * The course as a study "metro map": every unit is a coloured line, every
 * lesson a station with its full title, the next lesson is marked
 * "Bạn đang ở đây", and finishing a line earns a ticket stamp.
 */
export function LessonPath({ course, isDone }: { course: StageCourse; isDone: (lesson: PathLesson) => boolean }) {
  const lessons = course.units.flatMap((unit) => unit.lessons);
  const current = lessons.find((lesson) => !isDone(lesson));
  const total = lessons.length;
  const finished = lessons.filter(isDone).length;
  const packagePrefix = course.slug.match(/^(preielts|mindsetstarter|mindsetbuilder|mindsetadvanced)-/)?.[1];
  const hasChecks = Boolean(packagePrefix) || course.stage_id === "foundation" || course.stage_id === "elementary";
  const finalCheckSlug = `${packagePrefix ?? course.stage_id}-final-check`;

  return <div className="study-map">
    <div className="study-map-lines">
      {course.units.map((unit, unitIndex) => {
        const tone = lineTones[unitIndex % lineTones.length];
        const unitDone = unit.lessons.filter(isDone).length;
        const complete = unitDone === unit.lessons.length;
        return <section className={`map-line tone-${tone}`} key={unit.id} aria-label={unit.title}>
          <header className="map-line-head">
            <span className="map-line-badge">U{unitIndex + 1}</span>
            <div><small>Tuyến {unitIndex + 1}</small><h3>{unit.title.replace(/^Unit \d+\s*·\s*/, "")}</h3></div>
            <span className="map-line-count">{unitDone}/{unit.lessons.length} ga</span>
          </header>
          <ol className="map-stations">
            {unit.lessons.map((lesson) => {
              const Icon = skillIcon[lesson.skill] ?? BookOpenText;
              const done = isDone(lesson);
              const here = current?.id === lesson.id;
              return <li key={lesson.id} className={`map-station ${done ? "is-done" : here ? "is-here" : ""}`}>
                <Link href={`/app/lesson/${lesson.slug}`} className="map-station-link">
                  <span className="map-station-dot" aria-hidden="true">{done && <Check size={12} strokeWidth={4} />}</span>
                  <span className="map-station-skill"><Icon size={16} /></span>
                  <span className="map-station-copy">
                    <small>{lesson.skill}{here && <b className="map-here"><MapPin size={12} /> Bạn đang ở đây</b>}</small>
                    <strong>{lesson.title}</strong>
                    <span>{lesson.summary}</span>
                  </span>
                  <span className="map-station-go">{here ? <>Vào học <ArrowRight size={15} /></> : done ? "Học lại" : <ArrowRight size={16} />}</span>
                </Link>
                {here && <Sticker name="harry" size={64} tilt={-6} float className="map-harry" />}
              </li>;
            })}
            <li className={`map-station map-terminal ${complete ? "is-done" : ""}`}>
              <button type="button" className="map-ticket" onClick={(event) => { if (complete) celebrate(event.currentTarget, { label: "Hoàn thành tuyến!", pieces: 40 }); }} aria-label={complete ? `Đã hoàn thành ${unit.title}` : `Hoàn thành ${unit.title} để nhận tem`}>
                <span className="map-station-dot" aria-hidden="true" />
                <Ticket size={18} />
                <span>{complete ? "Ga cuối · đã nhận tem hoàn thành" : `Ga cuối · còn ${unit.lessons.length - unitDone} bài để nhận tem`}</span>
                {complete && <Sticker name="stamp" label="XONG" size={54} tilt={-12} className="map-stamp" />}
              </button>
              {hasChecks && <Link className="button subtle" href={`/app/check/${unit.slug}-check`}>Kiểm tra Unit {unitIndex + 1} →</Link>}
            </li>
          </ol>
        </section>;
      })}
    </div>
    <aside className="study-map-side">
      <div className="card study-map-panel">
        <small>{course.title}</small>
        <div className="study-map-score"><b>{finished}</b><span>/ {total} ga đã qua</span></div>
        <div className="study-map-bar"><i style={{ width: `${total ? (finished / total) * 100 : 0}%` }} /></div>
        {current ? <Link href={`/app/lesson/${current.slug}`} className="button primary wide">Học tiếp: {current.title} <ArrowRight size={16} /></Link> : <p className="study-map-finished">Bạn đã đi hết các tuyến của khóa này.</p>}
        {hasChecks && <Link href={`/app/check/${finalCheckSlug}`} className="button subtle wide">Bài kiểm tra cuối khóa →</Link>}
      </div>
      <div className="card study-map-panel study-map-legend">
        <h4>Đọc bản đồ học</h4>
        <p><i className="legend-dot done" /> Ga đã qua: bài đã mở hoặc đã nộp</p>
        <p><i className="legend-dot here" /> Bạn đang ở đây: bài nên học tiếp</p>
        <p><i className="legend-dot next" /> Ga phía trước: vẫn vào học trước được</p>
        <p><Ticket size={15} /> Đi hết một tuyến để nhận tem</p>
      </div>
    </aside>
  </div>;
}
