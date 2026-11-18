import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { getStoredMock, mockAudioReady, toPublicMock } from "@/lib/listening-mocks/mocks";

/** A test for the exam player: audio and questions, no transcript or answers. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const test = getStoredMock((await context.params).id);
  if (!test) return NextResponse.json({ error: "Không tìm thấy đề." }, { status: 404 });
  if (!mockAudioReady(test)) return NextResponse.json({ error: "Đề này chưa có đủ audio." }, { status: 409 });
  return NextResponse.json({ test: toPublicMock(test) }, { headers: { "Cache-Control": "private, no-store" } });
}
