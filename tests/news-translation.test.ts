import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Daily News bilingual translation", () => {
  it("keeps English paragraphs aligned with browser translations", async () => {
    const create = vi.fn(async () => ({ translate: async (text: string) => `VI: ${text}` }));
    vi.stubGlobal("window", { Translator: { create } });
    const { translateEnglishToVietnamese } = await import("../src/lib/news/browser-translation");
    const progress: number[] = [];
    expect(await translateEnglishToVietnamese(["First paragraph", "Second paragraph"], (done) => progress.push(done))).toEqual(["VI: First paragraph", "VI: Second paragraph"]);
    expect(progress).toEqual([1, 2]);
    expect(create).toHaveBeenCalledWith({ sourceLanguage: "en", targetLanguage: "vi" });
  });

  it("reports when browser translation and the configured fallback are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Cần cấu hình dịch vụ dịch cho thiết bị này." }), { status: 503 })));
    const { translateEnglishToVietnamese } = await import("../src/lib/news/browser-translation");
    await expect(translateEnglishToVietnamese(["One sentence"])).rejects.toThrow("Cần cấu hình");
  });
});
