"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { LessonDone, LessonFrame, StudyPath } from "@/features/self-study-path/study-path";
import { buildPath, type PathCourse, type PathNode, type PathProgress } from "@/lib/self-study-path/path";

const here = "/app/self-study/preview";
const url = (lab: string, extra = "") => `${here}?lab=${lab}${extra}`;

/** A learner who passed stage 1, finished two lessons of stage 2 (one with mistakes) and stopped at step 2 of the third. */
function sampleProgress(course: PathCourse): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {} };
  const [first, second] = course.stages;
  first?.lessons.forEach((lesson, index) => { progress.lessons[lesson.id] = { done: true, right: 8 + (index % 3), total: 10, mistakes: index % 4 === 1 ? 1 : 0 }; });
  if (first?.checkpoint) progress.checkpoints[first.id] = 0.85;
  if (second) {
    const doneCount = Math.min(2, Math.max(0, second.lessons.length - 1));
    second.lessons.slice(0, doneCount).forEach((lesson, index) => { progress.lessons[lesson.id] = { done: true, right: index ? 7 : 9, total: 10, mistakes: index ? 2 : 0 }; });
    const current = second.lessons[doneCount];
    if (current) progress.lessons[current.id] = { step: 1 };
  }
  return progress;
}

export function SelfStudyPreview({ courses }: { courses: PathCourse[] }) {
  return <DemoProvider><NotebookProvider><AppShell><PreviewBody courses={courses} /></AppShell></NotebookProvider></DemoProvider>;
}

function PreviewBody({ courses }: { courses: PathCourse[] }) {
  // No signed-in learner here: hide the shell's "session missing" notice so the screens read as on the site.
  const { error, clearError } = useDemo();
  useEffect(() => { if (error) clearError(); }, [error, clearError]);
  const params = useSearchParams();
  const course = courses.find((item) => item.lab === params.get("lab")) ?? courses[0];
  const viewName = params.get("view") ?? "path";
  const view = useMemo(() => buildPath(course, sampleProgress(course)), [course]);
  const lessons = useMemo(() => view.stages.flatMap((stage) => stage.nodes.filter((node) => node.kind === "lesson")), [view]);
  const href = (node: PathNode) => node.kind === "lesson" && node.status !== "locked" ? url(course.lab, `&view=lesson&id=${encodeURIComponent(node.id)}`) : undefined;

  const switcher = (
    <nav className="sp-preview-bar" aria-label="Chọn Lab để xem">
      <span>Xem thử template:</span>
      {courses.map((item) => <Link key={item.lab} href={url(item.lab)} className={item.lab === course.lab ? "is-on" : ""}>{item.name}</Link>)}
    </nav>
  );

  if (viewName === "lesson" || viewName === "done") {
    const node = lessons.find((item) => item.id === params.get("id")) ?? view.next?.node ?? lessons[0];
    const following = lessons[lessons.findIndex((item) => item.id === node.id) + 1];
    if (viewName === "done") {
      return <>{switcher}<LessonDone title={`Xong ${node.number ? `bài ${node.number} · ` : ""}${node.title}`}
        stats={[{ label: "Đúng", value: "8/10" }, { label: "Thời gian", value: `${node.lesson?.minutes ?? 25} phút` }, { label: "Vào sổ lỗi", value: "2" }]}
        note="2 câu sai đã được lưu. Chúng sẽ quay lại trong nút “Ôn lỗi” của chặng."
        nextLabel={following?.number ? `Sang bài ${following.number}` : undefined} nextHref={following ? url(course.lab, `&view=lesson&id=${encodeURIComponent(following.id)}`) : undefined}
        pathHref={url(course.lab)} reviewHref={url(course.lab)} /></>;
    }
    return <>{switcher}<LessonPreview key={node.id} course={course} node={node} /></>;
  }

  return <>{switcher}<StudyPath course={course} view={view} href={href} streak={6} target="6.0" /></>;
}

function LessonPreview({ course, node }: { course: PathCourse; node: PathNode }) {
  const start = node.progress?.done ? 0 : node.progress?.step ?? 0;
  const [step, setStep] = useState(start);
  const [reached, setReached] = useState(start);
  const go = (next: number) => { setStep(next); setReached((value) => Math.max(value, next)); };
  const finish = () => { window.location.href = url(course.lab, `&view=done&id=${encodeURIComponent(node.id)}`); };
  return (
    <LessonFrame course={course} lessonTitle={node.title} number={node.number} step={step} reached={reached} exitHref={url(course.lab)} onStep={go} onFinish={finish}>
      <p className="sp-preview-lead">{course.steps[step]}</p>
      {step === 0 && node.lesson?.goal && <blockquote className="sp-preview-goal">{node.lesson.goal}</blockquote>}
      <div className="sp-preview-slot">Nội dung thật của bước này trong {course.name} Lab sẽ nằm ở đây.</div>
    </LessonFrame>
  );
}
