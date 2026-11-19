import { NextResponse } from "next/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { CourseUnavailable, loadCourseModule } from "@/lib/writing-task2/course-source";
import { isCourseModule } from "@/lib/writing-task2/course-types";

/** One milestone's teaching, examples and practice. Reference answers stay on the server (see /reveal). */
export async function GET(_request: Request, context: { params: Promise<{ module: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const id = (await context.params).module;
  if (!isCourseModule(id)) return NextResponse.json({ error: "Không tìm thấy chặng học." }, { status: 404 });
  try {
    const { module } = await loadCourseModule(id);
    return NextResponse.json({ module }, { headers: privateHeaders });
  } catch (failure) {
    console.error("[writing-task2-course] module", id, failure instanceof Error ? failure.message : failure);
    return NextResponse.json({ error: "Chặng này đang được cập nhật.", unavailable: true }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders });
  }
}
