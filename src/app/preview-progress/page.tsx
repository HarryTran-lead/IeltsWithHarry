import { notFound } from "next/navigation";
import { ProgressPreview } from "./progress-preview";

/** Fixture page for reviewing the Progress page without a signed-in account: local dev and Vercel preview builds only. */
export default function PreviewProgressPage() {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") notFound();
  return <ProgressPreview />;
}
