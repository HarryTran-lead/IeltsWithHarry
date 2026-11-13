import { notFound } from "next/navigation";
import { ProgressPreview } from "./progress-preview";

/** Dev-only fixture page for reviewing the Progress page without a signed-in account. */
export default function PreviewProgressPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProgressPreview />;
}
