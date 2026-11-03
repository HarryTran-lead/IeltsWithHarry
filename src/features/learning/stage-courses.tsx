"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenText, Check, ChevronDown, Headphones, Mic2, PenLine, RotateCcw, Sparkles, Star, Trophy, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { liveMode, releaseLocks } from "@/lib/runtime";
import { stages } from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { useNotebook } from "@/features/notebook/notebook-store";
import { loadPracticeResults, subscribePracticeResults, type PracticeResult } from "./practice-results";
import book2Catalog from "@/data/book2/catalog.json";
import { Sticker } from "@/components/stickers/stickers";
import "./study-course.css";

type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: string; summary: string; sort_order: number; objective_count?: number; question_count?: number; supplement?: boolean };
type Unit = { id: string; course_id: string; slug: string; title: string; sort_order: number; lessons: Lesson[] };
export type StageCourse = { id: string; slug: string; title: string; description: string; stage_id: string; units: Unit[] };

/** Published courses with their published units and lessons, grouped for the Learn page. Book 2 is static, so demo mode shows it too. */
export function usePublishedCourses() {
  const supabase = useMemo(() => (liveMode ? createClient() : null), []);
  const [courses, setCourses] = useState<StageCourse[]>(() => releaseLocks || !liveMode ? [book2Catalog as StageCourse] : []);
  const [loading, setLoading] = useState(liveMode && !releaseLocks);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase || releaseLocks) return;
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
  if (!liveMode && !courses.some((course) => course.stage_id === stageId)) return null;
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
  const book2Primary = courses[0]?.slug === "english-skill-lab-book-2";
  return <div className="study-courses">{courses.map((course, index) => index === 0 || !book2Primary
    ? <StudyCourse key={course.id} course={course} isDone={isDone} />
    : <details className="study-older-course" key={course.id}><summary><BookOpenText size={20} /><span><strong>Khóa học bổ trợ</strong><small>{course.title} · {course.units.reduce((sum, unit) => sum + unit.lessons.length, 0)} bài</small></span><ChevronDown size={18} /></summary><StudyCourse course={course} isDone={isDone} /></details>)}</div>;
}

const skillLabels: Record<string, string> = { Reading: "Đọc", Listening: "Nghe", Writing: "Viết", Speaking: "Nói", Vocabulary: "Từ vựng", Grammar: "Ngữ pháp" };
const skillIcons: Record<string, LucideIcon> = { Reading: BookOpenText, Listening: Headphones, Writing: PenLine, Speaking: Mic2, Vocabulary: Sparkles, Grammar: PenLine };
const unitColors = ["#0b8e92", "#2478bb", "#9955b0", "#b96331", "#397d5e", "#586ab2", "#9e587d", "#8d701d"];
const lanePositions = [42, 55, 50, 38];

function lessonStatus(lesson: Lesson, result: PracticeResult | undefined, isDone: (lesson: Lesson) => boolean, nextSlug: string | undefined) {
  if (isComplete(lesson, result)) return "complete";
  if (isReview(lesson, result)) return "review";
  if (lesson.slug === nextSlug) return "current";
  if (result?.checked || isDone(lesson)) return "started";
  return "upcoming";
}

function isComplete(lesson: Lesson, result: PracticeResult | undefined) {
  if (!result?.checked || result.checked < result.total || !result.total) return false;
  if (lesson.slug.startsWith("b2-")) return result.mastered ?? (lesson.objective_count === lesson.question_count && result.correct / result.checked >= 0.8);
  return lesson.objective_count === 0 || result.correct / result.checked >= 0.8;
}

function isReview(lesson: Lesson, result: PracticeResult | undefined) {
  if (!result?.checked) return false;
  if (lesson.slug.startsWith("b2-")) return result.needsReview ?? (lesson.objective_count !== 0 && result.correct / result.checked < 0.8);
  return lesson.objective_count !== 0 && result.correct / result.checked < 0.8;
}

function nextLesson(lessons: Lesson[], results: Record<string, PracticeResult>, isDone: (lesson: Lesson) => boolean) {
  return lessons.find((lesson) => { const result = results[lesson.slug]; return result?.checked && result.checked < result.total; })
    ?? lessons.find((lesson) => isReview(lesson, results[lesson.slug]))
    ?? lessons.find((lesson) => isDone(lesson) && !results[lesson.slug]?.checked)
    ?? lessons.find((lesson) => !results[lesson.slug]?.checked)
    ?? lessons.find((lesson) => !isComplete(lesson, results[lesson.slug]));
}

function JourneyUnit({ unit, unitIndex, shown, nextSlug, results, isDone, initialOpen }: { unit: Unit; unitIndex: number; shown: Lesson[]; nextSlug?: string; results: Record<string, PracticeResult>; isDone: (lesson: Lesson) => boolean; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const practiced = shown.filter((lesson) => (results[lesson.slug]?.checked ?? 0) > 0).length;
  const filtered = shown.length !== unit.lessons.length;
  const complete = unit.lessons.every((lesson) => lessonStatus(lesson, results[lesson.slug], isDone, nextSlug) === "complete");
  const color = unitColors[unitIndex % unitColors.length];
  return <section className={`journey-unit ${open ? "is-open" : ""}`} style={{ "--unit-color": color } as CSSProperties} aria-label={unit.title}>
    <button type="button" className="journey-unit-header" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="journey-unit-medal">{complete ? <Trophy size={25} /> : String(unit.sort_order || unitIndex + 1).padStart(2, "0")}</span>
      <span className="journey-unit-copy"><small>UNIT {String(unit.sort_order || unitIndex + 1).padStart(2, "0")}{shown.some((lesson) => lesson.slug === nextSlug) ? " · ĐANG HỌC" : complete ? " · ĐÃ LUYỆN HẾT" : ""}</small><strong>{unit.title.replace(/^Unit \d+\s*·\s*/, "")}</strong><span>{practiced}/{shown.length} bài {filtered ? "trong kỹ năng này" : "đã luyện"}</span></span>
      <span className="journey-unit-open"><ChevronDown size={22} /></span>
    </button>
    <div className="journey-unit-progress" aria-label={`${practiced} trên ${shown.length} bài đã luyện`}><i style={{ width: `${practiced / shown.length * 100}%` }} /></div>
    {open && <div className="journey-path"><ol>{shown.map((lesson, index) => {
      const result = results[lesson.slug];
      const status = lessonStatus(lesson, result, isDone, nextSlug);
      const Icon = skillIcons[lesson.skill] ?? BookOpenText;
      const x = lanePositions[index % lanePositions.length];
      const previousX = lanePositions[(index + lanePositions.length - 1) % lanePositions.length];
      const side = x >= 50 ? "left" : "right";
      const score = result?.checked ? lesson.slug.startsWith("b2-") ? `${result.checked}/${result.total} đã làm · ${result.correct} đạt` : lesson.objective_count === 0 ? `${result.checked}/${result.total} đã tự đánh giá` : `${result.correct}/${result.checked} đúng` : status === "started" ? "Đã mở · tiếp tục" : status === "current" ? "Bài học tiếp theo" : "Chưa học";
      return <li key={lesson.id} className={`journey-stop is-${status} skill-${lesson.skill.toLowerCase()}`} style={{ "--stop-x": `${x}%` } as CSSProperties}>
        {index > 0 && <svg className={`journey-connector ${lessonStatus(shown[index - 1], results[shown[index - 1].slug], isDone, nextSlug) === "complete" ? "is-complete" : ""}`} viewBox="0 0 100 124" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${previousX} 0 C ${previousX} 52, ${x} 72, ${x} 124`} fill="none" vectorEffect="non-scaling-stroke" /></svg>}
        <Link href={`/app/lesson/${lesson.slug}`} className={`journey-stop-link label-${side}`} aria-current={status === "current" ? "step" : undefined} aria-label={`${skillLabels[lesson.skill] ?? lesson.skill}: ${lesson.title}. ${score}`}>
          {status === "current" && <span className="journey-start" aria-hidden="true">{result?.checked ? "TIẾP TỤC" : "BẮT ĐẦU"}</span>}
          {status === "current" && <Sticker name="harry" size={58} tilt={-6} float pop={false} className={`journey-harry ${side === "left" ? "is-right" : "is-left"}`} />}
          <span className="journey-node">{status === "complete" ? <Star size={31} fill="currentColor" /> : status === "review" ? <RotateCcw size={29} /> : <Icon size={30} strokeWidth={2.5} />}</span>
          <span className="journey-stop-label"><small>{skillLabels[lesson.skill] ?? lesson.skill} · {lesson.supplement ? "Luyện thêm" : `Bài ${unit.lessons.indexOf(lesson) + 1}`}</small><strong>{lesson.title}</strong><em>{score}</em></span>
        </Link>
      </li>;
    })}</ol><div className={`journey-finish ${complete ? "is-complete" : ""}`}><span><Trophy size={24} /></span><div><strong>{complete ? "Hoàn thành Unit!" : `Còn ${shown.length - practiced} bài ${filtered ? "trong kỹ năng này" : "trong Unit"}`}</strong><small>{complete ? "Bạn có thể quay lại ôn bất kỳ bài nào." : "Làm bài, xem phản hồi và quay lại phần cần ôn."}</small></div></div></div>}
  </section>;
}

function StudyCourse({ course, isDone }: { course: StageCourse; isDone: (lesson: Lesson) => boolean }) {
  const [skill, setSkill] = useState("all");
  const [results, setResults] = useState<Record<string, PracticeResult>>({});
  const lessons = useMemo(() => course.units.flatMap((unit) => unit.lessons), [course.units]);
  useEffect(() => {
    let active = true;
    // A result saved for an older edition of a lesson (different question count, e.g. the replaced Unit 7) is not shown.
    void loadPracticeResults(lessons.map((lesson) => lesson.slug)).then((value) => {
      if (!active) return;
      setResults(Object.fromEntries(Object.entries(value).filter(([slug, result]) => {
        const lesson = lessons.find((item) => item.slug === slug);
        return !lesson?.question_count || !result.total || result.total === lesson.question_count;
      })));
    }).catch(() => undefined);
    const unsubscribe = subscribePracticeResults((slug, result) => {
      if (active && lessons.some((lesson) => lesson.slug === slug)) setResults((previous) => ({ ...previous, [slug]: result }));
    });
    return () => { active = false; unsubscribe(); };
  }, [lessons]);
  const practiced = lessons.filter((lesson) => (results[lesson.slug]?.checked ?? 0) > 0).length;
  const completed = lessons.filter((lesson) => isComplete(lesson, results[lesson.slug])).length;
  const review = lessons.filter((lesson) => isReview(lesson, results[lesson.slug])).length;
  const filteredLessons = lessons.filter((lesson) => skill === "all" || lesson.skill === skill);
  const next = nextLesson(filteredLessons, results, isDone);
  const activeUnit = Math.max(0, course.units.findIndex((unit) => unit.lessons.some((lesson) => lesson.slug === next?.slug)));
  const options = ["all", ...new Set(lessons.map((lesson) => lesson.skill))];
  return <section className="study-course" aria-label={course.title}>
    <header className="study-course-head"><div><span className="eyebrow"><Sparkles size={15} /> LỘ TRÌNH TỰ HỌC · {course.units.length} UNIT</span><h2>{course.title}</h2><p>{course.description}</p></div><div className="study-course-progress"><strong>{practiced}<small>/{lessons.length}</small></strong><span>bài đã luyện</span><div className="study-course-bar"><i style={{ width: `${lessons.length ? practiced / lessons.length * 100 : 0}%` }} /></div></div></header>
    <div className="study-course-actions"><div className="study-course-stats"><span><Star size={16} /> {completed} đạt mục tiêu</span><span><RotateCcw size={16} /> {review} cần ôn</span></div>{next && <Link className="button primary" href={`/app/lesson/${next.slug}`}>{(results[next.slug]?.checked ?? 0) > 0 && results[next.slug].checked < results[next.slug].total ? "Tiếp tục bài đang dở" : isReview(next, results[next.slug]) ? "Sửa câu chưa đạt" : "Học tiếp"}: {next.title} <ArrowRight size={16} /></Link>}</div>
    <div className="study-skill-filter" role="group" aria-label="Lọc theo kỹ năng">{options.map((option) => <button key={option} type="button" className={skill === option ? "active" : ""} aria-pressed={skill === option} onClick={() => setSkill(option)}>{option === "all" ? "Tất cả" : skillLabels[option] ?? option}</button>)}</div>
    <p className="journey-hint">{skill === "all" ? `${practiced}/${lessons.length} bài đã luyện toàn khóa` : `${filteredLessons.filter((lesson) => (results[lesson.slug]?.checked ?? 0) > 0).length}/${filteredLessons.length} bài ${skillLabels[skill] ?? skill} đã luyện · nút Học tiếp theo bộ lọc này`}</p>
    <p className="journey-hint"><Check size={16} /> Chọn vòng tròn để vào bài. Bài đã học vẫn mở để ôn lại.</p>
    <div className="study-unit-list">{course.units.map((unit, unitIndex) => {
      const shown = unit.lessons.filter((lesson) => skill === "all" || lesson.skill === skill);
      if (!shown.length) return null;
      return <JourneyUnit key={`${unit.id}-${unitIndex === activeUnit}`} unit={unit} unitIndex={unitIndex} shown={shown} nextSlug={next?.slug} results={results} isDone={isDone} initialOpen={unitIndex === activeUnit} />;
    })}</div>
  </section>;
}

/** On the Learn overview: one compact card per published course, linking to its stage. */
export function OpenCourses({ courses, loading }: { courses: StageCourse[]; loading: boolean }) {
  if (loading || !courses.length) return null;
  const visibleCourses = courses.filter((course) => course.stage_id !== "ielts-builder" || course.slug === "english-skill-lab-book-2");
  return <section className="card section-card">
    <div className="section-head"><h2>Khóa học đang mở</h2><span>Chọn một khóa để xem các unit và bài học.</span></div>
    <div className="open-courses">{visibleCourses.map((course) => {
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
