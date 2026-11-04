import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { demoMode } from "@/lib/runtime";
import { canTestLevel, grammarLevel, isLevelOpen } from "@/lib/grammar/gate";
import { choosePlacement, gradePlacement, issueTicket, placementPool, publicPlacement, readTicket } from "@/lib/grammar/placement";
import type { GrammarLevel } from "@/lib/grammar/types";

export const runtime = "nodejs";

async function context() {
  if (demoMode) return { userId: "demo", unlocked: [] as GrammarLevel[] };
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error("Bạn cần đăng nhập.");
  const { data, error } = await db.from("grammar_level_unlocks").select("level").eq("user_id", auth.user.id);
  if (error) throw error;
  return { userId: auth.user.id, unlocked: (data ?? []).map((row) => row.level).filter(grammarLevel) };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Không tải được bài kiểm tra.";
  return Response.json({ error: message }, { status: message.includes("đăng nhập") ? 401 : 503, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const { userId, unlocked } = await context();
    const target = new URL(request.url).searchParams.get("target");
    if (!target) return Response.json({ unlocked }, { headers: { "Cache-Control": "no-store" } });
    if (!grammarLevel(target) || target === "A1") return Response.json({ error: "Cấp độ không hợp lệ." }, { status: 400 });
    if (!demoMode && !canTestLevel(target, unlocked)) return Response.json({ error: "Bạn cần mở cấp trước đó." }, { status: 403 });
    if (!demoMode && isLevelOpen(target, unlocked)) return Response.json({ error: "Cấp độ này đã mở." }, { status: 409 });
    const items = choosePlacement(await placementPool(target));
    if (items.length !== 20) throw new Error("Chưa đủ câu hỏi để kiểm tra cấp độ này.");
    return Response.json({ target, questions: publicPlacement(items), ticket: issueTicket({ userId, target, ids: items.map((item) => item.id), expires: Date.now() + 30 * 60_000 }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { userId, unlocked } = await context();
    const body = await request.json() as { target?: unknown; ticket?: unknown; answers?: unknown };
    if (typeof body.target !== "string" || !grammarLevel(body.target) || body.target === "A1" || typeof body.ticket !== "string" || typeof body.answers !== "object" || !body.answers || Array.isArray(body.answers)) {
      return Response.json({ error: "Bài làm không hợp lệ." }, { status: 400 });
    }
    if (!demoMode && !canTestLevel(body.target, unlocked)) return Response.json({ error: "Bạn cần mở cấp trước đó." }, { status: 403 });
    const ticket = readTicket(body.ticket, userId, body.target);
    if (!ticket) return Response.json({ error: "Bài kiểm tra đã hết hạn. Hãy bắt đầu lại." }, { status: 400 });
    const answers = body.answers as Record<string, string>;
    if (Object.keys(answers).length !== ticket.ids.length || ticket.ids.some((id) => typeof answers[id] !== "string")) {
      return Response.json({ error: "Hãy trả lời đủ 20 câu trước khi nộp." }, { status: 400 });
    }
    const result = gradePlacement(await placementPool(body.target), ticket.ids, answers);
    if (result.passed && !demoMode) {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!key || !url) throw new Error("Chưa cấu hình lưu kết quả kiểm tra.");
      const admin = createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await admin.from("grammar_level_unlocks").upsert({ user_id: userId, level: body.target, score_percent: result.percent, correct_count: result.correct, passed_at: new Date().toISOString() }, { onConflict: "user_id,level" });
      if (error) throw error;
    }
    return Response.json({ ...result, target: body.target }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
