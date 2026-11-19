import { NextResponse } from "next/server";
import { privateHeaders, task1Access } from "@/lib/writing-task1/access";
import { task1Answers, task1Lesson } from "@/lib/writing-task1/content";
import { modelFirst } from "@/lib/writing-task1/types";

/**
 * The model answer to study before writing. Foundation lessons teach by example first ("xem mẫu → làm theo
 * khung → tự làm"), so their model opens up front; later stages keep it behind the learner's own saved report.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await task1Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = task1Lesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  if (!modelFirst(lesson)) return NextResponse.json({ error: "Bài mẫu của chặng này mở sau khi bạn lưu bài viết." }, { status: 403 });
  const model = task1Answers(lesson)?.model ?? null;
  return NextResponse.json({ model }, { headers: privateHeaders });
}
