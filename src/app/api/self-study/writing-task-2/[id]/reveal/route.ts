import { NextResponse } from "next/server";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { task2Answers, task2Lesson } from "@/lib/writing-task2/content";
import { DRILL_MIN_CHARS, countWords, drillSaved, essaySaved, parseTask2State, task2DraftSlug, writingTargets, type Task2Reveal, type Task2State } from "@/lib/writing-task2/types";

type Body = { targets?: unknown; texts?: unknown; peek?: unknown };

/**
 * Hands out reference answers. A learner who has saved their own attempt gets them as feedback; one who is
 * stuck can ask to see them first ("peek"), because a self-study learner must never be blocked by a blank page.
 * The page marks peeked drills so progress still shows the difference. In live mode the proof of a save is the
 * learner's own writing_drafts row (row-level security scopes the read to them); local demo mode has no
 * account, so it accepts the text from the request instead.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = task2Lesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  const answers = task2Answers(lesson);
  if (!answers) return NextResponse.json({ error: "Đáp án của bài này đang được cập nhật." }, { status: 409 });

  const body = await request.json().catch(() => null) as Body | null;
  const targets = Array.isArray(body?.targets) ? body.targets.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  if (!targets.length) return NextResponse.json({ error: "Chưa chọn phần cần xem đáp án." }, { status: 400 });
  const peek = body?.peek === true;

  let state: Task2State;
  if (peek) {
    state = { t2: 1, answers: {}, saved: {}, peeked: {}, choices: {}, fills: {}, essay: "", checklist: {}, updatedAt: 0 };
  } else if (demoMode) {
    const texts = body?.texts && typeof body.texts === "object" && !Array.isArray(body.texts) ? body.texts as Record<string, unknown> : {};
    const text = (key: string) => typeof texts[key] === "string" ? (texts[key] as string).slice(0, 12000) : "";
    const now = new Date().toISOString();
    state = { t2: 1, answers: Object.fromEntries(targets.map((key) => [key, text(key)])), saved: Object.fromEntries(targets.map((key) => [key, now])), peeked: {}, choices: {}, fills: {}, essay: text("essay"), essaySavedAt: now, checklist: {}, updatedAt: Date.now() };
  } else {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Hãy đăng nhập lại để xem đáp án." }, { status: 401 });
    const { data, error } = await supabase.from("writing_drafts").select("body").eq("user_id", userData.user.id).eq("lesson_slug", task2DraftSlug(lesson.id)).maybeSingle();
    if (error) return NextResponse.json({ error: "Không đọc được bài đã lưu." }, { status: 500 });
    const saved = parseTask2State(data?.body);
    if (!saved) return NextResponse.json({ error: "Hãy lưu bài làm trước khi xem đáp án." }, { status: 403 });
    state = saved;
  }

  const result: Task2Reveal = { drills: {} };
  const refused: string[] = [];
  for (const target of targets) {
    if (target === "essay") {
      if (peek || essaySaved(state, lesson.stage)) result.model_essay = answers.model_essay ?? null;
      else refused.push(target);
    } else if (answers.drills[target]) {
      if (peek || drillSaved(state, target)) result.drills[target] = answers.drills[target];
      else refused.push(target);
    }
  }
  if (refused.length && !Object.keys(result.drills).length && result.model_essay === undefined) {
    const essay = refused.includes("essay");
    return NextResponse.json({ error: essay ? `Lưu bài viết từ ${writingTargets[lesson.stage].min} từ trở lên để mở bài mẫu.` : `Lưu câu trả lời (ít nhất ${DRILL_MIN_CHARS} ký tự) trước khi xem gợi ý.`, words: countWords(state.essay) }, { status: 403, headers: privateHeaders });
  }
  return NextResponse.json({ ...result, refused }, { headers: privateHeaders });
}
