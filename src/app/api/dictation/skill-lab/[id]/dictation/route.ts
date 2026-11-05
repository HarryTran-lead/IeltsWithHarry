import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { dictationAccuracy, normalizeAnswer } from "@/lib/dictation-skill-lab/grade";
import { audioReady, focusFor, getStoredLesson, sentenceUnits, turnNotes } from "@/lib/dictation-skill-lab/lessons";
import { missingFocus } from "@/lib/dictation/pass";

type Body = { turn_id?: unknown; answer?: unknown };

/**
 * Check one heard sentence without sending the rest of the transcript. Passing
 * the guided dictation requires every word of this sentence to be correct.
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
  const units = sentenceUnits(lesson);
  const unit = units.find((item) => item.id === body.turn_id);
  if (!unit) return NextResponse.json({ error: "Không tìm thấy câu nghe." }, { status: 404 });
  const correct = normalizeAnswer(unit.text) === normalizeAnswer(body.answer);
  const accuracy = correct ? 1 : dictationAccuracy(unit.text, body.answer);
  const spoken = ` ${normalizeAnswer(unit.text)} `;
  const focus = focusFor(lesson, unit.source.turn_id).filter((phrase) => spoken.includes(` ${normalizeAnswer(phrase)} `));
  const missed = body.answer.trim() ? missingFocus(focus, body.answer) : focus;
  const notes = turnNotes(lesson, unit.source.turn_id);
  const lastInTurn = units.filter((item) => item.source.turn_id === unit.source.turn_id).at(-1)?.id === unit.id;
  return NextResponse.json({
    turn_id: unit.id, accuracy, correct, passed: correct,
    focus, missed_focus: missed, reference_text: unit.text, translation_vi: unit.translation,
    explanation_vi: lastInTurn ? notes.explanation_vi : "",
    vocabulary: notes.vocabulary.filter((word) => spoken.includes(` ${normalizeAnswer(word.term)} `)),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
