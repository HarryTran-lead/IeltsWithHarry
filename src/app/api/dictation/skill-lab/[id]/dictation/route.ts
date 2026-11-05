import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { dictationAccuracy, normalizeAnswer } from "@/lib/dictation-skill-lab/grade";
import { audioReady, getStoredLesson } from "@/lib/dictation-skill-lab/lessons";

type Body = { turn_id?: unknown; answer?: unknown };

/** Check one heard turn without sending the rest of the transcript to the learner. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = getStoredLesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài." }, { status: 404 });
  if (!audioReady(lesson)) return NextResponse.json({ error: "Bài này chưa có đủ audio." }, { status: 409 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || typeof body.turn_id !== "string" || typeof body.answer !== "string" || body.answer.length > 600)
    return NextResponse.json({ error: "Câu trả lời không hợp lệ." }, { status: 400 });
  const turn = lesson.turns.find((item) => item.turn_id === body.turn_id);
  if (!turn) return NextResponse.json({ error: "Không tìm thấy lượt nghe." }, { status: 404 });
  const accuracy = dictationAccuracy(turn.text_en, body.answer);
  return NextResponse.json({ turn_id: turn.turn_id, accuracy, correct: normalizeAnswer(turn.text_en) === normalizeAnswer(body.answer),
    reference_text: turn.text_en, translation_vi: turn.translation_vi }, { headers: { "Cache-Control": "private, no-store" } });
}
