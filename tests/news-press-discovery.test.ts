import { expect, it } from "vitest";
import { discoveryBudget, eligibleDiscoveryLead, findIndependentDossier, rankDiscoveryCandidates, resolveFactualSourceUrl } from "../src/lib/news/press-discovery";
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
  expect(discoveryBudget(0, 24, 8)).toBe(true);
  expect(discoveryBudget(0, 32, 8)).toBe(false);
  expect(discoveryBudget(4, 0, 4)).toBe(false);
  expect(discoveryBudget(0, 0, 0)).toBe(false);
});

it("rotates research away from a category whose recent leads failed", () => {
  const lead = (hash: string, category: NewsItem["category"], hour: number) => ({
    item: { canonical_hash: hash, canonical_url: `https://baochinhphu.vn/${hash}.htm`, category, published_at: `2026-11-10T${String(hour).padStart(2, "0")}:00:00Z` } as NewsItem,
    source,
  });
  const ranked = rankDiscoveryCandidates([
    lead("business-skipped", "Business", 4), lead("business-next", "Business", 3),
    lead("education-next", "Education", 2),
  ], new Map(), new Set(["business-skipped"]));
  expect(ranked.find(({ item }) => item.canonical_hash !== "business-skipped")?.item.canonical_hash).toBe("education-next");
});

it("considers the last three days of leads without admitting older or future stories", () => {
  const now = Date.parse("2026-11-10T06:00:00Z");
  const lead = (hoursAgo: number) => ({ sensitive: false, published_at: new Date(now - hoursAgo * 3600000).toISOString() });
  expect(eligibleDiscoveryLead(lead(70), now)).toBe(true);
  expect(eligibleDiscoveryLead(lead(73), now)).toBe(false);
  expect(eligibleDiscoveryLead(lead(-2), now)).toBe(false);
  expect(eligibleDiscoveryLead({ ...lead(1), sensitive: true }, now)).toBe(false);
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

it("classifies varied ministry leads before fact research without copying feed content", async () => {
  const official = { ...source, name: "Vietnam Ministry of Science and Technology", feed_url: "https://mst.gov.vn/rss/tin-tuc-su-kien.rss", category: "Science" as const };
  const titles = [
    ["VNeID cho phép tích hợp giấy khai sinh và giấy tờ hộ tịch số", "Technology"],
    ["Lan tỏa giá trị văn hóa Việt và khát vọng đổi mới sáng tạo", "Culture"],
    ["Doanh nghiệp nhỏ thực hành AI để nâng cao hiệu quả kinh doanh", "Business"],
    ["Công bố chương trình đào tạo sinh viên mới", "Education"],
    ["Nghiên cứu công nghệ sản xuất vắc xin", "Health"],
    ["Công bố kết quả nghiên cứu vật liệu mới", "Science"],
  ] as const;
  const xml = `<rss><channel>${titles.map(([title], index) => `<item><title>${title}</title><link>https://mst.gov.vn/example-${index}.htm</link><pubDate>Tue, 10 Nov 2026 09:00:00 +0700</pubDate><description>Source prose that must stay out of the fact writer.</description></item>`).join("")}</channel></rss>`;
  const result = await rssProvider.fetch(official, (async () => new Response(xml)) as typeof fetch);
  expect(result.items.map((item) => item.category)).toEqual(titles.map(([, category]) => category));
  expect(result).not.toHaveProperty("summaries");
  expect(result).not.toHaveProperty("bodies");
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

it("keeps Government News feeds as discovery leads in distinct learning categories", async () => {
  for (const [feed_url, category] of [
    ["https://baochinhphu.vn/giao-duc.rss", "Education"],
    ["https://baochinhphu.vn/y-te.rss", "Health"],
    ["https://baochinhphu.vn/kinh-te.rss", "Business"],
    ["https://baochinhphu.vn/van-hoa.rss", "Culture"],
  ] as const) {
    expect(pressDiscoveryFeedUrls.has(feed_url)).toBe(true);
    const xml = `<rss><channel><item><title>Vietnam announces a new public programme</title><link>https://baochinhphu.vn/example-123.htm</link><pubDate>11/10/2026 9:00:00 AM</pubDate><description>Protected publisher wording.</description><enclosure url="https://baochinhphu.vn/photo.jpg" /></item></channel></rss>`;
    const result = await rssProvider.fetch({ ...source, feed_url, category }, (async () => new Response(xml)) as typeof fetch);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].category).toBe(category);
    expect(result.items[0].published_at).toBe("2026-11-10T02:00:00.000Z");
    expect(result.items[0].publication_status).toBe("review");
    expect(result).not.toHaveProperty("summaries");
    expect(result).not.toHaveProperty("images");
  }
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
