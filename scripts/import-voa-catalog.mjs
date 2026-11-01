// Admin-only metadata queue. No audio and no unreviewed transcript are imported.
// Usage: node --env-file=.env.development.local scripts/import-voa-catalog.mjs path/to/export_catalog.jsonl
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key || new URL(url).hostname !== "bhactqaxcvusmpeooxwi.supabase.co") {
  throw new Error("Pass a catalog JSONL path and isolated development Supabase credentials");
}
const db = createClient(url, key, { auth: { persistSession: false } });
let inserted = 0;
let existing = 0;
for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
  const item = JSON.parse(line);
  const source = new URL(item.url);
  if (source.protocol !== "https:" || source.hostname !== "learningenglish.voanews.com"
    || source.username || source.password || !source.pathname.startsWith("/a/")
    || typeof item.title !== "string" || item.title.trim().length < 5 || item.title.length > 240) {
    throw new Error(`Invalid VOA catalog row ${item.id}`);
  }
  const { data: prior, error: lookupError } = await db.from("voa_dictation_lessons")
    .select("id").eq("source_url", source.href).maybeSingle();
  if (lookupError) throw lookupError;
  if (prior) { existing++; continue; }
  const publishedAt = item.published && !Number.isNaN(Date.parse(item.published))
    ? new Date(item.published).toISOString() : null;
  const status = item.status === "discovered" ? "discovered" : "needs_review";
  let audioUrl = null;
  if (typeof item.audio_url === "string" && item.audio_url) {
    const candidate = new URL(item.audio_url);
    if (candidate.protocol === "https:" && !candidate.username && !candidate.password
      && ["voa-audio.voanews.eu", "voa-audio-english.voanews.eu"].includes(candidate.hostname)
      && candidate.pathname.toLowerCase().endsWith(".mp3")) audioUrl = candidate.href;
  }
  const group = typeof item.source_group === "string" ? item.source_group.trim().slice(0, 120) : "";
  const { error } = await db.from("voa_dictation_lessons").insert({
    source_url: source.href, title: item.title.trim(), topic: group || "VOA Learning English",
    source_group: group || "VOA Learning English", source_published_at: publishedAt,
    source_audio_url: audioUrl, third_party_warning: Boolean(item.third_party_warning),
    status,
  });
  if (error) throw error;
  inserted++;
}
console.log(`VOA admin metadata: inserted=${inserted}, already_present=${existing}; published=0`);
