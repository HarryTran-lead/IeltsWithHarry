"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";
import { stages } from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { useNotebook } from "@/features/notebook/notebook-store";
import { loadPracticeResults, resultTone, type PracticeResult } from "./practice-results";
import book2Catalog from "@/data/book2/catalog.json";
import "./study-course.css";

type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: string; summary: string; sort_order: number; objective_count?: number };
type Unit = { id: string; course_id: string; slug: string; title: string; sort_order: number; lessons: Lesson[] };
export type StageCourse = { id: string; slug: string; title: string; description: string; stage_id: string; units: Unit[] };

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
      const unitResult = courseIds.length ? await supabase.from("units").select("id,course_id,slug,title,sort_order").eq("published", true).in("course_id", courseIds).order("sort_order") : { data: [], error: null };
      const unitIds = (unitResult.data ?? []).map((unit) => unit.id);
      const lessonResult = unitIds.length ? await supabase.from("lessons").select("id,unit_id,slug,title,skill,summary,sort_order").eq("published", true).in("unit_id", unitIds).order("sort_order") : { data: [], error: null };
      if (!active) return;
      const failure = courseResult.error ?? unitResult.error ?? lessonResult.error;
      if (failure) { setError(failure.message); setLoading(false); return; }
      const lessons = (lessonResult.data ?? []) as Lesson[];
      const units = ((unitResult.data ?? []) as Omit<Unit, "lessons">[]).map((unit) => ({ ...unit, lessons: lessons.filter((lesson) => lesson.unit_id === unit.id) }));
      setCourses([book2Catalog as StageCourse, ...((courseResult.data ?? []) as Omit<StageCourse, "units">[])
        .map((course) => ({ ...course, units: units.filter((unit) => unit.course_id === course.id && unit.lessons.length) }))
        .filter((course) => course.units.length)]
        .sort((a, b) => Number(b.slug === "english-skill-lab-book-2") - Number(a.slug === "english-skill-lab-book-2")));
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

  const isDone = (lesson: Lesson) => done.has(lesson.slug) || opened.has(`/app/lesson/${lesson.slug}`);
  return <CourseViews courses={stageCourses} isDone={isDone} />;
}

/** A compact unit and skill syllabus with next actions and saved practice results. */
function CourseViews({ courses, isDone }: { courses: StageCourse[]; isDone: (lesson: Lesson) => boolean }) {
  return <div className="study-courses">{courses.map((course) => <StudyCourse key={course.id} course={course} isDone={isDone} />)}</div>;
}

const skillLabels: Record<string, string> = { Reading: "Đọc", Listening: "Nghe", Writing: "Viết", Speaking: "Nói", Vocabulary: "Từ vựng", Grammar: "Ngữ pháp" };

function StudyCourse({ course, isDone }: { course: StageCourse; isDone: (lesson: Lesson) => boolean }) {
  const [skill, setSkill] = useState("all");
  const [results, setResults] = useState<Record<string, PracticeResult>>({});
  const lessons = useMemo(() => course.units.flatMap((unit) => unit.lessons), [course.units]);
  useEffect(() => {
    let active = true;
    void loadPracticeResults(lessons.map((lesson) => lesson.slug)).then((value) => { if (active) setResults(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [lessons]);
  const practiced = lessons.filter((lesson) => (results[lesson.slug]?.checked ?? 0) > 0).length;
  const next = lessons.find((lesson) => !results[lesson.slug] && !isDone(lesson)) ?? lessons.find((lesson) => !results[lesson.slug]) ?? lessons[0];
  const options = ["all", ...new Set(lessons.map((lesson) => lesson.skill))];
  return <section className="study-course" aria-label={course.title}>
    <header className="study-course-head"><div><span className="eyebrow">LỘ TRÌNH TỰ HỌC · {course.units.length} UNIT</span><h2>{course.title}</h2><p>{course.description}</p></div><div className="study-course-progress"><strong>{practiced}/{lessons.length}</strong><span>bài đã luyện</span><div className="study-course-bar"><i style={{ width: `${lessons.length ? practiced / lessons.length * 100 : 0}%` }} /></div></div></header>
    <div className="study-course-actions">{next && <Link className="button primary" href={`/app/lesson/${next.slug}`}>Học tiếp: {next.title} <ArrowRight size={16} /></Link>}<span>Chọn kỹ năng hoặc mở một unit để học theo mục tiêu.</span></div>
    <div className="study-skill-filter" role="group" aria-label="Lọc theo kỹ năng">{options.map((option) => <button key={option} type="button" className={skill === option ? "active" : ""} aria-pressed={skill === option} onClick={() => setSkill(option)}>{option === "all" ? "Tất cả" : skillLabels[option] ?? option}</button>)}</div>
    <div className="study-unit-list">{course.units.map((unit, unitIndex) => {
      const shown = unit.lessons.filter((lesson) => skill === "all" || lesson.skill === skill);
      if (!shown.length) return null;
      const count = unit.lessons.filter((lesson) => results[lesson.slug]?.checked).length;
      return <details key={unit.id} className="study-unit" open={unitIndex === 0 ? true : undefined}><summary><span className="study-unit-number">{String(unitIndex + 1).padStart(2, "0")}</span><span className="study-unit-title"><strong>{unit.title}</strong><small>{count}/{unit.lessons.length} bài đã luyện · {unit.lessons.length} bài</small></span><span className="study-unit-arrow">⌄</span></summary><div className="study-lesson-grid">{shown.map((lesson, index) => { const result = results[lesson.slug]; const tone = resultTone(result); return <Link key={lesson.id} className={`study-lesson ${tone}`} href={`/app/lesson/${lesson.slug}`}><span className="study-lesson-seq">{String(index + 1).padStart(2, "0")}</span><span className="study-lesson-body"><small>{skillLabels[lesson.skill] ?? lesson.skill} {result?.checked ? lesson.objective_count === 0 ? `· ${result.checked}/${result.total} đã tự đánh giá` : `· ${result.correct}/${result.checked} đúng` : isDone(lesson) ? "· Đã mở" : "· Chưa học"}</small><strong>{lesson.title}</strong>{lesson.summary && <span>{lesson.summary}</span>}</span>{result?.checked ? tone === "is-weak" ? <RotateCcw size={18} /> : <CheckCircle2 size={18} /> : <ArrowRight size={17} />}</Link>; })}</div></details>;
    })}</div>
  </section>;
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
        <small>{stage?.name} · {course.slug.includes("foundation-journey") ? `${course.units.length - 1} unit + 5 bài khởi động` : `${course.units.length} unit`} · {total} bài</small>
        <ArrowRight size={16} />
      </Link>;
    })}</div>
  </section>;
}
