import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { skillMaterialSchema } from "@/lib/skill-material";
import { defaultStyle, synthesizeTranscript, ttsModels } from "@/lib/listening-tts";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  lessonId: z.uuid(),
  voices: z.record(z.string().max(40), z.string().max(40)).default({}),
  style: z.string().trim().max(200).optional(),
});

/** Admin-only: reads the saved Listening transcript, voices it with Gemini, stores the WAV and links it to the lesson. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: isAdmin } = claims?.claims ? await supabase.rpc("is_admin") : { data: false };
  if (isAdmin !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Máy chủ chưa cấu hình GEMINI_API_KEY." }, { status: 503 });
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  const { lessonId, voices, style } = body.data;

  const { data: row, error: loadError } = await supabase.from("lesson_materials").select("content").eq("lesson_id", lessonId).maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  const material = skillMaterialSchema.safeParse(row?.content);
  if (!material.success || material.data.skill !== "Listening") return NextResponse.json({ error: "Hãy lưu transcript của bài Listening trước." }, { status: 400 });

  try {
    const { wav, seconds, requests } = await synthesizeTranscript(material.data.transcript, { voices, style: style || defaultStyle, apiKey, models: ttsModels() });
    const path = `${lessonId}/tts-${randomUUID()}.wav`;
    const upload = await supabase.storage.from("lesson-media").upload(path, wav, { contentType: "audio/wav", upsert: false });
    if (upload.error) throw new Error(upload.error.message);
    const audioUrl = supabase.storage.from("lesson-media").getPublicUrl(path).data.publicUrl;
    const content = { ...material.data, audioUrl };
    const saved = await supabase.from("lesson_materials").update({ content, updated_at: new Date().toISOString() }).eq("lesson_id", lessonId);
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ audioUrl, seconds, requests });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Không tạo được âm thanh." }, { status: 502 });
  }
}
