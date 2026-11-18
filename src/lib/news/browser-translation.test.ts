import { afterEach, describe, expect, it, vi } from "vitest";
import { translateEnglishToVietnamese } from "./browser-translation";

afterEach(() => vi.unstubAllGlobals());

describe("news translation fallback", () => {
  it("batches paragraphs and keeps translations aligned with their source", async () => {
    const requests: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const texts = (JSON.parse(String(init.body)) as { texts: string[] }).texts;
      requests.push(texts);
      return { ok: true, json: async () => ({ translations: texts.map((text) => `VI:${text}`) }) };
    }));
    const progress: number[] = [];
    const translated: [number, string][] = [];
    const result = await translateEnglishToVietnamese(["First paragraph.", "Second paragraph.", ""], (done) => progress.push(done), (index, value) => translated.push([index, value]));
    expect(requests).toEqual([["First paragraph.", "Second paragraph."]]);
    expect(result).toEqual(["VI:First paragraph.", "VI:Second paragraph.", ""]);
    expect(progress.at(-1)).toBe(3);
    expect(translated).toContainEqual([1, "VI:Second paragraph."]);
  });
});
