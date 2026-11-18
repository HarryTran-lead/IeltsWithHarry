import { gradeEditorialAnswer, loadEditorialLesson, publicEditorialLesson } from "@/lib/grammar/editorial";
import { getViewerRole } from "@/lib/viewer-role";
import { grammarLevel } from "@/lib/grammar/gate";
import { createClient } from "@/lib/supabase/server";
import { demoMode } from "@/lib/runtime";

type Context = { params: Promise<{ code: string }> };

async function allowed(code: string) {
  const level = code.split("-")[0];
  if (!grammarLevel(level)) return false;
  if (level === "A1" || demoMode) return true;
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return false;
  const { data, error } = await db.from("grammar_level_unlocks").select("level").eq("user_id", auth.user.id).eq("level", level).maybeSingle();
  if (error) return false;
  return data?.level === level;
}

export async function GET(_request: Request, { params }: Context) {
  if (await getViewerRole() === "guest") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;
  if (!await allowed(code)) return Response.json({ error: "Cấp độ chưa mở khóa." }, { status: 403 });
  const source = await loadEditorialLesson(code);
  if (!source) return Response.json({ error: "Lesson not found" }, { status: 404 });
  return Response.json(publicEditorialLesson(source), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  if (await getViewerRole() === "guest") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;
  if (!await allowed(code)) return Response.json({ error: "Cấp độ chưa mở khóa." }, { status: 403 });
  const source = await loadEditorialLesson(code);
  if (!source) return Response.json({ error: "Lesson not found" }, { status: 404 });
  let body: { id?: unknown; answer?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.id !== "string" || typeof body.answer !== "string" || !body.answer.trim() || body.answer.length > 2000) {
    return Response.json({ error: "Invalid answer" }, { status: 400 });
  }
  const question = source.questions.find((item) => item.id === body.id);
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });
  return Response.json(gradeEditorialAnswer(question, body.answer), { headers: { "Cache-Control": "no-store" } });
}
