import { existsSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { previewDir, previewMocks } from "./data";
import { ListeningPreview, type PreviewTest } from "./listening-preview";

const ASSET = "https://assets.invalid/";

/** Local-only review of the Listening library, practice and real-test views and the review, fed by the owner's mocks. */
export default function PreviewListeningPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const dir = previewDir();
  const mocks = previewMocks();
  if (!dir || !mocks) return <main className="bx-page"><p className="bx-error">Chưa có dữ liệu preview. Chạy scripts/listening-mocks-build.mts rồi đặt LISTENING_PREVIEW_DIR.</p></main>;
  // Real Gemini audio when it exists, otherwise the local placeholder voice.
  const asset = (url: string) => {
    const path = url.slice(ASSET.length);
    if (!path.startsWith("audio/")) return `/app/listening/preview/asset?f=${encodeURIComponent(`package/${path}`)}`;
    const file = path.slice("audio/".length);
    const folder = ["audio", "audio-placeholder"].find((name) => existsSync(join(dir, name, file)));
    return folder ? `/app/listening/preview/asset?f=${encodeURIComponent(`${folder}/${file}`)}` : undefined;
  };
  const tests: PreviewTest[] = mocks.map((mock) => {
    const content = mock.content as ExamContent;
    return {
      id: mock.externalId, number: mock.mock, title: mock.title, audioSource: mock.audioSource,
      content: { ...content, sections: content.sections.map((section) => ({
        ...section,
        audioUrl: section.audioUrl ? asset(section.audioUrl) : undefined,
        coverUrl: section.coverUrl ? asset(section.coverUrl) : undefined,
        questions: section.questions.map((question) => question.mediaUrl ? { ...question, mediaUrl: asset(question.mediaUrl) } : question),
      })) },
    };
  });
  return <Suspense><ListeningPreview tests={tests} /></Suspense>;
}
