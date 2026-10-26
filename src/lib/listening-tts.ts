/*
 * Turns a Listening transcript into Gemini text-to-speech requests and joins the
 * returned audio into one WAV file. Transcript lines written as "Name: words"
 * become separate speakers; anything else is read by a single narrator.
 */

export const TTS_SAMPLE_RATE = 24000;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // lesson-media bucket limit
const MAX_CHUNK_CHARS = 3500;
const PAUSE_SECONDS = 0.4;

export const ttsVoices = [
  { id: "Kore", label: "Kore · nữ, chắc giọng" },
  { id: "Puck", label: "Puck · nam, vui vẻ" },
  { id: "Aoede", label: "Aoede · nữ, nhẹ nhàng" },
  { id: "Charon", label: "Charon · nam, rõ ràng" },
  { id: "Leda", label: "Leda · nữ, trẻ trung" },
  { id: "Orus", label: "Orus · nam, chắc giọng" },
  { id: "Zephyr", label: "Zephyr · nữ, tươi sáng" },
  { id: "Iapetus", label: "Iapetus · nam, mạch lạc" },
] as const;
export type TtsVoice = (typeof ttsVoices)[number]["id"];
const voiceIds = new Set<string>(ttsVoices.map((voice) => voice.id));
export const NARRATOR = "Narrator";
export const defaultStyle = "clear and natural, at the steady pace of an IELTS listening recording";

export type Turn = { speaker: string; text: string };

const speakerLine = /^([A-Z][\w .'-]{0,30}):\s+(.+)$/;

/** Splits a transcript into speaker turns; untagged text belongs to the narrator. */
export function parseTranscript(transcript: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of transcript.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(speakerLine);
    if (match) turns.push({ speaker: match[1].trim(), text: match[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += ` ${line}`;
    else turns.push({ speaker: NARRATOR, text: line });
  }
  return turns;
}

export function speakersOf(turns: Turn[]) {
  return [...new Set(turns.map((turn) => turn.speaker))];
}

/** Default voices: alternate female and male voices in order of appearance. */
export function defaultVoices(speakers: string[]): Record<string, TtsVoice> {
  const order: TtsVoice[] = ["Kore", "Puck", "Aoede", "Charon", "Leda", "Orus"];
  return Object.fromEntries(speakers.map((speaker, index) => [speaker, order[index % order.length]]));
}

/** Gemini accepts at most two speakers per request, so group consecutive turns into chunks. */
export function chunkTurns(turns: Turn[], maxChars = MAX_CHUNK_CHARS): Turn[][] {
  const chunks: Turn[][] = [];
  let current: Turn[] = [];
  let chars = 0;
  for (const turn of turns) {
    const speakers = new Set([...current.map((item) => item.speaker), turn.speaker]);
    if (current.length && (speakers.size > 2 || chars + turn.text.length > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(turn);
    chars += turn.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Request body for the Gemini Interactions API (unary audio response). */
export function ttsRequestBody(chunk: Turn[], voices: Record<string, string>, style: string, model: string) {
  const speakers = speakersOf(chunk);
  const voiceFor = (speaker: string) => (voiceIds.has(voices[speaker]) ? voices[speaker] : "Kore");
  const multi = speakers.length > 1;
  return {
    model,
    input: [{
      type: "user_input",
      content: chunk.map((turn) => ({
        type: "text",
        text: turn.text,
        annotations: [{ type: "speech_metadata", ...(multi ? { speaker: turn.speaker } : {}), style }],
      })),
    }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: multi
        ? { speakers: speakers.map((speaker) => ({ speaker, voice: voiceFor(speaker) })) }
        : [{ voice: voiceFor(speakers[0]) }],
    },
  };
}

/** Returns raw 16-bit PCM from a WAV file, or the buffer unchanged if it has no RIFF header. */
export function pcmFromAudio(audio: Uint8Array): Uint8Array {
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const tag = (offset: number) => String.fromCharCode(...audio.subarray(offset, offset + 4));
  if (audio.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return audio;
  let offset = 12;
  while (offset + 8 <= audio.byteLength) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === "data") return audio.subarray(offset + 8, Math.min(audio.byteLength, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV audio has no data chunk");
}

export function silence(seconds = PAUSE_SECONDS, sampleRate = TTS_SAMPLE_RATE) {
  return new Uint8Array(Math.round(seconds * sampleRate) * 2);
}

/** Wraps mono 16-bit PCM in a WAV header. */
export function wavFromPcm(parts: Uint8Array[], sampleRate = TTS_SAMPLE_RATE): Uint8Array {
  const dataLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const wav = new Uint8Array(44 + dataLength);
  const view = new DataView(wav.buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i); };
  write(0, "RIFF"); view.setUint32(4, 36 + dataLength, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, dataLength, true);
  let offset = 44;
  for (const part of parts) { wav.set(part, offset); offset += part.byteLength; }
  return wav;
}

export function wavSeconds(wav: Uint8Array, sampleRate = TTS_SAMPLE_RATE) {
  return Math.round(((wav.byteLength - 44) / 2 / sampleRate) * 10) / 10;
}

/** Calls Gemini for each chunk and returns one WAV file. `fetcher` is injectable for tests. */
export async function synthesizeTranscript(
  transcript: string,
  { voices, style = defaultStyle, apiKey, models, fetcher = fetch }: { voices: Record<string, string>; style?: string; apiKey: string; models: string[]; fetcher?: typeof fetch },
) {
  const chunks = chunkTurns(parseTranscript(transcript));
  if (!chunks.length) throw new Error("Transcript trống.");
  const parts: Uint8Array[] = [];
  for (const [index, chunk] of chunks.entries()) {
    let lastError = "";
    let audio: Uint8Array | null = null;
    for (const model of models) {
      const response = await fetcher("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(ttsRequestBody(chunk, voices, style, model)),
      });
      const payload = await response.json().catch(() => null) as { steps?: { content?: { type?: string; data?: string }[] }[]; error?: { message?: string } } | null;
      if (!response.ok) { lastError = payload?.error?.message ?? `Gemini trả lỗi ${response.status}`; continue; }
      const data = (payload?.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "audio" && item.data).pop()?.data;
      if (!data) { lastError = "Gemini không trả về âm thanh."; continue; }
      audio = Uint8Array.from(Buffer.from(data, "base64"));
      break;
    }
    if (!audio) throw new Error(lastError || "Không tạo được âm thanh.");
    if (index) parts.push(silence());
    parts.push(pcmFromAudio(audio));
  }
  const wav = wavFromPcm(parts);
  if (wav.byteLength > MAX_AUDIO_BYTES) throw new Error(`Âm thanh dài ${wavSeconds(wav)} giây, vượt giới hạn 10 MB. Hãy chia transcript thành bài ngắn hơn.`);
  return { wav, seconds: wavSeconds(wav), requests: chunks.length };
}

export function ttsModels() {
  const configured = (process.env.GEMINI_TTS_MODELS ?? "").split(",").map((model) => model.trim()).filter((model) => /^[\w.-]+$/.test(model));
  return configured.length ? configured.slice(0, 3) : ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
}
