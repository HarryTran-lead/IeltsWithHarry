import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { dictationAccuracy, normalizeAnswer } from "@/lib/dictation-skill-lab/grade";
import { audioReady, focusFor, getStoredLesson, turnNotes } from "@/lib/dictation-skill-lab/lessons";
import { dictationPassed, missingFocus } from "@/lib/dictation/pass";

type Body = { turn_id?: unknown; answer?: unknown };

/**
 * Check one heard sentence without sending the rest of the transcript. A sentence passes only when
 * its focus words (the sound, number or name the lesson trains) are right and, for six words or
 * fewer, every word is right.
 */
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
  const correct = normalizeAnswer(turn.text_en) === normalizeAnswer(body.answer);
  const accuracy = correct ? 1 : dictationAccuracy(turn.text_en, body.answer);
  const focus = focusFor(lesson, turn.turn_id);
  const missed = body.answer.trim() ? missingFocus(focus, body.answer) : focus;
  const notes = turnNotes(lesson, turn.turn_id);
  return NextResponse.json({
    turn_id: turn.turn_id, accuracy, correct, passed: correct || dictationPassed(turn.text_en, accuracy, missed),
    focus, missed_focus: missed, reference_text: turn.text_en, translation_vi: turn.translation_vi, ...notes,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
