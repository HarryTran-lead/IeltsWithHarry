import { NextResponse } from "next/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { CourseUnavailable, courseSource, loadCourseFinal } from "@/lib/writing-task2/course-source";

/** The final assessment's paper slots (no prompts), the self-review rubric and the mistake codes. */
export async function GET() {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!courseSource()) return NextResponse.json({ error: "Bài thi cuối khoá đang được cập nhật.", unavailable: true }, { status: 503, headers: privateHeaders });
  try {
    return NextResponse.json((await loadCourseFinal()).bundle, { headers: privateHeaders });
  } catch (failure) {
    return NextResponse.json({ error: "Bài thi cuối khoá đang được cập nhật.", unavailable: true }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders });
  }
}
