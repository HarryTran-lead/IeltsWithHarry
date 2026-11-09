import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReadingPreview } from "./reading-preview";

/** Local-only design review of the Reading library, test room and review; never served in production. */
export default function PreviewReadingPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense><ReadingPreview /></Suspense>;
}
