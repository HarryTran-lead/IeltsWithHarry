"use client";

import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { LessonDetail } from "@/features/learning/lesson-detail";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import type { SkillMaterial } from "@/lib/skill-material";
import { PackageLessonPractice, type PackageLesson } from "./course-package-practice";

type Props = {
  lesson: { slug: string; title: string; skill: string; summary: string };
  blocks: { id: string; kind: string; body: string }[];
  questions: { id: string; slug: string; prompt: string; options: string[] }[];
  words: { id: string; word: string; phonetic: string; meaning_vi: string; definition: string; example: string; sentence_prompt_vi: string; accepted_sentences: string[] }[];
  material: SkillMaterial | null;
  packageContent: PackageLesson;
  canManage: boolean;
};

export function CoursePackageLessonShell(props: Props) {
  return <DemoProvider><NotebookProvider><Content {...props} /></NotebookProvider></DemoProvider>;
}

function Content({ packageContent, canManage, ...lessonProps }: Props) {
  const { ready } = useDemo();
  return <AppShell canManage={canManage}>{ready ? <>
    <LessonDetail {...lessonProps} />
    <div className="content-page"><section className="card section-card"><PackageLessonPractice content={packageContent} /></section></div>
  </> : <div className="content-page">Loading your lesson…</div>}</AppShell>;
}
