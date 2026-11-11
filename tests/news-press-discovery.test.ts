import { expect, it } from "vitest";
import { discoveryBatchLimit, discoveryBudget, discoveryFeedGroup, eligibleDiscoveryLead, findIndependentDossier, rankDiscoveryCandidates, resolveFactualSourceUrl, temporaryDiscoveryFailure, vietnamDayStart, youthRelevanceForTitle } from "../src/lib/news/press-discovery";
import { parseRss, pressDiscoveryFeedUrls, rssProvider, type NewsItem, type NewsSource } from "../src/lib/news/providers";

const source: NewsSource = {
  id: "11111111-1111-4111-8111-111111111111", name: "Tuoi Tre News", provider: "rss", feed_url: "https://news.tuoitre.vn/rss",
  category: "Science", policy_status: "METADATA_ONLY", reviewed_basis: "RSS title discovery only",
  attribution_text: "", auto_publish: false, enabled: true, etag: null, last_modified: null,
  min_interval_minutes: 60, archive_next_page: null,
};

it("classifies official latest-feed stories across Vietnam topics", () => {
  const latest = { ...source, name: "Government News Latest", feed_url: "https://baochinhphu.vn/home.rss", category: "World News" as const };
  const xml = `<rss><channel><item><title>Việt Nam phát triển trí tuệ nhân tạo</title><link>https://baochinhphu.vn/ai.htm</link><pubDate>11/11/2026 2:42:00 PM</pubDate></item><item><title>Sinh viên tham gia chương trình giáo dục mới</title><link>https://baochinhphu.vn/education.htm</link><pubDate>11/11/2026 2:30:00 PM</pubDate></item></channel></rss>`;
  expect(pressDiscoveryFeedUrls.has(latest.feed_url)).toBe(true);
  const stories = parseRss(xml, latest);
  expect(stories.map((story) => story.category)).toEqual(["Technology", "Education"]);
  expect(stories[0].published_at).toBe("2026-11-11T07:42:00.000Z");
});

it("keeps researching after thin topics while capping attempts and completed drafts", () => {
  expect(discoveryBudget(0, 4, 4)).toBe(true);
  expect(discoveryBudget(0, 16, 4)).toBe(false);
  expect(discoveryBudget(0, 24, 8)).toBe(true);
  expect(discoveryBudget(0, 32, 8)).toBe(false);
  expect(discoveryBudget(0, 32, 30)).toBe(true);
  expect(discoveryBudget(0, 64, 30)).toBe(true);
  expect(discoveryBudget(0, 120, 30)).toBe(false);
  expect(discoveryBudget(0, 199, 50)).toBe(true);
  expect(discoveryBudget(0, 200, 50)).toBe(false);
  expect(discoveryBudget(30, 0, 30)).toBe(false);
  expect(discoveryBudget(4, 0, 4)).toBe(false);
  expect(discoveryBudget(0, 0, 0)).toBe(false);
});

it("uses three research slots when available and alternates feed groups every 20 minutes", () => {
  expect(discoveryBatchLimit(0, 0, 50)).toBe(3);
  expect(discoveryBatchLimit(48, 0, 50)).toBe(2);
  expect(discoveryBatchLimit(49, 0, 50)).toBe(1);
  expect(discoveryBatchLimit(0, 199, 50)).toBe(1);
  expect(discoveryBatchLimit(50, 0, 50)).toBe(0);
  const first = discoveryFeedGroup(new Date("2026-11-11T04:15:00Z"));
  expect(discoveryFeedGroup(new Date("2026-11-11T04:35:00Z"))).toBe(1 - first);
  expect(discoveryFeedGroup(new Date("2026-11-11T04:55:00Z"))).toBe(first);
  expect(vietnamDayStart(new Date("2026-11-11T16:59:00Z")).toISOString()).toBe("2026-11-10T17:00:00.000Z");
  expect(vietnamDayStart(new Date("2026-11-11T17:00:00Z")).toISOString()).toBe("2026-11-11T17:00:00.000Z");
});

it("rests only incomplete AI replies for one day before retrying the lead", () => {
  expect(temporaryDiscoveryFailure("AI response was incomplete")).toBe(true);
  expect(temporaryDiscoveryFailure("AI returned no content")).toBe(true);
  expect(temporaryDiscoveryFailure("The article failed factual or originality review")).toBe(false);
  expect(temporaryDiscoveryFailure("Gemini daily free-tier quota reached")).toBe(false);
});

it("rotates research away from a category whose recent leads failed", () => {
  const lead = (hash: string, category: NewsItem["category"], hour: number) => ({
    item: { canonical_hash: hash, canonical_url: `https://baochinhphu.vn/${hash}.htm`, title: hash, category, published_at: `2026-11-10T${String(hour).padStart(2, "0")}:00:00Z` } as NewsItem,
    source,
  });
  const ranked = rankDiscoveryCandidates([
    lead("business-skipped", "Business", 4), lead("business-next", "Business", 3),
    lead("education-next", "Education", 2),
  ], new Map(), new Set(["business-skipped"]));
  expect(ranked.find(({ item }) => item.canonical_hash !== "business-skipped")?.item.canonical_hash).toBe("education-next");
});

it("favors youth-relevant leads and a source absent from today's published passages", () => {
  const lead = (hash: string, title: string, sourceName: string) => ({
    item: { canonical_hash: hash, canonical_url: `https://baochinhphu.vn/${hash}.htm`, title, category: "Culture", published_at: "2026-11-10T04:00:00Z" } as NewsItem,
    source: { ...source, name: sourceName },
  });
  expect(youthRelevanceForTitle("Sinh viên tham gia lễ hội âm nhạc", "Culture")).toBe(2);
  expect(youthRelevanceForTitle("A university festival for young people", "Education")).toBe(4);
  const ranked = rankDiscoveryCandidates([
    lead("ministry", "A traditional industry meeting", "Vietnam Ministry of Science and Technology"),
    lead("culture", "Sinh viên tham gia lễ hội âm nhạc", "Government News Culture"),
  ], new Map(), new Set(), new Map([["Vietnam Ministry of Science and Technology", 4]]));
  expect(ranked[0].item.canonical_hash).toBe("culture");
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
    const facts = Array.from({ length: 12 }, (_, index) => ({ claim: `The official source establishes factual detail number ${index + 1} about the announcement.`, source_url: page }));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "A scientific development in Vietnam", facts }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await findIndependentDossier({ title: "Tin khoa học mới ở Việt Nam", canonical_url: page, category: "Science" } as NewsItem, fetcher);
    expect(result.success).toBe(true);
    expect(searchCalls).toBe(0);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("seeks a second official page when the first page cannot support a full passage", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const first = "https://mst.gov.vn/first-announcement.htm";
  const second = "https://chinhphu.vn/related-announcement";
  let searches = 0;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if ([first, second].includes(String(url))) return new Response(`<main>${"Official detail about one event. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    const body = String(init?.body);
    if (body.includes("googleSearch")) {
      searches++;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ source_urls: [first, second] }) }] } }] });
    }
    const count = body.includes(second) ? 13 : 7;
    const facts = Array.from({ length: count }, (_, index) => ({ claim: `Official factual detail number ${index + 1} about the same event in Vietnam.`, source_url: index >= 7 ? second : first }));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "A public development in Vietnam", facts }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await findIndependentDossier({ title: "Official event in Vietnam", canonical_url: first, category: "Education" } as NewsItem, fetcher);
    expect(result.success).toBe(true);
    expect(searches).toBe(1);
    if (result.success) expect(result.data.facts).toHaveLength(13);
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
    const facts = Array.from({ length: 12 }, (_, index) => ({ claim: `An official announcement provides independent factual detail number ${index + 1}.`, source_url: "https://chinhphu.vn/announcement" }));
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

it("uses a limited report excerpt for at most three cited facts after finding an original page", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const report = "https://news.tuoitre.vn/students-event.html";
  const original = "https://chinhphu.vn/students-event";
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === original) return new Response(`<main>${"Official information about the student event. ".repeat(25)}</main>`, { headers: { "Content-Type": "text/html" } });
    if (String(url) === report) return new Response(`<article>${Array.from({ length: 9 }, (_, index) => `<p>Newspaper factual paragraph ${index + 1} about students taking part in the event on a published date.</p>`).join("")}</article>`, { headers: { "Content-Type": "text/html" } });
    if (String(init?.body).includes("googleSearch")) return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ source_urls: [original] }) }] } }] });
    const facts = Array.from({ length: 8 }, (_, index) => ({ claim: `Original announcement establishes distinct fact number ${index + 1} about the student event.`, source_url: original }));
    facts.push(...Array.from({ length: 5 }, (_, index) => ({ claim: `The press report supplies objective detail number ${index + 1} about the same student event.`, source_url: report })));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ topic: "A student event in Vietnam", facts }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await findIndependentDossier({ title: "Students gather for a new event", canonical_url: report, category: "Education" } as NewsItem, fetcher);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.facts.filter((fact) => fact.source_url === report)).toHaveLength(3);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("classifies broader English Vietnam leads into learning topics", async () => {
  const titles = ["Students receive new scholarships", "Football festival draws young fans", "Coastal pollution threatens marine life", "Robots help local shops"];
  const xml = `<rss><channel>${titles.map((title, index) => `<item><title>${title}</title><link>https://news.tuoitre.vn/story-${index}.html</link><pubDate>Tue, 10 Nov 2026 09:00:00 +0700</pubDate></item>`).join("")}</channel></rss>`;
  const result = await rssProvider.fetch(source, (async () => new Response(xml)) as typeof fetch);
  expect(result.items.map((item) => item.category)).toEqual(["Education", "Culture", "Environment", "Technology"]);
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
    const facts = Array.from({ length: 12 }, (_, index) => ({ claim: `NASA announced verified mission fact number ${index + 1} on its official website.`, source_url: "https://www.nasa.gov/news-release/mission/" }));
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
