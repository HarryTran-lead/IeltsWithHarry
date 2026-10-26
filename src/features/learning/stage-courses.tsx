"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenText, Check, Headphones, Languages, Mic, PenLine, SpellCheck, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { stages } from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { useNotebook } from "@/features/notebook/notebook-store";

type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: string; summary: string; sort_order: number };
type Unit = { id: string; course_id: string; title: string; sort_order: number; lessons: Lesson[] };
export type StageCourse = { id: string; slug: string; title: string; description: string; stage_id: string; units: Unit[] };

const skillStyle: Record<string, { icon: LucideIcon; tone: string }> = {
  Vocabulary: { icon: Languages, tone: "mint" },
  Grammar: { icon: SpellCheck, tone: "sky" },
  Reading: { icon: BookOpenText, tone: "coral" },
  Listening: { icon: Headphones, tone: "teal" },
  Writing: { icon: PenLine, tone: "sun" },
  Speaking: { icon: Mic, tone: "lavender" },
};

/** Published courses with their published units and lessons, grouped for the Learn page. Live mode only. */
export function usePublishedCourses() {
  const supabase = useMemo(() => (liveMode ? createClient() : null), []);
  const [courses, setCourses] = useState<StageCourse[]>([]);
  const [loading, setLoading] = useState(liveMode);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      const courseResult = await supabase.from("courses").select("id,slug,title,description,stage_id").eq("published", true).order("title");
      const courseIds = (courseResult.data ?? []).map((course) => course.id);
      const unitResult = courseIds.length ? await supabase.from("units").select("id,course_id,title,sort_order").eq("published", true).in("course_id", courseIds).order("sort_order") : { data: [], error: null };
      const unitIds = (unitResult.data ?? []).map((unit) => unit.id);
      const lessonResult = unitIds.length ? await supabase.from("lessons").select("id,unit_id,slug,title,skill,summary,sort_order").eq("published", true).in("unit_id", unitIds).order("sort_order") : { data: [], error: null };
      if (!active) return;
      const failure = courseResult.error ?? unitResult.error ?? lessonResult.error;
      if (failure) { setError(failure.message); setLoading(false); return; }
      const lessons = (lessonResult.data ?? []) as Lesson[];
      const units = ((unitResult.data ?? []) as Omit<Unit, "lessons">[]).map((unit) => ({ ...unit, lessons: lessons.filter((lesson) => lesson.unit_id === unit.id) }));
      setCourses(((courseResult.data ?? []) as Omit<StageCourse, "units">[])
        .map((course) => ({ ...course, units: units.filter((unit) => unit.course_id === course.id && unit.lessons.length) }))
        .filter((course) => course.units.length));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);
  return { courses, loading, error };
}

export function lessonCount(courses: StageCourse[], stageId: string) {
  return courses.filter((course) => course.stage_id === stageId).reduce((sum, course) => sum + course.units.reduce((total, unit) => total + unit.lessons.length, 0), 0);
}

/** A stage's units and lessons, marking lessons the learner has submitted or opened. */
export function StageLessons({ stageId, courses, loading, error }: { stageId: string; courses: StageCourse[]; loading: boolean; error: string }) {
  const { attempts } = useDemo();
  const { visits } = useNotebook();
  if (!liveMode) return null;
  const stage = stages.find((item) => item.id === stageId);
  const stageCourses = courses.filter((course) => course.stage_id === stageId);
  const done = new Set(attempts.map((attempt) => attempt.lesson));
  const opened = new Set(visits.map((visit) => visit.path));

  if (loading) return <section className="card section-card stage-lessons" aria-busy="true"><div className="stage-lessons-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div></section>;
  if (error) return <p className="form-error" role="alert">Không tải được bài học: {error}</p>;
  if (!stageCourses.length) return <section className="card section-card stage-lessons-empty"><h2>Bài học của chặng {stage?.name ?? ""}</h2><p>Chặng này đang được biên soạn. Bạn có thể luyện các kỹ năng bên dưới trong lúc chờ.</p></section>;

  return <>{stageCourses.map((course) => {
    const total = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
    const finished = course.units.reduce((sum, unit) => sum + unit.lessons.filter((lesson) => done.has(lesson.slug) || opened.has(`/app/lesson/${lesson.slug}`)).length, 0);
    return <section className="card section-card stage-lessons" key={course.id}>
      <div className="section-head">
        <div><h2>{course.title}</h2><p>{course.description}</p></div>
        <span className="stage-lessons-progress"><b>{finished}/{total}</b> bài đã học<i><em style={{ width: `${total ? (finished / total) * 100 : 0}%` }} /></i></span>
      </div>
      <div className="stage-units">{course.units.map((unit) => {
        const unitDone = unit.lessons.filter((lesson) => done.has(lesson.slug) || opened.has(`/app/lesson/${lesson.slug}`)).length;
        return <div className="stage-unit" key={unit.id}>
          <div className="stage-unit-head"><h3>{unit.title}</h3><span>{unitDone}/{unit.lessons.length}</span></div>
          <div className="stage-unit-lessons">{unit.lessons.map((lesson) => {
            const style = skillStyle[lesson.skill] ?? skillStyle.Reading;
            const submitted = done.has(lesson.slug);
            const visited = opened.has(`/app/lesson/${lesson.slug}`);
            return <Link key={lesson.id} href={`/app/lesson/${lesson.slug}`} className={`stage-lesson ${submitted || visited ? "is-done" : ""}`} title={lesson.summary}>
              <span className={`head-icon tone-${style.tone}`}><style.icon size={16} /></span>
              <span className="stage-lesson-copy"><small>{lesson.skill}</small><b>{lesson.title}</b></span>
              {submitted || visited ? <span className="stage-lesson-state" aria-label={submitted ? "Đã nộp bài" : "Đã mở"}><Check size={13} strokeWidth={3} /></span> : <ArrowRight size={15} className="stage-lesson-arrow" />}
            </Link>;
          })}</div>
        </div>;
      })}</div>
    </section>;
  })}</>;
}

/** On the Learn overview: one compact card per published course, linking to its stage. */
export function OpenCourses({ courses, loading }: { courses: StageCourse[]; loading: boolean }) {
  if (!liveMode || loading || !courses.length) return null;
  return <section className="card section-card">
    <div className="section-head"><h2>Khóa học đang mở</h2><span>Chọn một khóa để xem các unit và bài học.</span></div>
    <div className="open-courses">{courses.map((course) => {
      const stage = stages.find((item) => item.id === course.stage_id);
      const total = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
      return <Link key={course.id} href={`/app/learn/${course.stage_id}`} className="open-course lift">
        <span className="course-stage-band">{stage?.range ?? course.stage_id}</span>
        <b>{course.title}</b>
        <small>{stage?.name} · {course.units.length} unit · {total} bài</small>
        <ArrowRight size={16} />
      </Link>;
    })}</div>
  </section>;
}
