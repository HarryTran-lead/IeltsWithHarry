import { describe, expect, it, vi } from "vitest";
import { lookupNewsWord, pickNewsWordMeaning } from "../src/lib/news/word-lookup";

describe("news dictionary lookup", () => {
  it("prefers a Vietnamese dictionary sense over an English-only sense", () => {
    const value = pickNewsWordMeaning("event", { ipa: "/ɪˈvent/", meanings: [
      { pos: "noun", definition: "something that happens" },
      { pos: "noun", definition: "an occasion", meaningVi: "sự kiện" },
    ] });
    expect(value).toMatchObject({ word: "event", phonetic: "/ɪˈvent/", definition: "an occasion", meaningVi: "sự kiện" });
    expect(value.alternatives).toEqual(["sự kiện"]);
  });

  it("uses the signed-in vocabulary endpoint", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ meanings: [{ definition: "an occasion", meaningVi: "sự kiện" }] }) })) as unknown as typeof fetch;
    expect((await lookupNewsWord("event", fetcher)).meaningVi).toBe("sự kiện");
    expect(fetcher).toHaveBeenCalledWith("/api/vocabulary/lookup?word=event", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
