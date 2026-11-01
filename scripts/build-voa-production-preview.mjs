// Builds an explicit, repeatable production trial import from the locally checked VOA exports.
// No QA flag is set. Run the generated SQL only against project vpkhriywprepuhrbarye.
import { readFile, writeFile } from "node:fs/promises";

const [metadataPath, alignedPath, outputPath] = process.argv.slice(2);
if (!metadataPath || !alignedPath || !outputPath) {
  throw new Error("Usage: node scripts/build-voa-production-preview.mjs <metadata.jsonl> <aligned.jsonl> <output.sql>");
}
const readJsonl = async (path) => (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const metadata = await readJsonl(metadataPath);
const aligned = await readJsonl(alignedPath);
const byUrl = new Map(aligned.map((row) => [row.url, row]));
if (metadata.length !== 79 || aligned.length !== 79 || byUrl.size !== 79) throw new Error("Expected exactly 79 unique VOA lessons");
const literal = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const integer = (value, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`Invalid integer: ${value}`);
  return String(value);
};
const sql = ["-- Production project only: vpkhriywprepuhrbarye", "-- Unreviewed learner trial. Do not set any rights, transcript, audio or timing QA flags.", "begin;", "set local standard_conforming_strings = on;"];
let segmentCount = 0;
const urls = new Set();
for (const item of metadata) {
  const source = new URL(item.url);
  const audio = new URL(item.audio_url);
  const cefr = item.source_group === "Lets Learn English Level 1" ? "A1"
    : item.source_group === "Lets Learn English Level 2" ? "A2" : null;
  const match = byUrl.get(item.url);
  if (!cefr || !match || urls.has(item.url) || source.protocol !== "https:"
    || source.hostname !== "learningenglish.voanews.com" || !source.pathname.startsWith("/a/")
    || audio.protocol !== "https:" || !["voa-audio.voanews.eu", "voa-audio-english.voanews.eu"].includes(audio.hostname)
    || !audio.pathname.endsWith(".mp3") || !/^[0-9a-f]{64}$/.test(item.media_sha256)
    || item.r2_key !== `dictation/voa/${item.media_sha256}.mp3`
    || !item.transcript_candidate?.trim() || item.transcript_candidate.length > 30000
    || item.transcript_candidate.trim().length < 30 || !Array.isArray(match.sentences)
    || match.duration_ms !== item.duration_ms) throw new Error(`Invalid trial lesson: ${item.url}`);
  urls.add(item.url);
  const bytes = integer(item.media_bytes, 2001);
  const duration = integer(item.duration_ms, 5000);
  if (!match.sentences.length || match.sentences.length > 3000) throw new Error(`No aligned sentences: ${item.url}`);
  let previousEnd = 0;
  const tuples = match.sentences.map((part, index) => {
    const start = integer(part.start_ms);
    const end = integer(part.end_ms, Number(start) + 1);
    if (part.ordinal !== index + 1 || Number(start) < previousEnd || Number(end) > Number(duration)
      || !part.reference_text?.trim() || part.reference_text.length > 800
      || typeof part.speaker !== "string") throw new Error(`Invalid aligned sentence ${index + 1}: ${item.url}`);
    previousEnd = Number(end);
    return `(${integer(part.ordinal, 1)},${start},${end},${literal(part.reference_text.trim())},${literal(part.speaker)})`;
  });
  segmentCount += tuples.length;
  const published = item.published && !Number.isNaN(Date.parse(item.published))
    ? new Date(item.published).toISOString() : null;
  sql.push(`insert into public.voa_dictation_lessons
    (source_url,title,topic,source_group,source_audio_url,source_published_at,cefr,transcript,
     audio_object_key,audio_sha256,audio_bytes,r2_verified,status,attribution,review_notes)
    values (${literal(source.href)},${literal(item.title.trim())},${literal(item.source_group)},
      ${literal(item.source_group)},${literal(audio.href)},${literal(published)},${literal(cefr)},
      ${literal(item.transcript_candidate.trim())},${literal(item.r2_key)},${literal(item.media_sha256)},
      ${bytes},true,'uploaded','VOA Learning English',
      'Production trial: audio, transcript and sentence timing have not been reviewed manually.')
    on conflict (source_url) do nothing;`);
  sql.push(`with target as (select id from public.voa_dictation_lessons where source_url = ${literal(source.href)} and status in ('uploaded','preview'))
    insert into public.voa_dictation_segments(id,lesson_id,ordinal,start_ms,end_ms,reference_text,speaker)
    select gen_random_uuid(),target.id,part.ordinal,part.start_ms,part.end_ms,part.reference_text,part.speaker
    from target cross join (values ${tuples.join(",")}) as part(ordinal,start_ms,end_ms,reference_text,speaker)
    on conflict (lesson_id,ordinal) do nothing;`);
}
if (segmentCount !== 5021) throw new Error(`Expected 5021 aligned sentences, got ${segmentCount}`);
const urlList = [...urls].map(literal).join(",");
sql.push(`update public.voa_dictation_lessons set status = 'preview' where status = 'uploaded' and source_url in (${urlList});`);
sql.push(`do $$ begin
  if (select count(*) from public.voa_dictation_lessons where status = 'preview' and source_url in (${urlList})) <> 79
    or (select count(*) from public.voa_dictation_segments s join public.voa_dictation_lessons l on l.id = s.lesson_id where l.status = 'preview' and l.source_url in (${urlList})) <> 5021
  then raise exception 'Trial import verification failed'; end if;
end $$;`);
sql.push("commit;");
await writeFile(outputPath, sql.join("\n") + "\n", "utf8");
console.log(`Prepared ${metadata.length} unreviewed trial lessons and ${segmentCount} aligned sentences`);
