import { notFound } from "next/navigation";
import { Suspense } from "react";
import { labOrder, selfStudyCourse } from "@/lib/self-study-path/courses";
import { SelfStudyPreview } from "./self-study-preview";

/** Local-only review of the shared self-study template, fed with the real Lab catalogues and a made-up learner. */
export default function SelfStudyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const courses = labOrder.map(selfStudyCourse);
  return <Suspense><SelfStudyPreview courses={courses} /></Suspense>;
}
