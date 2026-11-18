import { notFound } from "next/navigation";
import { NotebookPreview } from "./notebook-preview";

/** Dev-only fixture page for reviewing the notes workspace without a signed-in account. */
export default function PreviewNotebookPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NotebookPreview />;
}
