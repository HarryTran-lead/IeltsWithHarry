import { NextResponse } from "next/server";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { CourseUnavailable, loadCourseFinal } from "@/lib/writing-task2/course-source";
import { finalDraftSlug, parseFinalAttempt, type FinalAttempt } from "@/lib/writing-task2/final-types";

/**
 * Starts one final paper and returns its prompt. The prompt is locked until this call: in live mode the start is
 * recorded in the learner's own writing_drafts row first (row-level security scopes it), so the timer runs from
 * the first start and a reload returns the same prompt and start time.
 */
export async function POST(_request: Request, context: { params: Promise<{ paper: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const paperId = (await context.params).paper;
  let final;
  try { final = await loadCourseFinal(); }
  catch (failure) { return NextResponse.json({ error: "Bài thi cuối khoá đang được cập nhật." }, { status: failure instanceof CourseUnavailable ? 503 : 500, headers: privateHeaders }); }
  const paper = final.bundle.papers.find((item) => item.id === paperId);
  const prompt = final.prompts[paperId];
  if (!paper || !prompt?.prompt_en) return NextResponse.json({ error: "Không tìm thấy đề thi." }, { status: 404 });

  let startedAt = new Date().toISOString();
  if (!demoMode) {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Hãy đăng nhập lại để bắt đầu bài thi." }, { status: 401 });
    const slug = finalDraftSlug(paperId);
    const { data } = await supabase.from("writing_drafts").select("body").eq("user_id", userData.user.id).eq("lesson_slug", slug).maybeSingle();
    const existing = parseFinalAttempt(data?.body);
    if (existing) startedAt = existing.startedAt;
    else {
      const attempt: FinalAttempt = { f: 1, startedAt, essay: "", review: {}, evidence: {}, updatedAt: Date.now() };
      const { error } = await supabase.from("writing_drafts").upsert({ user_id: userData.user.id, lesson_slug: slug, body: JSON.stringify(attempt), updated_at: startedAt }, { onConflict: "user_id,lesson_slug" });
      if (error) return NextResponse.json({ error: "Chưa ghi được lượt bắt đầu bài thi." }, { status: 500 });
    }
  }
  return NextResponse.json({ prompt: { prompt_en: prompt.prompt_en, prompt_vi: prompt.prompt_vi }, startedAt }, { headers: privateHeaders });
}
