import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { getStoredMock, gradeMock, mockAudioReady, mockTranscript } from "@/lib/listening-mocks/mocks";

/** Grades a whole test on the server and only then returns answers, explanations and the transcript. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const test = getStoredMock((await context.params).id);
  if (!test) return NextResponse.json({ error: "Không tìm thấy đề." }, { status: 404 });
  if (!mockAudioReady(test)) return NextResponse.json({ error: "Đề này chưa có đủ audio." }, { status: 409 });
  const body = await request.json().catch(() => null) as { answers?: unknown; part?: unknown } | null;
  if (!body || typeof body.answers !== "object" || body.answers === null || Array.isArray(body.answers))
    return NextResponse.json({ error: "Dữ liệu bài làm không hợp lệ." }, { status: 400 });
  if (body.part !== undefined && (!Number.isInteger(body.part) || !test.parts.some((part) => part.part_number === body.part)))
    return NextResponse.json({ error: "Section không hợp lệ." }, { status: 400 });
  const answers = Object.fromEntries(Object.entries(body.answers as Record<string, unknown>)
    .filter(([key, value]) => /^\d{1,2}$/.test(key) && typeof value === "string")) as Record<string, string>;
  const results = gradeMock(test, answers).filter((item) => body.part === undefined || item.part_number === body.part);
  return NextResponse.json({
    correct: results.filter((item) => item.correct).length, total: results.length, results,
    transcript: mockTranscript(test).filter((part) => body.part === undefined || part.part_number === body.part),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
