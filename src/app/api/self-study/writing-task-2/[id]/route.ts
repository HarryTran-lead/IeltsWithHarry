import { NextResponse } from "next/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { task2Lesson } from "@/lib/writing-task2/content";

/** One lesson's learner content: guided steps, vocabulary and drill questions. Answers come from /reveal. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = task2Lesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  return NextResponse.json({ lesson }, { headers: privateHeaders });
}
