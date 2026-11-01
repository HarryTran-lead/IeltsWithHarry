import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const base = process.env.R2_MEDIA_BASE_URL;
  if (!base) return new Response("VOA media is not configured", { status: 503 });
  let media: URL;
  try {
    media = new URL(base.endsWith("/") ? base : `${base}/`);
    if (media.protocol !== "https:" || media.username || media.password || media.search || media.hash) throw new Error();
  } catch { return new Response("VOA media is not configured", { status: 503 }); }
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) return new Response("Unauthorized", { status: 401 });
  const { data: lesson } = await db.from("voa_dictation_lessons")
    .select("audio_object_key,status,r2_verified").eq("id", id).maybeSingle();
  const testAudio = process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES === "true"
    && lesson?.status === "uploaded" && lesson.r2_verified;
  if (lesson?.status !== "published" && !testAudio) {
    const { data: admin } = await db.rpc("is_admin");
    if (!admin) return new Response("Not found", { status: 404 });
  }
  if (!lesson?.audio_object_key || !/^dictation\/voa\/[0-9a-f]{64}\.mp3$/.test(lesson.audio_object_key))
    return new Response("Not found", { status: 404 });
  const target = new URL(lesson.audio_object_key, media);
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
