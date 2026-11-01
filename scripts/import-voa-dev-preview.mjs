// Dev-only importer: expose official VOA conversation MP3s as unreviewed test lessons.
// No human review flags are asserted. Requires the isolated development service key.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key || new URL(url).hostname !== "bhactqaxcvusmpeooxwi.supabase.co") {
  throw new Error("Use only the isolated development Supabase project");
}
const db = createClient(url, key, { auth: { persistSession: false } });
let imported = 0;
let skipped = 0;
let segmentCount = 0;
for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
  const item = JSON.parse(line);
  const source = new URL(item.url);
  const audio = new URL(item.audio_url);
  const cefr = item.source_group === "Lets Learn English Level 1" ? "A1"
    : item.source_group === "Lets Learn English Level 2" ? "A2" : null;
  if (!cefr || source.protocol !== "https:" || source.hostname !== "learningenglish.voanews.com"
    || !source.pathname.startsWith("/a/") || audio.protocol !== "https:"
    || !["voa-audio.voanews.eu", "voa-audio-english.voanews.eu"].includes(audio.hostname)
    || !audio.pathname.endsWith(".mp3") || !/^[0-9a-f]{64}$/.test(item.media_sha256)
    || item.r2_key !== `dictation/voa/${item.media_sha256}.mp3`
    || !Number.isSafeInteger(item.media_bytes) || item.media_bytes <= 2000
    || !Number.isSafeInteger(item.duration_ms) || item.duration_ms < 5000
    || !item.transcript_candidate?.trim() || item.transcript_candidate.length > 30000
    || !Array.isArray(item.segments) || !item.segments.length || item.segments.length > 3000) {
    throw new Error(`Invalid dev Preview article #${item.id}`);
  }
  let lastEnd = 0;
  for (const [index, part] of item.segments.entries()) {
    if (part.ordinal !== index + 1 || part.start_ms !== lastEnd
      || !Number.isInteger(part.end_ms) || part.end_ms <= part.start_ms
      || !part.reference_text?.trim() || part.reference_text.length > 800
      || typeof part.speaker !== "string") {
      throw new Error(`Invalid timed test segment in article #${item.id}`);
    }
    lastEnd = part.end_ms;
  }
  if (lastEnd !== item.duration_ms) throw new Error(`Audio duration mismatch in article #${item.id}`);

  const { data: existing, error: lookupError } = await db.from("voa_dictation_lessons")
    .select("id,status").eq("source_url", source.href).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing && ["published", "blocked", "rejected"].includes(existing.status)) {
    skipped++;
    continue;
  }
  const publishedAt = item.published && !Number.isNaN(Date.parse(item.published))
    ? new Date(item.published).toISOString() : null;
  const payload = {
    source_url: source.href, title: item.title.trim(), topic: item.source_group,
    source_group: item.source_group, source_audio_url: audio.href,
    source_published_at: publishedAt, cefr, transcript: item.transcript_candidate.trim(),
    audio_object_key: item.r2_key, audio_sha256: item.media_sha256,
    audio_bytes: item.media_bytes, r2_verified: true, status: "uploaded",
    attribution: "VOA Learning English",
    review_notes: "Dev Preview: audio and transcript are unreviewed; sentence timing is estimated.",
  };
  const mutation = existing
    ? await db.from("voa_dictation_lessons").update(payload).eq("id", existing.id).select("id").single()
    : await db.from("voa_dictation_lessons").insert(payload).select("id").single();
  if (mutation.error) throw mutation.error;
  const lessonId = mutation.data.id;
  const rows = item.segments.map((part) => ({ ...part, lesson_id: lessonId }));
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await db.from("voa_dictation_segments")
      .upsert(rows.slice(start, start + 100), { onConflict: "lesson_id,ordinal" });
    if (error) throw error;
  }
  imported++;
  segmentCount += rows.length;
  if (imported % 10 === 0) console.log(`Dev Preview staged ${imported} lessons`);
}
console.log(`Dev Preview: lessons=${imported}, segments=${segmentCount}, skipped=${skipped}; human review flags remain false`);
