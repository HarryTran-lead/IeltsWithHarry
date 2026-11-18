import { NextResponse } from "next/server";
import { privateHeaders, task1Access } from "@/lib/writing-task1/access";
import { task1Lesson } from "@/lib/writing-task1/content";

/** One lesson's learner content: the figure, reading checks without keys, guided steps and drills. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await task1Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = task1Lesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  return NextResponse.json({ lesson }, { headers: privateHeaders });
}
