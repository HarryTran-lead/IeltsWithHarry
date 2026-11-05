import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const base = process.env.R2_MEDIA_BASE_URL;
  if (!base) return new Response("Media is not configured", { status: 503 });
  let media: URL;
  try {
    media = new URL(base.endsWith("/") ? base : `${base}/`);
    if (media.protocol !== "https:" || media.username || media.password || media.search || media.hash) throw new Error();
  } catch { return new Response("Media is not configured", { status: 503 }); }
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) return new Response("Unauthorized", { status: 401 });
  const { data: clip } = await db.from("dictation_clips")
    .select("audio_object_key,status").eq("id", id).maybeSingle();
  if (!clip || !["preview", "published"].includes(clip.status)
    || !/^dictation\/clips\/quick\/[0-9a-f]{64}\.(flac|wav)$/.test(clip.audio_object_key))
    return new Response("Not found", { status: 404 });
  const response = NextResponse.redirect(new URL(clip.audio_object_key, media), 307);
  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
