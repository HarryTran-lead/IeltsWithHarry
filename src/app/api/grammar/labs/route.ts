/**
 * Grammar practice labs (M21 diagnostic + M22–M26). One endpoint for the Grammar UI.
 *
 * GET ?lesson=A2-23                -> concept map + labs linked to that lesson
 * GET ?level=A2                    -> every lab released for the level
 * GET ?lab=contrast&id=M23-…       -> one item, without keys or reference answers
 * GET ?diagnostic=A2               -> a fresh diagnostic question set
 * POST {lab,id,questionId,answer}  -> formative feedback for one answer
 * POST {diagnostic:"A2",answers}   -> diagnostic screening result
 *
 * Items reach learners only through each lab's release gate (teacher approval, or the
 * dev/develop draft preview). Nothing here writes mastery, CEFR claims or level unlocks.
 */
import { createClient } from "@/lib/supabase/server";
import { demoMode } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import { grammarLevel, isLevelOpen } from "@/lib/grammar/gate";
import { diagnosticQuestions, gradeDiagnostic, gradeLab, labItem, labLevel, labsForLesson, labsForLevel } from "@/lib/grammar/labs-server";
import { labKinds, type LabKind } from "@/lib/grammar/labs-types";
import type { GrammarLevel } from "@/lib/grammar/types";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
const LESSON = /^(A1|A2|B1|B2|C1|C2)-\d{2}$/;
const ITEM_ID = /^[A-Z0-9-]{6,48}$/;
const isLab = (value: unknown): value is LabKind => typeof value === "string" && (labKinds as string[]).includes(value);

async function openLevels(): Promise<GrammarLevel[] | null> {
  if (demoMode) return ["A1", "A2", "B1", "B2", "C1", "C2"];
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return ["A1"];
  const { data, error: unlockError } = await db.from("grammar_level_unlocks").select("level").eq("user_id", auth.user.id);
  if (unlockError) return null;
  return ["A1", ...(data ?? []).map((row: { level: string }) => row.level).filter(grammarLevel)];
}

async function guard(level: GrammarLevel | null) {
  if (!level) return fail("Bài luyện chưa phát hành hoặc không tồn tại.", 404);
  const open = await openLevels();
  if (!open) return fail("Không kiểm tra được cấp độ đã mở.", 503);
  if (!isLevelOpen(level, open)) return fail("Cấp độ chưa mở khóa.", 403);
  return null;
}

export async function GET(request: Request) {
  if (await getViewerRole() === "guest") return fail("Bạn cần đăng nhập.", 401);
  const params = new URL(request.url).searchParams;
  try {
    const lesson = params.get("lesson");
    if (lesson !== null) {
      if (!LESSON.test(lesson)) return fail("Mã bài không hợp lệ.", 400);
      const denied = await guard(lesson.slice(0, 2) as GrammarLevel); if (denied) return denied;
      return Response.json(labsForLesson(lesson), { headers });
    }
    const level = params.get("level");
    if (level !== null) {
      if (!grammarLevel(level)) return fail("Cấp độ không hợp lệ.", 400);
      const denied = await guard(level); if (denied) return denied;
      return Response.json(labsForLevel(level), { headers });
    }
    const diagnostic = params.get("diagnostic");
    if (diagnostic !== null) {
      if (!grammarLevel(diagnostic)) return fail("Cấp độ không hợp lệ.", 400);
      const denied = await guard(diagnostic); if (denied) return denied;
      const questions = diagnosticQuestions(diagnostic);
      if (!questions.length) return fail("Bài chẩn đoán của cấp này chưa phát hành.", 503);
      return Response.json({ level: diagnostic, questions }, { headers });
    }
    const lab = params.get("lab"), id = params.get("id");
    if (!isLab(lab) || !id || !ITEM_ID.test(id)) return fail("Yêu cầu không hợp lệ.", 400);
    const denied = await guard(labLevel(lab, id)); if (denied) return denied;
    const item = labItem(lab, id);
    return item ? Response.json({ item }, { headers }) : fail("Bài luyện chưa phát hành.", 503);
  } catch {
    return fail("Phòng luyện tạm thời không khả dụng.", 503);
  }
}

export async function POST(request: Request) {
  if (await getViewerRole() === "guest") return fail("Bạn cần đăng nhập.", 401);
  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Dữ liệu không hợp lệ.", 400);
    body = value as Record<string, unknown>;
  } catch { return fail("Dữ liệu không hợp lệ.", 400); }
  try {
    if (body.diagnostic !== undefined) {
      const level = body.diagnostic;
      if (typeof level !== "string" || !grammarLevel(level) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return fail("Bài làm không hợp lệ.", 400);
      const denied = await guard(level); if (denied) return denied;
      const open = (await openLevels()) ?? ["A1"];
      const result = gradeDiagnostic(level, body.answers as Record<string, unknown>, open);
      return result ? Response.json(result, { headers }) : fail("Bài làm không hợp lệ.", 400);
    }
    const { lab, id, questionId, answer } = body;
    if (!isLab(lab) || typeof id !== "string" || !ITEM_ID.test(id) || typeof questionId !== "string" || questionId.length > 64) return fail("Bài làm không hợp lệ.", 400);
    if (typeof answer === "string" && answer.length > 6000) return fail("Câu trả lời quá dài.", 400);
    const denied = await guard(labLevel(lab, id)); if (denied) return denied;
    const grade = gradeLab(lab, id, questionId, answer);
    return grade ? Response.json(grade, { headers }) : fail("Câu trả lời chưa hợp lệ (quá ngắn hoặc sai định dạng).", 400);
  } catch {
    return fail("Phòng luyện tạm thời không khả dụng.", 503);
  }
}
