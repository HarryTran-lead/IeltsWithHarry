import { NextResponse } from "next/server";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders, speakingAccess } from "@/lib/speaking-lab/access";
import { SpeakingContentUnavailable, speakingPrivateUnit, speakingUnit } from "@/lib/speaking-lab/source";
import { emptySpeakingState, parseSpeakingState, releaseFor, speakingDraftSlug, type SpeakingState } from "@/lib/speaking-lab/types";

/**
 * One unit's content as far as the learner has got: the current question, tips for what they have spoken,
 * coaching after the first task and the model after the last. In live mode progress is read from the
 * learner's own writing_drafts row (row-level security scopes it to them); local demo mode has no account,
 * so it takes the progress sent with the request.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await speakingAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const unit = speakingUnit((await context.params).id);
  if (!unit) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });

  let content;
  try { content = await speakingPrivateUnit(unit.id); }
  catch (error) {
    if (error instanceof SpeakingContentUnavailable) return NextResponse.json({ error: "Nội dung bài này đang được cập nhật." }, { status: 503 });
    throw error;
  }
  if (!content) return NextResponse.json({ error: "Nội dung bài này đang được cập nhật." }, { status: 503 });

  let state: SpeakingState;
  if (demoMode) {
    const body = await request.json().catch(() => null) as { state?: unknown } | null;
    state = parseSpeakingState(body?.state) ?? emptySpeakingState();
  } else {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Hãy đăng nhập lại để tiếp tục." }, { status: 401 });
    const { data, error } = await supabase.from("writing_drafts").select("body").eq("user_id", userData.user.id).eq("lesson_slug", speakingDraftSlug(unit.id)).maybeSingle();
    if (error) return NextResponse.json({ error: "Không đọc được tiến độ đã lưu." }, { status: 500 });
    state = parseSpeakingState(data?.body) ?? emptySpeakingState();
  }

  return NextResponse.json({ release: releaseFor(unit, content, state) }, { headers: privateHeaders });
}
