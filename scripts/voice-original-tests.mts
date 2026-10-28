// Voices the Listening parts of the owner-supplied ten-paper pilot ZIP with Gemini TTS, one MP3 per part,
// into content/original-tests/dist/audio (gitignored). Existing files are skipped, so it can be re-run.
// It only writes local files; attaching audio to the question bank is a separate, reviewed step.
//   LAMEJS=<path to @breezystack/lamejs/dist/lamejs.js> node --env-file=.env.local --experimental-strip-types scripts/voice-original-tests.mts --zip <path>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { defaultVoices, parseTranscript, pcmFromAudio, speakersOf, synthesizeTranscript, ttsModels, TTS_SAMPLE_RATE } from "../src/lib/listening-tts.ts";

const args = process.argv.slice(2);
const zipPath = args[args.indexOf("--zip") + 1];
if (!zipPath || args.indexOf("--zip") < 0) throw new Error("Pass --zip <owner-supplied ZIP path>");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");
const out = join("content", "original-tests", "dist", "audio");
mkdirSync(out, { recursive: true });

type Part = { title: string; script?: { speaker: string; text: string }[] };
const files = unzipSync(readFileSync(zipPath), { filter: (entry) => /^english-skill-lab-pilot\/content\/ESL-L-0[1-5]\.json$/.test(entry.name) });
const papers = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([, bytes]) => JSON.parse(strFromU8(bytes)) as { id: string; parts: Part[] });
if (papers.length !== 5) throw new Error(`Expected 5 Listening papers, got ${papers.length}`);

function mp3FromPcm(pcm: Uint8Array) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const encoder = new Mp3Encoder(1, TTS_SAMPLE_RATE, 64);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
    if (encoded.length) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

let made = 0;
for (const paper of papers) {
  for (const [index, part] of paper.parts.entries()) {
    // File names match the section ids the importer creates (ESL-L-01-P1 …).
    const target = join(out, `${paper.id}-P${index + 1}.mp3`);
    if (existsSync(target) || !part.script?.length) continue;
    const transcript = part.script.map((line) => `${line.speaker}: ${line.text}`).join("\n");
    const voices = defaultVoices(speakersOf(parseTranscript(transcript)));
    const { wav, seconds, requests } = await synthesizeTranscript(transcript, { voices, apiKey, models: ttsModels() });
    writeFileSync(target, mp3FromPcm(pcmFromAudio(wav)));
    made += 1;
    console.log(`${paper.id}-P${index + 1}: ${seconds}s, ${requests} request(s), voices ${Object.values(voices).join("/")}`);
  }
}
console.log(`done: ${made} new file(s)`);
