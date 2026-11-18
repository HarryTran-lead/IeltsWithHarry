// English Skill Lab Listening Mocks 01–05 (owner package "Listening_Tests_01-05_Full.zip").
// The package keeps answer keys in server_only/, so it lives outside this public repo; pass its folder:
//
//   LAMEJS=<lame.all.js> node --env-file=.env.local --experimental-strip-types scripts/listening-mocks.mts --voice <package>
//   node --experimental-strip-types scripts/listening-mocks.mts --build <package>      exam JSON + timings → <package>/../build
//
// --voice renders every turn as its own Gemini TTS request so each turn gets an exact start/end time (the
// transcript can follow the audio and review can jump to the evidence). Narrator rubric and the real-exam
// reading/checking pauses are added around the two dialogue blocks of each part. Re-runs skip finished turns.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pcmFromAudio, silence, ttsModels, ttsRequestBody, TTS_SAMPLE_RATE } from "../src/lib/listening-tts.ts";

const args = process.argv.slice(2);
const pkg = args.find((arg) => !arg.startsWith("--"));
if (!pkg || !existsSync(join(pkg, "MOCK_01"))) throw new Error("Pass the extracted package folder (with MOCK_01 … MOCK_05)");
// --provider sapi renders a local Windows-voice placeholder (for checking the player and timings only) into its
// own folder, so it can never be mistaken for the real Gemini recording.
const provider = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : "gemini";
if (provider !== "gemini" && provider !== "sapi") throw new Error("--provider gemini|sapi");
const audioDir = join(pkg, "..", provider === "sapi" ? "audio-placeholder" : "audio");
const cacheDir = join(audioDir, "turns");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

const partName = (mock: number, part: number) => `MOCK-0${mock}-P${part}`;

type Speaker = { speaker_id: string; role: string; accent_requested: string };
type TurnRow = { turn_id: string; speaker_id: string; text_en: string };
type QuestionRow = { question_id: string; test_question_number: number; evidence_turn_ids: string[] };
type GroupRow = { group_id: string; question_ids: string[]; question_type: string };
type PartRow = { part_number: number; title: string; speakers: Speaker[]; turns: TurnRow[]; questions: QuestionRow[]; question_groups: GroupRow[] };
type Master = { test_id: string; title: string; parts: PartRow[] };

/** Narrator intro ("You will hear …") and voice per speaker id. Voices differ inside a part. */
const cast: Record<string, { intro: string; voices: Record<string, string> }> = {
  "1-1": { intro: "a woman from a clock repair workshop talking to a customer about an old clock", voices: { A: "Kore", B: "Charon" } },
  "1-2": { intro: "a visitor coordinator welcoming people to a canal discovery day", voices: { A: "Aoede" } },
  "1-3": { intro: "a supervisor and two students discussing a campus food-waste project", voices: { A: "Kore", B: "Leda", C: "Puck" } },
  "1-4": { intro: "part of a lecture about what tree rings can tell scientists", voices: { L: "Orus" } },
  "2-1": { intro: "a conversation between a woman who works for a compost collection service and a new resident", voices: { A: "Kore", B: "Leda" } },
  "2-2": { intro: "a guide giving a tour of a community radio station", voices: { A: "Aoede" } },
  "2-3": { intro: "a supervisor and two students discussing a study of music and reading", voices: { A: "Charon", B: "Zephyr", C: "Puck" } },
  "2-4": { intro: "part of a lecture about why queues form", voices: { L: "Kore" } },
  "3-1": { intro: "a man from a music repair shop talking to a customer about an instrument inspection", voices: { A: "Puck", B: "Leda" } },
  "3-2": { intro: "a coordinator briefing a group of environmental volunteers", voices: { A: "Charon" } },
  "3-3": { intro: "a professor and two engineering students comparing solar cooker designs", voices: { A: "Orus", B: "Aoede", C: "Puck" } },
  "3-4": { intro: "part of a lecture about storing seeds for conservation", voices: { L: "Zephyr" } },
  "4-1": { intro: "a woman from an equipment library talking to a customer who wants to borrow a film kit", voices: { A: "Kore", B: "Puck" } },
  "4-2": { intro: "a visitor manager talking to visitors at a railway heritage site", voices: { A: "Charon" } },
  "4-3": { intro: "a tutor and two students discussing an accessible museum tour", voices: { A: "Aoede", B: "Leda", C: "Orus" } },
  "4-4": { intro: "part of a lecture about salt and the weathering of historic stone", voices: { L: "Puck" } },
  "5-1": { intro: "a woman from an astronomy club talking to someone who wants to join", voices: { A: "Kore", B: "Charon" } },
  "5-2": { intro: "the manager of a refill market talking to a group of visitors", voices: { A: "Orus" } },
  "5-3": { intro: "a lecturer and two students discussing research on how people use parks after dark", voices: { A: "Aoede", B: "Leda", C: "Puck" } },
  "5-4": { intro: "part of a lecture about ice cores and the history of the atmosphere", voices: { L: "Kore" } },
};
const accents: Record<string, string> = { british: "British", australian: "Australian", new_zealand: "New Zealand", north_american: "North American" };

export function loadMasters(root: string) {
  return readdirSync(root).filter((dir) => /^MOCK_0\d$/.test(dir)).sort().map((dir) => {
    const file = readdirSync(join(root, dir, "server_only")).find((name) => name.endsWith("Canonical_Teacher_Master.json"))!;
    return { mock: Number(dir.slice(-2)), master: JSON.parse(readFileSync(join(root, dir, "server_only", file), "utf8")) as Master };
  });
}

/** Parts 1–3 play in two blocks with reading time between; the break falls at the group boundary nearest
 * the middle, after the last evidence turn of the first block. Part 4 plays in one block. */
export function blocksOf(part: PartRow) {
  const first = (part.part_number - 1) * 10 + 1;
  if (part.part_number === 4) return [{ from: first, to: first + 9, turns: part.turns }];
  // One ten-question group: break after its fifth question, as real Part 1 recordings do.
  const groups = part.question_groups.length > 1 ? part.question_groups
    : [{ ...part.question_groups[0], question_ids: part.question_groups[0].question_ids.slice(0, 5) }, { ...part.question_groups[0], question_ids: part.question_groups[0].question_ids.slice(5) }];
  const sizes = groups.map((group) => group.question_ids.length);
  let best = 1, bestScore = Infinity;
  for (let cut = 1; cut < sizes.length; cut += 1) {
    const before = sizes.slice(0, cut).reduce((a, b) => a + b, 0);
    const score = Math.abs(before - 5.5);
    if (score < bestScore) [best, bestScore] = [cut, score];
  }
  const firstIds = new Set(groups.slice(0, best).flatMap((group) => group.question_ids));
  const index = (id: string) => part.turns.findIndex((turn) => turn.turn_id === id);
  const lastEvidence = Math.max(...part.questions.filter((q) => firstIds.has(q.question_id)).flatMap((q) => q.evidence_turn_ids.map(index)));
  const firstLater = Math.min(...part.questions.filter((q) => !firstIds.has(q.question_id)).flatMap((q) => q.evidence_turn_ids.map(index)));
  const split = Math.min(lastEvidence + 1, Math.max(firstLater, 1));
  const count = firstIds.size;
  return [
    { from: first, to: first + count - 1, turns: part.turns.slice(0, split) },
    { from: first + count, to: first + 9, turns: part.turns.slice(split) },
  ];
}

const numberWords = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const spoken = (n: number) => n <= 20 ? numberWords[n] : `${["", "", "twenty", "thirty", "forty"][Math.floor(n / 10)]}${n % 10 ? `-${numberWords[n % 10]}` : ""}`;

type Step = { say: string } | { pause: number } | { turn: TurnRow };
export function partPlan(mock: number, part: PartRow): Step[] {
  const kind = part.part_number === 2 || part.part_number === 4 ? "talk" : "conversation";
  const intro = cast[`${mock}-${part.part_number}`].intro;
  const steps: Step[] = [];
  if (part.part_number === 1) steps.push({ say: "In this test, you will hear four recordings, and you will answer forty questions. You will hear each recording once only. Now turn to Part 1." }, { pause: 2 });
  else steps.push({ say: `Now turn to Part ${part.part_number}.` }, { pause: 1.5 });
  const [first, second] = blocksOf(part);
  const look = part.part_number === 4 ? 45 : 30;
  steps.push({ say: `Part ${part.part_number}. You will hear ${intro}. First, you have ${look === 45 ? "forty-five" : "thirty"} seconds to look at questions ${spoken(first.from)} to ${spoken(first.to)}.` }, { pause: look },
    { say: `Now listen carefully, and answer questions ${spoken(first.from)} to ${spoken(first.to)}.` }, { pause: 1.2 });
  for (const turn of first.turns) steps.push({ turn }, { pause: 0.45 });
  steps.push({ pause: 1.6 });
  if (second) {
    steps.push({ say: `Before you hear the rest of the ${kind}, you have thirty seconds to look at questions ${spoken(second.from)} to ${spoken(second.to)}.` }, { pause: 30 },
      { say: `Now listen, and answer questions ${spoken(second.from)} to ${spoken(second.to)}.` }, { pause: 1.2 });
    for (const turn of second.turns) steps.push({ turn }, { pause: 0.45 });
    steps.push({ pause: 1.6 });
  }
  steps.push(part.part_number === 4
    ? { say: "That is the end of Part 4. That is the end of the listening test. You now have two minutes to check all of your answers." }
    : { say: `That is the end of Part ${part.part_number}. You now have thirty seconds to check your answers to Part ${part.part_number}.` },
  // The two-minute final check is left to the test timer rather than recorded as silence.
  { pause: part.part_number === 4 ? 4 : 30 });
  return steps;
}

if (args.includes("--plan")) {
  for (const { mock, master } of loadMasters(pkg)) for (const part of master.parts) {
    const words = part.turns.reduce((n, t) => n + t.text_en.split(/\s+/).length, 0);
    console.log(`${partName(mock, part.part_number)} ${words}w`, blocksOf(part).map((b) => `${b.from}-${b.to}: ${b.turns[0].turn_id}…${b.turns.at(-1)!.turn_id}`).join(" | "));
  }
}

if (args.includes("--voice")) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && provider === "gemini") throw new Error("Missing GEMINI_API_KEY");
  const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");
  mkdirSync(cacheDir, { recursive: true });
  const models = ttsModels();

  const cacheKey = (text: string, voice: string, style: string) => join(cacheDir, `${createHash("sha1").update(`${provider}|${voice}|${style}|${text}`).digest("hex").slice(0, 20)}.pcm`);
  // SAPI: every missing clip is rendered in one PowerShell run (David/Zira, rate varied per Gemini voice).
  const sapiVoice: Record<string, { name: string; rate: number }> = {
    Kore: { name: "Microsoft Zira Desktop", rate: 0 }, Aoede: { name: "Microsoft Zira Desktop", rate: -1 }, Leda: { name: "Microsoft Zira Desktop", rate: 1 }, Zephyr: { name: "Microsoft Zira Desktop", rate: -2 },
    Puck: { name: "Microsoft David Desktop", rate: 1 }, Charon: { name: "Microsoft David Desktop", rate: 0 }, Orus: { name: "Microsoft David Desktop", rate: -1 }, Iapetus: { name: "Microsoft David Desktop", rate: -2 },
  };
  function renderSapi(items: { text: string; voice: string; out: string }[]) {
    if (!items.length) return;
    const list = join(cacheDir, "sapi-batch.json");
    writeFileSync(list, JSON.stringify(items.map((item) => ({ text: item.text, out: item.out.replace(/\.pcm$/, ".wav"), ...sapiVoice[item.voice] }))));
    const script = join(cacheDir, "sapi-batch.ps1");
    writeFileSync(script, [
      "Add-Type -AssemblyName System.Speech",
      `$items = Get-Content -Raw -Encoding UTF8 '${list}' | ConvertFrom-Json`,
      "$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
      "foreach ($item in $items) { $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice($item.name); $s.Rate = [int]$item.rate; $s.SetOutputToWaveFile($item.out, $format); $s.Speak($item.text); $s.Dispose() }",
    ].join("\n"));
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: "inherit" });
    for (const item of items) {
      const wav = item.out.replace(/\.pcm$/, ".wav");
      writeFileSync(item.out, pcmFromAudio(new Uint8Array(readFileSync(wav))));
    }
  }

  async function speak(text: string, voice: string, style: string) {
    const key = cacheKey(text, voice, style);
    if (existsSync(key)) return new Uint8Array(readFileSync(key));
    if (provider === "sapi") { renderSapi([{ text, voice, out: key }]); return new Uint8Array(readFileSync(key)); }
    let lastError = "";
    for (let attempt = 0; attempt < 7; attempt += 1) {
      for (const model of models) {
        const body = ttsRequestBody([{ speaker: "S", text }], { S: voice }, style, model);
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST", headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch((error: Error) => { lastError = `network: ${error.message}`; return null; });
        if (!response) continue;
        const payload = await response.json().catch(() => null) as { steps?: { content?: { type?: string; data?: string }[] }[]; error?: { message?: string } } | null;
        const data = (payload?.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "audio" && item.data).pop()?.data;
        if (response.ok && data) {
          const pcm = pcmFromAudio(Uint8Array.from(Buffer.from(data, "base64")));
          // A clip far shorter than its text would take to say is a truncated render; retry it.
          const seconds = pcm.byteLength / 2 / TTS_SAMPLE_RATE;
          if (seconds < text.split(/\s+/).length / 5.5) { lastError = `short clip ${seconds.toFixed(1)}s`; continue; }
          writeFileSync(key, pcm);
          return pcm;
        }
        lastError = payload?.error?.message ?? `HTTP ${response.status}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 8000 * (attempt + 1)));
    }
    throw new Error(`TTS failed: ${lastError} — "${text.slice(0, 50)}"`);
  }
  const narratorStyle = "a calm, neutral British English exam narrator, clear and unhurried";
  /** Trims leading and trailing near-silence so the scripted pauses set the rhythm. */
  function trim(pcm: Uint8Array) {
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    let start = 0, end = samples.length;
    while (start < end && Math.abs(samples[start]) < 300) start += 1;
    while (end > start && Math.abs(samples[end - 1]) < 300) end -= 1;
    const pad = Math.round(0.06 * TTS_SAMPLE_RATE);
    return pcm.subarray(Math.max(0, start - pad) * 2, Math.min(samples.length, end + pad) * 2);
  }
  function mp3(parts: Uint8Array[]) {
    const pcm = Buffer.concat(parts);
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
  const turnStyle = (accent: string) => `${accent} English accent; natural and conversational, at the steady pace of an IELTS listening recording`;
  const jobs: (() => Promise<void>)[] = [];
  for (const { mock, master } of loadMasters(pkg)) {
    for (const part of master.parts) {
      const name = partName(mock, part.part_number);
      if (only && !only.includes(name)) continue;
      const target = join(audioDir, `${name}.mp3`);
      if (existsSync(target)) continue;
      jobs.push(async () => {
        const config = cast[`${mock}-${part.part_number}`];
        const accentOf = Object.fromEntries(part.speakers.map((s) => [s.speaker_id, accents[s.accent_requested] ?? "British"]));
        const pcm: Uint8Array[] = [];
        let samples = 0;
        const timings: { turn: string; startMs: number; endMs: number }[] = [];
        const push = (chunk: Uint8Array) => { pcm.push(chunk); samples += chunk.byteLength / 2; };
        const ms = () => Math.round((samples / TTS_SAMPLE_RATE) * 1000);
        for (const step of partPlan(mock, part)) {
          if ("pause" in step) push(silence(step.pause));
          else if ("say" in step) push(trim(await speak(step.say, "Iapetus", narratorStyle)));
          else {
            const voice = config.voices[step.turn.speaker_id];
            const style = turnStyle(accentOf[step.turn.speaker_id]);
            const clip = trim(await speak(step.turn.text_en, voice, style));
            const startMs = ms();
            push(clip);
            timings.push({ turn: step.turn.turn_id, startMs, endMs: ms() });
          }
        }
        writeFileSync(target, mp3(pcm));
        writeFileSync(join(audioDir, `${name}.timings.json`), JSON.stringify({ part: name, durationMs: ms(), turns: timings }, null, 1));
        console.log(`${name}: ${(ms() / 60000).toFixed(1)} min, ${timings.length} turns`);
      });
    }
  }
  if (provider === "sapi") {
    const pending = new Map<string, { text: string; voice: string; out: string }>();
    for (const { mock, master } of loadMasters(pkg)) for (const part of master.parts) {
      const name = partName(mock, part.part_number);
      if ((only && !only.includes(name)) || existsSync(join(audioDir, `${name}.mp3`))) continue;
      const accentOf = Object.fromEntries(part.speakers.map((s) => [s.speaker_id, accents[s.accent_requested] ?? "British"]));
      for (const step of partPlan(mock, part)) {
        const [text, voice, style] = "say" in step ? [step.say, "Iapetus", narratorStyle] : "turn" in step ? [step.turn.text_en, cast[`${mock}-${part.part_number}`].voices[step.turn.speaker_id], turnStyle(accentOf[step.turn.speaker_id])] : [];
        if (!text) continue;
        const out = cacheKey(text, voice!, style!);
        if (!existsSync(out)) pending.set(out, { text, voice: voice!, out });
      }
    }
    console.log(`SAPI placeholder: rendering ${pending.size} clips`);
    renderSapi([...pending.values()]);
  }
  // A few parts at once; each part's turns stay in order.
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await job(); } catch (error) { console.error((error as Error).message); }
    }
  }));
}
