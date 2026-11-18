// Re-voices Book 2 recordings that the package shipped as robotic espeak drafts, using Gemini TTS and the
// lesson transcripts, and records them in content/book2/audio-overrides.json so build-book-2.py keeps them.
// A file is skipped when its transcript has not changed since it was voiced; pass --force to redo it.
//   LAMEJS=<path to @breezystack/lamejs/dist/lamejs.js> node --env-file=.env.local --experimental-strip-types scripts/tts-book2-audio.mjs [--only U07_Listening_1] [--force]
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseTranscript, pcmFromAudio, silence, synthesizeTranscript, ttsModels, TTS_SAMPLE_RATE } from "../src/lib/listening-tts.ts";

const root = resolve(import.meta.dirname, "..");
const lessons = join(root, "content/book2/lessons");
const overridesFile = join(root, "content/book2/audio-overrides.json");
const media = join(root, "public/book-2/media");
const force = process.argv.includes("--force");
const only = process.argv.flatMap((arg, index) => (process.argv[index - 1] === "--only" ? [arg] : []));

// Voices chosen per speaker so names and roles sound like the people the transcript describes.
const jobs = {
  "U01/audio/U01_Listening_4.mp3": { Agent: "Puck", Caller: "Kore" },
  "U02/audio/U02_Listening_4.mp3": { Narrator: "Aoede" },
  "U02/audio/U02_Listening_5.mp3": { Narrator: "Charon" },
  "U03/audio/U03_Listening_4.mp3": { Host: "Charon", Anna: "Kore", Ben: "Puck", Chloe: "Leda" },
  "U04/audio/U04_Listening_4.mp3": { Interviewer: "Orus", Maya: "Kore", Leo: "Puck" },
  "U06/audio/U06_Listening_4.mp3": { Lecturer: "Iapetus" },
  "U07/audio/U07_Listening_1.mp3": { Receptionist: "Leda", Applicant: "Puck" },
  "U07/audio/U07_Listening_2.mp3": { Guide: "Kore", Student: "Orus" },
  "U07/audio/U07_Listening_3.mp3": { Tutor: "Charon", Maya: "Kore", Jon: "Puck" },
  "U07/audio/U07_Listening_4.mp3": { Lecturer: "Aoede" },
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");

const transcripts = {};
for (const file of readdirSync(lessons)) {
  for (const audio of JSON.parse(readFileSync(join(lessons, file), "utf8")).audios ?? []) {
    const path = (audio.audio_url ?? "").replace("/book-2/media/", "");
    if (path && audio.transcript) transcripts[path] = audio.transcript;
  }
}

/** Some transcripts put several speakers on one line ("…think? Anna: I am…"); give each turn its own line. */
function speakerLines(transcript, speakers) {
  const names = speakers.filter((name) => name !== "Narrator").map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return names.length ? transcript.replace(new RegExp(`([.?!…])\\s+(${names.join("|")}):\\s`, "g"), "$1\n$2: ") : transcript;
}

/** Turns grouped into parts short enough for one synthesis call (the TTS helper caps a WAV at 10 MB). */
function parts(transcript, maxChars = 1800) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const turn of parseTranscript(transcript)) {
    if (current.length && size + turn.text.length > maxChars) { groups.push(current); current = []; size = 0; }
    current.push(turn);
    size += turn.text.length;
  }
  if (current.length) groups.push(current);
  return groups.map((group) => group.map((turn) => (turn.speaker === "Narrator" ? turn.text : `${turn.speaker}: ${turn.text}`)).join("\n"));
}

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

const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, "utf8")) : {};
for (const [path, voices] of Object.entries(jobs)) {
  if (only.length && !only.some((name) => path.includes(name))) continue;
  const transcript = transcripts[path];
  if (!transcript) throw new Error(`${path}: no lesson uses this recording`);
  const text = speakerLines(transcript, Object.keys(voices));
  const sha = createHash("sha256").update(transcript).digest("hex");
  const target = join(media, path);
  if (!force && overrides[path]?.transcript_sha256 === sha && existsSync(target)) { console.log(`${path}: up to date`); continue; }
  const speakers = [...new Set(parseTranscript(text).map((turn) => turn.speaker))];
  const unknown = speakers.filter((speaker) => !voices[speaker]);
  if (unknown.length) throw new Error(`${path}: no voice for ${unknown.join(", ")}`);
  const pcm = [];
  let requests = 0;
  for (const [index, part] of parts(text).entries()) {
    const result = await synthesizeTranscript(part, { voices, apiKey, models: ttsModels() });
    if (index) pcm.push(silence());
    pcm.push(pcmFromAudio(result.wav));
    requests += result.requests;
  }
  const joined = Buffer.concat(pcm.map((part) => Buffer.from(part.buffer, part.byteOffset, part.byteLength)));
  const seconds = Math.round((joined.byteLength / 2 / TTS_SAMPLE_RATE) * 10) / 10;
  writeFileSync(target, mp3FromPcm(joined));
  overrides[path] = { source: "gemini-tts", voices, transcript_sha256: sha, seconds, requests, replaced: "package espeak draft" };
  writeFileSync(overridesFile, `${JSON.stringify(overrides, null, 2)}\n`);
  console.log(`${path}: ${seconds}s, ${requests} request(s), voices ${speakers.map((speaker) => `${speaker}=${voices[speaker]}`).join(" ")}`);
}
