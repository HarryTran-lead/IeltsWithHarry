import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { audioReady, getStoredLesson, gradeLesson, lessonReview } from "@/lib/dictation-skill-lab/lessons";

type Body = { mode?: unknown; answers?: unknown; question_ids?: unknown };

/**
 * Grades on the server from the stored answer key. Practice checks one or more questions and
 * returns their answers; a whole-lesson submission (no question_ids) also returns the transcript.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = getStoredLesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài." }, { status: 404 });
  if (!audioReady(lesson)) return NextResponse.json({ error: "Bài này chưa có đủ audio." }, { status: 409 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || typeof body.answers !== "object" || body.answers === null || Array.isArray(body.answers))
    return NextResponse.json({ error: "Dữ liệu bài làm không hợp lệ." }, { status: 400 });
  const mode = body.mode === "ielts" ? "ielts" : "practice";
  const answers = Object.fromEntries(Object.entries(body.answers as Record<string, unknown>)
    .filter(([key, value]) => /^[A-Z]\d{2}$/.test(key) && typeof value === "string").slice(0, 200)) as Record<string, string>;
  const ids = Array.isArray(body.question_ids) ? body.question_ids.filter((id): id is string => typeof id === "string").slice(0, 200) : null;
  const results = gradeLesson(lesson, answers, mode, ids ?? undefined);
  const correct = results.filter((item) => item.correct).length;
  return NextResponse.json({
    mode, results, correct, total: lesson.questions.length,
    ...(ids ? {} : lessonReview(lesson)),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
