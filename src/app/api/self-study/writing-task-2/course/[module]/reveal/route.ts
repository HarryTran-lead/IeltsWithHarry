import { NextResponse } from "next/server";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { CourseUnavailable, loadCourseModule } from "@/lib/writing-task2/course-source";
import { ATTEMPT_MIN_CHARS, attemptDone, courseDraftSlug, isCourseModule, parseCourseAttempt } from "@/lib/writing-task2/course-types";

type Body = { id?: unknown; text?: unknown; choice?: unknown };

/**
 * Reference guidance for one practice item. Milestones R01–R15 let a stuck learner open it before writing
 * (the page marks that); the final milestone R16 releases it only after the learner's own saved attempt,
 * which in live mode is read from their writing_drafts row (row-level security scopes it to them).
 */
export async function POST(request: Request, context: { params: Promise<{ module: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const moduleId = (await context.params).module;
  if (!isCourseModule(moduleId)) return NextResponse.json({ error: "Không tìm thấy chặng học." }, { status: 404 });
  const body = await request.json().catch(() => null) as Body | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Chưa chọn câu cần xem gợi ý." }, { status: 400 });

  let loaded;
  try { loaded = await loadCourseModule(moduleId); }
  catch (failure) { return NextResponse.json({ error: "Chặng này đang được cập nhật." }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders }); }
  const practice = loaded.module.practice.find((item) => item.id === id);
  if (!practice) return NextResponse.json({ error: "Không tìm thấy câu luyện." }, { status: 404 });
  const answer = loaded.answers[id];
  if (!answer) return NextResponse.json({ error: "Câu này tự rà bằng bảng kiểm, không có đáp án mẫu." }, { status: 404, headers: privateHeaders });

  if (!practice.peek) {
    let done: boolean;
    if (demoMode) {
      const text = typeof body?.text === "string" ? body.text : "";
      done = attemptDone({ c: 1, text, choice: typeof body?.choice === "string" ? body.choice : undefined, savedAt: "demo" });
    } else {
      const supabase = await createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return NextResponse.json({ error: "Hãy đăng nhập lại để xem gợi ý." }, { status: 401 });
      const { data } = await supabase.from("writing_drafts").select("body").eq("user_id", userData.user.id).eq("lesson_slug", courseDraftSlug(moduleId, id)).maybeSingle();
      done = attemptDone(parseCourseAttempt(data?.body));
    }
    if (!done) return NextResponse.json({ error: `Lưu bài làm của bạn (ít nhất ${ATTEMPT_MIN_CHARS} ký tự) trước khi xem gợi ý ở chặng cuối.` }, { status: 403, headers: privateHeaders });
  }
  return NextResponse.json({ answer }, { headers: privateHeaders });
}
