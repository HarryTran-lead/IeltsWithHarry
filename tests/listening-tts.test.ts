import { describe, expect, it } from "vitest";
import { chunkTurns, NARRATOR, parseTranscript, pcmFromAudio, silence, speakersOf, synthesizeTranscript, ttsRequestBody, wavFromPcm, wavSeconds } from "../src/lib/listening-tts";

describe("listening transcript to speech", () => {
  it("reads speaker turns and keeps untagged lines with the previous speaker", () => {
    const turns = parseTranscript("Officer: Good afternoon.\nStudent: Hi, I need a room.\nIt's for next month.\n\nOfficer: Sure.");
    expect(turns).toEqual([
      { speaker: "Officer", text: "Good afternoon." },
      { speaker: "Student", text: "Hi, I need a room. It's for next month." },
      { speaker: "Officer", text: "Sure." },
    ]);
    expect(parseTranscript("Hi, I am Lily. I read stories.")).toEqual([{ speaker: NARRATOR, text: "Hi, I am Lily. I read stories." }]);
  });

  it("never sends more than two speakers in one request", () => {
    const turns = parseTranscript("A: one\nB: two\nA: three\nC: four\nB: five");
    const chunks = chunkTurns(turns);
    expect(chunks.map((chunk) => chunk.map((turn) => turn.speaker))).toEqual([["A", "B", "A"], ["C", "B"]]);
    for (const chunk of chunks) expect(speakersOf(chunk).length).toBeLessThanOrEqual(2);
  });

  it("builds single- and multi-speaker request bodies", () => {
    const single = ttsRequestBody([{ speaker: NARRATOR, text: "Hello." }], { [NARRATOR]: "Charon" }, "calm", "m");
    expect(single.generation_config.speech_config).toEqual([{ voice: "Charon" }]);
    const multi = ttsRequestBody(parseTranscript("Ann: Hi.\nBen: Hello."), { Ann: "Kore", Ben: "not-a-voice" }, "calm", "m");
    expect(multi.generation_config.speech_config).toEqual({ speakers: [{ speaker: "Ann", voice: "Kore" }, { speaker: "Ben", voice: "Kore" }] });
    expect(multi.input[0].content[1].annotations[0]).toMatchObject({ type: "speech_metadata", speaker: "Ben" });
  });

  it("round-trips PCM through a WAV header", () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const wav = wavFromPcm([pcm]);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(Array.from(pcmFromAudio(wav))).toEqual(Array.from(pcm));
    expect(wavSeconds(wavFromPcm([silence(1)]))).toBe(1);
  });

  it("joins chunks, adds a pause and falls back to the next model", async () => {
    const calls: string[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body.model);
      if (body.model === "broken") return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
      const audio = Buffer.from(wavFromPcm([new Uint8Array(4800)])).toString("base64");
      return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "audio", data: audio }] }] }), { status: 200 });
    }) as typeof fetch;
    const result = await synthesizeTranscript("A: one\nB: two\nC: three", { voices: {}, apiKey: "k", models: ["broken", "ok"], fetcher });
    expect(result.requests).toBe(2);
    expect(calls).toEqual(["broken", "ok", "broken", "ok"]);
    expect(result.wav.byteLength).toBe(44 + 4800 * 2 + silence().byteLength);
  });

  it("reports the last error when every model fails", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 })) as unknown as typeof fetch;
    await expect(synthesizeTranscript("Hello.", { voices: {}, apiKey: "k", models: ["a"], fetcher })).rejects.toThrow("quota exceeded");
  });
});
