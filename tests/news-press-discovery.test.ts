import { expect, it } from "vitest";
import { findIndependentDossier } from "../src/lib/news/press-discovery";
import { pressDiscoveryFeedUrls, rssProvider, type NewsItem, type NewsSource } from "../src/lib/news/providers";

const source: NewsSource = {
  id: "11111111-1111-4111-8111-111111111111", name: "Tuoi Tre News", provider: "rss", feed_url: "https://news.tuoitre.vn/rss",
  category: "Science", policy_status: "METADATA_ONLY", reviewed_basis: "RSS title discovery only",
  attribution_text: "", auto_publish: false, enabled: true, etag: null, last_modified: null,
  min_interval_minutes: 60, archive_next_page: null,
};

it("press feeds return only event metadata even when RSS contains full prose and an image", async () => {
  expect(pressDiscoveryFeedUrls.has(source.feed_url!)).toBe(true);
  const xml = `<rss><channel><item><title>Science mission brings new findings to Vietnam</title><link>https://news.tuoitre.vn/science-mission-123456.html</link><pubDate>Sun, 08 Nov 2026 08:00:00 GMT</pubDate><description>Publisher's description.</description><content:encoded><![CDATA[<p>Publisher's full prose.</p><img src="https://news.tuoitre.vn/photo.jpg">]]></content:encoded></item></channel></rss>`;
  const result = await rssProvider.fetch(source, (async () => new Response(xml)) as typeof fetch);
  expect(result.items).toHaveLength(1);
  expect(result).not.toHaveProperty("summaries");
  expect(result).not.toHaveProperty("bodies");
  expect(result).not.toHaveProperty("images");
  expect(result.items[0].publication_status).toBe("review");
});

it("searches independent sources from the event title without sending press prose or URL", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const item = { title: "Science mission brings new findings to Vietnam", canonical_url: "https://news.tuoitre.vn/science-mission-123456.html", category: "Science" } as NewsItem;
  let payload: Record<string, unknown> = {};
  const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body));
    const facts = Array.from({ length: 8 }, (_, index) => ({ claim: `NASA announced verified mission fact number ${index + 1} on its official website.`, source_url: "https://www.nasa.gov/news-release/mission/" }));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "An independent look at a scientific mission", facts }) }] } }] });
  }) as typeof fetch;
  try {
    expect((await findIndependentDossier(item, fetcher)).success).toBe(true);
    const request = JSON.stringify(payload);
    expect(request).toContain("googleSearch");
    expect(request).toContain(item.title);
    expect(request).not.toContain(item.canonical_url);
    expect(request).not.toContain("Publisher's full prose");
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
