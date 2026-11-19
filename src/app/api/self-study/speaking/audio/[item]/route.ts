import { NextResponse } from "next/server";
import { speakingAccess } from "@/lib/speaking-lab/access";
import { speakingAudio } from "@/lib/speaking-lab/source";

/** A listening-check clip for the pronunciation lessons. Private like the lessons, so it is served, not linked. */
export async function GET(_request: Request, context: { params: Promise<{ item: string }> }) {
  const access = await speakingAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const audio = await speakingAudio((await context.params).item);
  if (!audio) return NextResponse.json({ error: "Không tìm thấy âm thanh." }, { status: 404 });
  return new NextResponse(audio as BodyInit, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
}
