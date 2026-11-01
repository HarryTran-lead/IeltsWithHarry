// Import only R2-uploaded, verified worker records as unpublished admin drafts.
// Usage: node --env-file=.env.development.local scripts/import-voa-staging.mjs path/to/export_verified.jsonl
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key || new URL(url).hostname !== "bhactqaxcvusmpeooxwi.supabase.co") {
  throw new Error("Pass a staging JSONL path and isolated development Supabase credentials");
}
const db = createClient(url, key, { auth: { persistSession: false } });
let imported = 0;
for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
  const item = JSON.parse(line);
  if (!/^https:\/\/learningenglish\.voanews\.com\//.test(item.url)
    || !/^[0-9a-f]{64}$/.test(item.media_sha256)
    || item.r2_key !== `dictation/voa/${item.media_sha256}.mp3`
    || !Number.isSafeInteger(item.media_bytes) || item.media_bytes <= 0
    || !item.transcript_candidate?.trim() || item.transcript_candidate.length > 30000) {
    throw new Error(`Invalid verified worker row ${item.id}`);
  }
  const { data: existing, error: lookupError } = await db.from("voa_dictation_lessons")
    .select("id,status").eq("source_url", item.url).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (existing.status === "published") { console.log(`SKIP published ${item.id}`); continue; }
    const { error } = await db.from("voa_dictation_lessons").update({
      audio_object_key: item.r2_key, audio_sha256: item.media_sha256,
      audio_bytes: item.media_bytes, r2_verified: true, audio_verified: false,
      timings_verified: false, status: "uploaded",
    }).eq("id", existing.id);
    if (error) throw error;
    imported++;
    continue;
  }
  const { error } = await db.from("voa_dictation_lessons").insert({
    source_url: item.url, title: item.title, topic: item.source_group || "VOA Learning English",
    transcript: item.transcript_candidate, audio_object_key: item.r2_key,
    audio_sha256: item.media_sha256, audio_bytes: item.media_bytes,
    r2_verified: true, status: "uploaded", review_notes: item.review_notes || "",
    attribution: "VOA Learning English",
  });
  if (error) throw error;
  imported++;
}
console.log(`Imported ${imported} unpublished VOA draft(s) into development.`);
