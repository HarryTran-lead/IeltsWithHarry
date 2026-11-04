import { getViewerRole } from "@/lib/viewer-role";
import { book2Model, book2Transcript, gradeBook2Answers, loadBook2Lesson, studentBook2Lesson } from "@/lib/book2/lessons";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

/** Answers, models and transcripts arrive as a map of question ID to the learner's text. */
function readAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answers: Record<string, string> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 80) return null;
  for (const [id, answer] of entries) {
    if (typeof answer !== "string" || answer.length > 12000 || id.length > 80) return null;
    answers[id] = answer;
  }
  return answers;
}

export async function GET(_request: Request, { params }: Context) {
  if (await getViewerRole() === "guest") return fail("Bạn cần đăng nhập.", 401);
  const lesson = await loadBook2Lesson((await params).slug);
  if (!lesson) return fail("Không tìm thấy bài học.", 404);
  return Response.json(studentBook2Lesson(lesson), { headers });
}

export async function POST(request: Request, { params }: Context) {
  if (await getViewerRole() === "guest") return fail("Bạn cần đăng nhập.", 401);
  const lesson = await loadBook2Lesson((await params).slug);
  if (!lesson) return fail("Không tìm thấy bài học.", 404);
  let body: { action?: unknown; answers?: unknown; question_id?: unknown; response?: unknown; recorded?: unknown; audio_id?: unknown };
  try { body = await request.json(); } catch { return fail("Dữ liệu gửi lên không hợp lệ.", 400); }
  const answers = readAnswers(body.answers ?? {});
  if (!answers) return fail("Câu trả lời không hợp lệ.", 400);

  if (body.action === "check") return Response.json({ verdicts: gradeBook2Answers(lesson, answers) }, { headers });
  if (body.action === "model") {
    if (typeof body.question_id !== "string" || typeof body.response !== "string" || body.response.length > 12000) return fail("Yêu cầu không hợp lệ.", 400);
    const result = book2Model(lesson, body.question_id, body.response, body.recorded === true);
    return result.error ? fail(result.error, 409) : Response.json(result, { headers });
  }
  if (body.action === "transcript") {
    if (typeof body.audio_id !== "string") return fail("Yêu cầu không hợp lệ.", 400);
    const result = book2Transcript(lesson, body.audio_id, answers);
    return result.error ? fail(result.error, 409) : Response.json(result, { headers });
  }
  return fail("Thao tác không hợp lệ.", 400);
}
