import { notFound } from "next/navigation";
import { WordFormationPreview } from "./word-formation-preview";

/** Dev-only fixture page for reviewing Word Formation without a signed-in account. */
export default function PreviewWordFormationPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WordFormationPreview />;
}
