import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { getStoredLesson, toPublicLesson } from "@/lib/dictation-skill-lab/lessons";

/** Lesson for the player: audio URLs, prompts and options. No transcript, answers or explanations. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = getStoredLesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài." }, { status: 404 });
  return NextResponse.json({ lesson: toPublicLesson(lesson) }, { headers: { "Cache-Control": "private, no-store" } });
}
