// Voices a package's listening scripts and vocabulary lists with Gemini TTS and saves MP3s in <dir>/dist/audio.
// Run after build-package.mjs. Files that already exist are skipped, so the script can be re-run after a failure.
//   LAMEJS=<path to @breezystack/lamejs/dist/lamejs.js> node --env-file=.env.local --experimental-strip-types content/tts-package.mjs <package dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultVoices, parseTranscript, pcmFromAudio, speakersOf, synthesizeTranscript, ttsModels, TTS_SAMPLE_RATE } from "../src/lib/listening-tts.ts";

const packageArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!packageArg) throw new Error("Pass the package folder, e.g. content/ielts-builder-5-6-v3");
const root = resolve(packageArg);
const dist = join(root, "dist");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");

const course = JSON.parse(readFileSync(join(dist, "course_v2.json"), "utf8"));
const jobs = [];
for (const unit of course.units) {
  const number = String(unit.order).padStart(2, "0");
  const vocabulary = unit.lessons.find((lesson) => lesson.type === "vocabulary");
  // Each word, then its example sentence, read by one narrator.
  jobs.push({ file: `audio/U${number}_Vocabulary.mp3`, text: vocabulary.vocabulary.map((word) => `${word.en}. ${word.example}`).join("\n") , style: "clear, slow and friendly, like a teacher reading a word list to students, with a short pause after each item" });
  jobs.push({ file: `audio/U${number}_Listening_1.mp3`, text: unit.lessons.find((lesson) => lesson.type === "listening").transcript });
  unit.expanded_listenings.forEach((item) => jobs.push({ file: `audio/${item.audio_filename}`, text: item.transcript }));
}
course.diagnostic.listening.forEach((item) => jobs.push({ file: `audio/${item.audio_filename}`, text: item.transcript }));

function mp3FromPcm(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const encoder = new Mp3Encoder(1, TTS_SAMPLE_RATE, 64);
  const chunks = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    const out = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
    if (out.length) chunks.push(Buffer.from(out));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

mkdirSync(join(dist, "audio"), { recursive: true });
let made = 0;
for (const job of jobs) {
  const target = join(dist, job.file);
  if (existsSync(target)) continue;
  const voices = defaultVoices(speakersOf(parseTranscript(job.text)));
  const { wav, seconds, requests } = await synthesizeTranscript(job.text, { voices, apiKey, models: ttsModels(), ...(job.style ? { style: job.style } : {}) });
  writeFileSync(target, mp3FromPcm(pcmFromAudio(wav)));
  made += 1;
  console.log(`${job.file}: ${seconds}s, ${requests} request(s), voices ${Object.values(voices).join("/")}`);
}
console.log(`done: ${made} new file(s), ${jobs.length} in total`);
