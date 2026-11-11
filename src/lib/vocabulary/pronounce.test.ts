import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPronunciation, pronounce } from "./pronounce";

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
const speak = vi.fn();
const cancel = vi.fn();
const sources: string[] = [];

beforeEach(() => {
  play.mockClear(); pause.mockClear(); speak.mockClear(); cancel.mockClear();
  sources.length = 0;
  vi.stubGlobal("window", { speechSynthesis: { getVoices: () => [], cancel, speak } });
  vi.stubGlobal("Audio", class {
    constructor(public src: string) { sources.push(src); }
    play = play;
    pause = pause;
  });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(public text: string) {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("vocabulary pronunciation", () => {
  it("plays the verified Commons recording for a.m. synchronously on tap", () => {
    pronounce("a.m.");

    expect(sources[0]).toContain("En-us-a.m..ogg.mp3");
    expect(play).toHaveBeenCalledOnce();
    expect(speak).not.toHaveBeenCalled();
  });

  it("accepts dotted dictionary headwords", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [{ phonetics: [] }] }));
    vi.stubGlobal("fetch", fetch);
    await lookupPronunciation("p.m.");
    expect(fetch).toHaveBeenCalledWith("https://api.dictionaryapi.dev/api/v2/entries/en/p.m.");
  });

  it("speaks immediately while the recording lookup is still pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    pronounce("unfamiliar");
    expect(speak).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
  });

  it("spells an abbreviation when there is no recording", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    pronounce("p.m.");
    expect(speak.mock.calls[0][0].text).toBe("P M");
  });

  it("uses the device voice immediately on the next tap if the media URL fails", async () => {
    play.mockRejectedValueOnce(new Error("media unavailable"));
    pronounce("a.m.");
    await Promise.resolve();
    pronounce("a.m.");
    expect(play).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledTimes(2);
  });
});
