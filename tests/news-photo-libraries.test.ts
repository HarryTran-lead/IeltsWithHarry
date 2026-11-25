import { afterEach, describe, expect, it } from "vitest";
import { pexelsCandidates, unsplashCandidates } from "../src/lib/news/enrichment";

// Mirrors the Pexels and Unsplash branches of news_auto_illustrations_library_check.
const pexelsRow = (row: { image_url: string; image_source_url: string; license_name: string; license_url: string | null; image_credit: string }) =>
  /^https:\/\/images\.pexels\.com\/photos\//.test(row.image_url) && /^https:\/\/www\.pexels\.com\/photo\//.test(row.image_source_url)
  && row.license_name === "Pexels License" && row.license_url === "https://www.pexels.com/license/" && / \/ Pexels$/.test(row.image_credit);
const unsplashRow = (row: { image_url: string; image_source_url: string; license_name: string; license_url: string | null; image_credit: string }) =>
  /^https:\/\/images\.unsplash\.com\//.test(row.image_url) && /^https:\/\/unsplash\.com\/photos\//.test(row.image_source_url)
  && row.license_name === "Unsplash License" && row.license_url === "https://unsplash.com/license" && / \/ Unsplash$/.test(row.image_credit);

afterEach(() => { delete process.env.PEXELS_API_KEY; delete process.env.UNSPLASH_ACCESS_KEY; });

describe("Pexels and Unsplash photo search", () => {
  it("is off until an API key is configured", async () => {
    let calls = 0;
    const fake = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
    expect(await pexelsCandidates("hanoi street", ["hanoi"], fake)).toEqual([]);
    expect(await unsplashCandidates("hanoi street", ["hanoi"], fake)).toEqual([]);
    expect(calls).toBe(0);
  });

  it("turns Pexels results into credited candidates the database accepts", async () => {
    process.env.PEXELS_API_KEY = "test-pexels";
    let auth = "";
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ photos: [
        { id: 1, width: 4000, height: 2600, url: "https://www.pexels.com/photo/busy-street-in-hanoi-1/", photographer: "Linh Tran", alt: "Busy street in Hanoi",
          src: { large: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&h=650&w=940", medium: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?h=350" } },
        { id: 2, width: 4000, height: 2600, url: "https://evil.example/photo/2/", photographer: "X", alt: "x", src: { large: "https://evil.example/2.jpg", medium: "https://evil.example/2s.jpg" } },
      ] }));
    }) as typeof fetch;
    const found = await pexelsCandidates("hanoi street", ["hanoi", "street"], fake);
    expect(auth).toBe("test-pexels");
    expect(found).toHaveLength(1);
    expect(found[0].value.image_credit).toBe("Linh Tran / Pexels");
    expect(found[0].score).toBeGreaterThan(20);
    expect(pexelsRow(found[0].value)).toBe(true);
  });

  it("turns Unsplash results into credited candidates and keeps the download ping", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "test-unsplash";
    let auth = "";
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ results: [
        { width: 5000, height: 3300, alt_description: "gas cylinders stacked outside a shop", user: { name: "Minh Nguyen" },
          urls: { regular: "https://images.unsplash.com/photo-123?ixid=abc&w=1080", small: "https://images.unsplash.com/photo-123?w=400" },
          links: { html: "https://unsplash.com/photos/gas-cylinders-abc?utm_source=x", download_location: "https://api.unsplash.com/photos/abc/download?ixid=abc" } },
      ] }));
    }) as typeof fetch;
    const found = await unsplashCandidates("gas cylinder", ["gas", "cylinders"], fake);
    expect(auth).toBe("Client-ID test-unsplash");
    expect(found).toHaveLength(1);
    expect(found[0].value.image_source_url).toBe("https://unsplash.com/photos/gas-cylinders-abc");
    expect(found[0].useUrl).toContain("api.unsplash.com/photos/abc/download");
    expect(unsplashRow(found[0].value)).toBe(true);
  });
});
