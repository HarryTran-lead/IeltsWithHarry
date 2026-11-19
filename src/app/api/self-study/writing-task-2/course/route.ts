import { NextResponse } from "next/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { CourseUnavailable, courseSource, loadCourseSummaries } from "@/lib/writing-task2/course-source";
import { courseLayers } from "@/lib/writing-task2/course-types";

/** The R01–R16 skills course map: layers and each milestone's title and size. */
export async function GET() {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!courseSource()) return NextResponse.json({ error: "Khoá kỹ năng đang được cập nhật.", unavailable: true }, { status: 503, headers: privateHeaders });
  try {
    return NextResponse.json({ layers: courseLayers, modules: await loadCourseSummaries() }, { headers: privateHeaders });
  } catch (failure) {
    console.error("[writing-task2-course] summaries", failure instanceof Error ? failure.message : failure);
    return NextResponse.json({ error: "Khoá kỹ năng đang được cập nhật.", unavailable: true }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders });
  }
}
