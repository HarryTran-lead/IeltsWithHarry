import { beforeEach, describe, expect, it, vi } from "vitest";

const gemini = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/news/enrichment", () => ({ geminiJson: gemini, AiQuotaError: class AiQuotaError extends Error {} }));

import { translationCacheKey, translateWithProviders, validTranslations } from "../src/lib/news/translation-service";

beforeEach(() => gemini.mockReset());

describe("news translation providers", () => {
  it("uses stable content hashes and rejects incomplete translations", () => {
    expect(translationCacheKey(" event ")).toBe(translationCacheKey("event"));
    expect(translationCacheKey("event")).not.toBe(translationCacheKey("events"));
    expect(validTranslations(["sự kiện"], 1)).toBe(true);
    expect(validTranslations([""], 1)).toBe(false);
  });

  it("uses Cloud Translation when it succeeds", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { translations: [{ translatedText: "sự kiện" }] } }) })) as unknown as typeof fetch;
    expect(await translateWithProviders(["event"], { cloudKey: "test", geminiKeys: [], fetcher })).toEqual(["sự kiện"]);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when the first provider fails", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    gemini.mockResolvedValue({ data: { translations: ["sự kiện"] } });
    const failures: string[] = [];
    expect(await translateWithProviders(["event"], { cloudKey: "test", geminiKeys: [{ name: "backup", key: "test-2" }], fetcher,
      onFailure: (failure) => failures.push(`${failure.provider}:${failure.status}`) })).toEqual(["sự kiện"]);
    expect(failures).toEqual(["cloud-translate:503"]);
  });

  it("tries another key when a Gemini project rejects translation with HTTP 402", async () => {
    gemini.mockRejectedValueOnce(new Error("AI service returned HTTP 402"))
      .mockResolvedValueOnce({ data: { translations: ["sự kiện"] } });
    const failures: string[] = [];
    expect(await translateWithProviders(["event"], { geminiKeys: [{ name: "first", key: "key-1" }, { name: "backup", key: "key-2" }],
      onFailure: (failure) => failures.push(`${failure.provider}:${failure.status}`) })).toEqual(["sự kiện"]);
    expect(failures).toEqual(["first:402"]);
  });
  it("uses Gemini to select a word meaning from its sentence", async () => {
    gemini.mockResolvedValue({ data: { translations: ["sự kiện"] } });
    await translateWithProviders(["event"], { cloudKey: "test", geminiKeys: [{ name: "gemini", key: "test-key" }],
      wordContext: "The event begins tomorrow.", fetcher: vi.fn() as unknown as typeof fetch });
    expect(gemini).toHaveBeenCalledWith(expect.stringContaining("short Vietnamese meaning"),
      expect.stringContaining("The event begins tomorrow."), expect.anything(), expect.anything());
  });
});
