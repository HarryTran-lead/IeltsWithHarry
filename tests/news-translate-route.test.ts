import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  viewerRpc: vi.fn(), adminRpc: vi.fn(), provider: vi.fn(), cacheRead: vi.fn(), cacheWrite: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } } }) },
  rpc: state.viewerRpc,
}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  from: () => ({ select: () => ({ in: state.cacheRead }), upsert: state.cacheWrite }), rpc: state.adminRpc,
}) }));
vi.mock("../src/lib/news/translation-service", async (original) => ({
  ...await original<typeof import("../src/lib/news/translation-service")>(), translateWithProviders: state.provider,
}));

import { POST } from "../src/app/api/news/translate/route";
import { translationCacheKey } from "../src/lib/news/translation-service";

function request(texts: string[], wordContext?: string) {
  return new Request("https://example.com/api/news/translate", { method: "POST", body: JSON.stringify({ texts, wordContext }) }) as NextRequest;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  state.viewerRpc.mockReset().mockResolvedValue({ data: true, error: null });
  state.adminRpc.mockReset().mockResolvedValue({ error: null });
  state.provider.mockReset().mockResolvedValue(["sự kiện"]);
  state.cacheRead.mockReset().mockResolvedValue({ data: [], error: null });
  state.cacheWrite.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("news translation route", () => {
  it("returns a shared cached translation without consuming quota", async () => {
    state.cacheRead.mockResolvedValue({ data: [{ cache_key: translationCacheKey("event"), translation: "sự kiện" }], error: null });
    const response = await POST(request(["event"]));
    expect(await response.json()).toEqual({ translations: ["sự kiện"] });
    expect(state.viewerRpc).not.toHaveBeenCalled();
    expect(state.provider).not.toHaveBeenCalled();
  });

  it("refunds the exact claimed characters when every provider fails", async () => {
    state.provider.mockRejectedValue(new Error("AI service returned HTTP 503"));
    const response = await POST(request(["event"]));
    expect(response.status).toBe(502);
    expect(state.viewerRpc).toHaveBeenCalledWith("news_claim_translation_quota", { p_characters: 5 });
    expect(state.adminRpc).toHaveBeenCalledWith("news_refund_translation_quota", {
      p_user_id: "00000000-0000-4000-8000-000000000001", p_characters: 5,
    });
  });

  it("stores successful translations for reuse", async () => {
    const response = await POST(request(["event", "event"]));
    expect(await response.json()).toEqual({ translations: ["sự kiện", "sự kiện"] });
    expect(state.viewerRpc).toHaveBeenCalledWith("news_claim_translation_quota", { p_characters: 5 });
    expect(state.cacheWrite).toHaveBeenCalledWith([{ cache_key: translationCacheKey("event"), translation: "sự kiện" }], { onConflict: "cache_key" });
    expect(state.adminRpc).not.toHaveBeenCalled();
  });

  it("uses the confirmed article key instead of the shared key returning 402 in production", async () => {
    vi.stubEnv("NEWS_ARTICLE_FREE_TIER_CONFIRMED", "true");
    vi.stubEnv("NEWS_ARTICLE_GEMINI_API_KEY", "article-key");
    await POST(request(["event"]));
    expect(state.provider).toHaveBeenCalledWith(["event"], expect.objectContaining({ geminiKeys: [
      { name: "article-gemini", key: "article-key" },
    ] }));
  });
  it("uses the surrounding sentence to translate an ambiguous word", async () => {
    await POST(request(["event"], "The event begins tomorrow."));
    expect(state.provider).toHaveBeenCalledWith(["event"], expect.objectContaining({ wordContext: "The event begins tomorrow." }));
    expect(state.viewerRpc).toHaveBeenCalledWith("news_claim_translation_quota", { p_characters: 31 });
  });
});
