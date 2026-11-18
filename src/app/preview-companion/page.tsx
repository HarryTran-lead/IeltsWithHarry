import { notFound } from "next/navigation";
import { CompanionPreview } from "./companion-preview";

/** Dev-only fixture page for reviewing Harry the study companion without signing in. */
export default function PreviewCompanionPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CompanionPreview />;
}
