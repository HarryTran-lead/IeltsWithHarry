import { NextResponse } from "next/server";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { finalReviewOf } from "@/lib/writing-task2/course-normalize";
import { CourseUnavailable, loadCourseFinal } from "@/lib/writing-task2/course-source";
import { FINAL_REVIEW_MIN_WORDS, finalDraftSlug, finalSubmitted, parseFinalAttempt } from "@/lib/writing-task2/final-types";

/** Idea guidance and the model essay of the same question type, only after the learner's own essay was submitted. */
export async function POST(request: Request, context: { params: Promise<{ paper: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const paperId = (await context.params).paper;
  let final;
  try { final = await loadCourseFinal(); }
  catch (failure) { return NextResponse.json({ error: "Bài thi cuối khoá đang được cập nhật." }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders }); }
  const paper = final.bundle.papers.find((item) => item.id === paperId);
  if (!paper) return NextResponse.json({ error: "Không tìm thấy đề thi." }, { status: 404 });

  let submitted: boolean;
  if (demoMode) {
    const body = await request.json().catch(() => null) as { essay?: unknown } | null;
    const essay = typeof body?.essay === "string" ? body.essay.slice(0, 20000) : "";
    submitted = finalSubmitted({ f: 1, startedAt: "demo", submittedAt: "demo", essay, review: {}, evidence: {}, updatedAt: 0 });
  } else {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Hãy đăng nhập lại để xem nhận xét." }, { status: 401 });
    const { data } = await supabase.from("writing_drafts").select("body").eq("user_id", userData.user.id).eq("lesson_slug", finalDraftSlug(paperId)).maybeSingle();
    submitted = finalSubmitted(parseFinalAttempt(data?.body));
  }
  if (!submitted) return NextResponse.json({ error: `Nộp bài từ ${FINAL_REVIEW_MIN_WORDS} từ trở lên để mở gợi ý ý tưởng và bài mẫu.` }, { status: 403, headers: privateHeaders });
  return NextResponse.json({ review: finalReviewOf(paper, final.prompts[paperId], final.models) }, { headers: privateHeaders });
}
