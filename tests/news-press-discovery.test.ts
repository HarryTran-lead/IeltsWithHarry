import { expect, it } from "vitest";
import { discoveryBudget, findIndependentDossier, resolveFactualSourceUrl } from "../src/lib/news/press-discovery";
import { pressDiscoveryFeedUrls, rssProvider, type NewsItem, type NewsSource } from "../src/lib/news/providers";

const source: NewsSource = {
  id: "11111111-1111-4111-8111-111111111111", name: "Tuoi Tre News", provider: "rss", feed_url: "https://news.tuoitre.vn/rss",
  category: "Science", policy_status: "METADATA_ONLY", reviewed_basis: "RSS title discovery only",
  attribution_text: "", auto_publish: false, enabled: true, etag: null, last_modified: null,
  min_interval_minutes: 60, archive_next_page: null,
};

it("keeps researching after thin topics while capping attempts and completed drafts", () => {
  expect(discoveryBudget(0, 4, 4)).toBe(true);
  expect(discoveryBudget(0, 16, 4)).toBe(false);
  expect(discoveryBudget(4, 0, 4)).toBe(false);
  expect(discoveryBudget(0, 0, 0)).toBe(false);
});

it("resolves Google grounding citations only when they lead to an approved original source", async () => {
  const google = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example";
  const redirect = (target: string) => (async () => new Response(null, { status: 302, headers: { location: target } })) as typeof fetch;
  expect(await resolveFactualSourceUrl(google, redirect("https://chinhphu.vn/official-announcement"))).toBe("https://chinhphu.vn/official-announcement");
  expect(await resolveFactualSourceUrl(google, redirect("https://e.vnexpress.net/news/story"))).toBeNull();
  expect(await resolveFactualSourceUrl("https://vertexaisearch.cloud.google.com.evil.example/grounding-api-redirect/example", redirect("https://chinhphu.vn/story"))).toBeNull();
});

it("reads an official Vietnamese feed page directly and extracts only its factual notes", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const page = "https://mst.gov.vn/official-news.htm";
  let searchCalls = 0;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === page) return new Response(`<main>${"Ministry source detail about an official announcement. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    if (String(init?.body).includes("googleSearch")) searchCalls++;
    const facts = Array.from({ length: 8 }, (_, index) => ({ claim: `The official source establishes factual detail number ${index + 1} about the announcement.`, source_url: page }));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "A scientific development in Vietnam", facts }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await findIndependentDossier({ title: "Tin khoa học mới ở Việt Nam", canonical_url: page, category: "Science" } as NewsItem, fetcher);
    expect(result.success).toBe(true);
    expect(searchCalls).toBe(0);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("filters newspaper citations from grounded facts before validating the dossier", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const official = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/official";
  const newspaper = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/newspaper";
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === official) return new Response(null, { status: 302, headers: { location: "https://chinhphu.vn/announcement" } });
    if (String(url) === newspaper) return new Response(null, { status: 302, headers: { location: "https://e.vnexpress.net/story" } });
    if (String(url) === "https://chinhphu.vn/announcement") return new Response(`<main>${"Independent official detail. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    if (String(init?.body).includes("googleSearch")) return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ source_urls: [official, newspaper] }) }] } }] });
    const facts = Array.from({ length: 8 }, (_, index) => ({ claim: `An official announcement provides independent factual detail number ${index + 1}.`, source_url: "https://chinhphu.vn/announcement" }));
    facts.push({ claim: "A newspaper gives an extra detail that must be discarded.", source_url: newspaper });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "A verified account of a public announcement", facts }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await findIndependentDossier({ title: "Public announcement prompts new discussion", category: "World News" } as NewsItem, fetcher);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.facts.every((fact) => fact.source_url === "https://chinhphu.vn/announcement")).toBe(true);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

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
  let searchPayload: Record<string, unknown> = {};
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "https://www.nasa.gov/news-release/mission/") return new Response(`<main>${"NASA mission details on its official site. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    const payload = JSON.parse(String(init?.body));
    if (payload.tools) {
      searchPayload = payload;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ source_urls: ["https://www.nasa.gov/news-release/mission/"] }) }] } }] });
    }
    const facts = Array.from({ length: 8 }, (_, index) => ({ claim: `NASA announced verified mission fact number ${index + 1} on its official website.`, source_url: "https://www.nasa.gov/news-release/mission/" }));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "An independent look at a scientific mission", facts }) }] } }] });
  }) as typeof fetch;
  try {
    expect((await findIndependentDossier(item, fetcher)).success).toBe(true);
    const request = JSON.stringify(searchPayload);
    expect(request).toContain("googleSearch");
    expect(request).toContain(item.title);
    expect(request).not.toContain(item.canonical_url);
    expect(request).not.toContain("Publisher's full prose");
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
