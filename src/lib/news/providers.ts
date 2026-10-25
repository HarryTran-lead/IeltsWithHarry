import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { XMLParser } from "fast-xml-parser";
import { load } from "cheerio";
import { NEWS_CATEGORIES, type NewsCategory } from "./constants";

export { NEWS_CATEGORIES };
export type NewsSource = { id: string; name: string; provider: "gdelt" | "rss"; feed_url: string | null; category: NewsCategory; policy_status: string; reviewed_basis: string; attribution_text: string; auto_publish: boolean; enabled: boolean; etag: string | null; last_modified: string | null; min_interval_minutes: number; archive_next_page: number | null };
export type NewsItem = { source_id: string; provider: string; external_id: string | null; canonical_hash: string; canonical_url: string; title: string; publisher: string; language: string; category: NewsCategory; published_at: string; publication_status: "review" | "published"; attribution_text: string; sensitive: boolean; metadata: Record<string, never> };
export type NewsBodyCandidate = { canonical_hash: string; body_text: string; rights_basis: string; source_url: string; image_url: string | null; image_alt: string | null; image_credit: string | null; image_rights_basis: string | null };
export type FetchResult = { items: NewsItem[]; bodies?: NewsBodyCandidate[]; etag: string | null; lastModified: string | null; cacheUntil: string | null; notModified: boolean };
export interface NewsProvider { readonly kind: NewsSource["provider"]; fetch(source: NewsSource, fetcher?: typeof fetch, archivePage?: number): Promise<FetchResult> }

const sensitive = /\b(killed|murder|shooting|bomb|war|attack|assault|graphic|suicide|abuse)\b/i;
const cleanText = (value: unknown, max: number) => String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
export function parsePublishedDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  const normalized = /^\d{14}$/.test(raw) ? `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) || date.valueOf() > Date.now() + 86400000 ? null : date.toISOString();
}
export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname || isIP(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return null; }
}
export function newsHash(url: string): string { return createHash("sha256").update(url).digest("hex"); }
function makeItem(source: NewsSource, raw: { url: unknown; title: unknown; date: unknown; publisher?: unknown; language?: unknown; externalId?: unknown }): NewsItem | null {
  const canonical_url = canonicalUrl(String(raw.url ?? ""));
  const title = cleanText(raw.title, 400);
  const published_at = parsePublishedDate(raw.date);
  const language = cleanText(raw.language ?? "English", 30);
  if (!canonical_url || title.length < 5 || !published_at || !/^(en|english)$/i.test(language)) return null;
  const flagged = sensitive.test(title);
  return { source_id: source.id, provider: source.provider, external_id: raw.externalId ? cleanText(raw.externalId, 400) : null,
    canonical_hash: newsHash(canonical_url), canonical_url, title, publisher: cleanText(raw.publisher || source.name, 150), language: "English",
    category: source.category, published_at, publication_status: source.auto_publish && !flagged && source.reviewed_basis.length >= 12 && ["METADATA_ONLY","FULL_REUSE_ALLOWED"].includes(source.policy_status) ? "published" : "review",
    attribution_text: source.attribution_text, sensitive: flagged, metadata: {} };
}

export function normalizeGdelt(data: unknown, source: NewsSource): NewsItem[] {
  const articles = (data as { articles?: unknown })?.articles;
  if (!Array.isArray(articles)) return [];
  return articles.slice(0, 50).map((entry) => {
    const row = entry as Record<string, unknown>;
    return makeItem(source, { url: row.url, title: row.title, date: row.seendate, publisher: row.domain, language: row.language });
  }).filter((item): item is NewsItem => item !== null);
}
function xmlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return String((value as Record<string, unknown>)["#text"] ?? "");
  return "";
}
function atomLink(value: unknown): string {
  if (typeof value === "string") return value;
  const links = Array.isArray(value) ? value : [value];
  const entry = links.find((link) => link && typeof link === "object" && (!link["@_rel"] || link["@_rel"] === "alternate"));
  return entry && typeof entry === "object" ? String(entry["@_href"] ?? "") : "";
}
export function parseRss(xml: string, source: NewsSource): NewsItem[] {
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) throw new Error("XML entities are not supported");
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, trimValues: true }).parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as { channel?: { item?: unknown; title?: unknown } } | undefined;
  const atom = parsed.feed as { entry?: unknown; title?: unknown } | undefined;
  const entries = rss?.channel?.item ?? atom?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  // The official NOAA Ocean Service feed nests older <item> nodes inside one
  // item. Flatten them so the years of archive entries are not silently lost.
  const flattened: unknown[] = [];
  function collect(value: unknown) {
    if (!value || typeof value !== "object" || flattened.length >= 500) return;
    const row = value as Record<string, unknown>;
    if (row.link && row.title) flattened.push(row);
    const children = row.item;
    for (const child of Array.isArray(children) ? children : children ? [children] : []) collect(child);
  }
  for (const entry of list) collect(entry);
  return flattened.map((value) => {
    const row = value as Record<string, unknown>;
    return makeItem(source, { url: rss ? xmlText(row.link) : atomLink(row.link), title: xmlText(row.title),
      date: row.pubDate ?? row["dc:date"] ?? row.published ?? row.updated,
      publisher: source.name, language: "English", externalId: row.guid ? xmlText(row.guid) : row.id ? xmlText(row.id) : undefined });
  }).filter((item): item is NewsItem => item !== null);
}

const nasaFeedUrl = "https://www.nasa.gov/news-release/feed/";
const noaaFeedUrl = "https://www.noaa.gov/rss.xml";
const nasaRightsBasis = "NASA Images and Media Usage Guidelines: NASA-produced educational and informational material may be used with NASA attribution; individually exclude third-party copyrighted material. https://www.nasa.gov/nasa-brand-center/images-and-media/";
const noaaRightsBasis = "NOAA Education and Outreach FAQ: NOAA-created articles may be reused with NOAA attribution; check each item and exclude third-party content. https://www.noaa.gov/office-education/outreach-communication/faq";
const thirdPartyNotice = /(?:copyright|©|all rights reserved|associated press|reuters|getty images|shutterstock|adobe stock)/i;
function creditedImage(html: string, agency: "NASA" | "NOAA") {
  const $ = load(html);
  for (const figure of $("figure").toArray()) {
    const image = $(figure).find("img[src]").first();
    const caption = $(figure).find("figcaption").first().text().replace(/\s+/g, " ").trim();
    const credit = /(?:image|photo|illustration)\s+credit:\s*([^)]+)\)/i.exec(caption)?.[1]?.trim();
    if (!image.length || !credit || !new RegExp(`\\b${agency}\\b`, "i").test(credit) || thirdPartyNotice.test(caption)) continue;
    const image_url = canonicalUrl(image.attr("src") ?? "");
    if (!image_url || image_url.length > 2000) continue;
    const url = new URL(image_url);
    const approved = agency === "NOAA"
      ? url.hostname === "www.noaa.gov" && url.pathname.startsWith("/sites/default/files/")
      : url.hostname === "www.nasa.gov" && url.pathname.startsWith("/wp-content/uploads/");
    if (!approved || url.protocol !== "https:") continue;
    return { image_url, image_alt: cleanText(image.attr("alt") || caption, 300), image_credit: cleanText(credit, 200), image_rights_basis: agency === "NOAA" ? noaaRightsBasis : nasaRightsBasis };
  }
  return { image_url: null, image_alt: null, image_credit: null, image_rights_basis: null };
}
export function parseNasaNewsBodies(xml: string, source: NewsSource): NewsBodyCandidate[] {
  if (source.feed_url !== nasaFeedUrl || xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) return [];
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, trimValues: true }).parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const entries = parsed.rss?.channel?.item;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list.slice(0, 50).flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    const source_url = canonicalUrl(xmlText(row.link));
    if (!source_url) return [];
    const url = new URL(source_url);
    if (url.hostname !== "www.nasa.gov" || !url.pathname.startsWith("/news-release/")) return [];
    const html = xmlText(row["content:encoded"]);
    if (!html || html.length > 250000 || thirdPartyNotice.test(html)) return [];
    const $ = load(html);
    $("script,style,nav,form,svg,iframe,figure,figcaption,blockquote").remove();
    const paragraphs = $("p,h2,h3,li").toArray().map((node) => $(node).text().replace(/\s+/g, " ").trim()).filter((text) => text.length >= 12);
    const body_text = paragraphs.join("\n\n").slice(0, 50000);
    if (body_text.length < 200) return [];
    return [{ canonical_hash: newsHash(source_url), body_text, rights_basis: nasaRightsBasis, source_url, ...creditedImage(html, "NASA") }];
  });
}

export function parseNoaaNewsBodies(xml: string, source: NewsSource): NewsBodyCandidate[] {
  if (source.feed_url !== noaaFeedUrl || xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) return [];
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, trimValues: true }).parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const entries = parsed.rss?.channel?.item;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list.slice(0, 50).flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    const source_url = canonicalUrl(xmlText(row.link));
    if (!source_url) return [];
    const url = new URL(source_url);
    if (url.hostname !== "www.noaa.gov" || !/^\/(news-release|news|stories|media-advisory)\//.test(url.pathname)) return [];
    const html = xmlText(row.description);
    if (!html || html.length > 250000 || thirdPartyNotice.test(html)) return [];
    const $ = load(html);
    const body = $(".c-field--name-field-body-formatted-long");
    if (!body.length) return [];
    body.find("script,style,nav,form,svg,iframe,figure,figcaption").remove();
    const paragraphs = body.find("p,h2,h3,li").toArray().map((node) => $(node).text().replace(/\s+/g, " ").trim()).filter((text) => text.length >= 12);
    const body_text = paragraphs.join("\n\n").slice(0, 50000);
    if (body_text.length < 200) return [];
    return [{ canonical_hash: newsHash(source_url), body_text, rights_basis: noaaRightsBasis, source_url, ...creditedImage(html, "NOAA") }];
  });
}

export function assertApprovedFeedUrl(raw: string): URL {
  const url = new URL(raw);
  const allowed = (process.env.NEWS_RSS_ALLOWED_HOSTS ?? "www.nasa.gov,science.nasa.gov,earthobservatory.nasa.gov,www.noaa.gov,oceanservice.noaa.gov,www.nsf.gov").split(",").map((host) => host.trim().toLowerCase());
  if (url.protocol !== "https:" || url.port || url.username || url.password || isIP(url.hostname) || !allowed.includes(url.hostname.toLowerCase())) throw new Error("Feed host is not approved in NEWS_RSS_ALLOWED_HOSTS");
  return url;
}
async function boundedFetch(url: URL, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(9000), cache: "no-store" });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      continue;
    }
    if (response.status === 304) return response;
    if ((response.status === 429 || [500, 502, 503, 504].includes(response.status)) && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2000) : 300 * 2 ** attempt;
      await response.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (response.status >= 300 && response.status < 400) throw new Error("Provider redirect blocked");
    return response;
  }
  throw new Error("Provider unavailable");
}
async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1024 * 1024) throw new Error("Provider response too large"); chunks.push(value); }
  } finally { await reader.cancel().catch(() => undefined); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export const gdeltProvider: NewsProvider = { kind: "gdelt", async fetch(source, fetcher = fetch) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", "(education OR science OR technology OR environment) sourcelang:english");
  url.searchParams.set("mode", "artlist"); url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "50"); url.searchParams.set("timespan", "1d"); url.searchParams.set("sort", "datedesc");
  const response = await boundedFetch(url, { headers: { Accept: "application/json" } }, fetcher);
  if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);
  const raw = await boundedText(response);
  const data = JSON.parse(raw);
  return { items: normalizeGdelt(data, source), etag: null, lastModified: null, cacheUntil: null, notModified: false };
} };
function cacheUntil(response: Response): string | null {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "");
  if (!match) return null;
  return new Date(Date.now() + Math.min(Number(match[1]), 86400) * 1000).toISOString();
}
export const rssProvider: NewsProvider = { kind: "rss", async fetch(source, fetcher = fetch, archivePage) {
  if (!source.feed_url) throw new Error("Feed URL missing");
  const url = assertApprovedFeedUrl(source.feed_url);
  if (archivePage !== undefined) {
    if (source.feed_url !== nasaFeedUrl || !Number.isInteger(archivePage) || archivePage < 2 || archivePage > 4000) throw new Error("Archive page is not approved");
    url.searchParams.set("paged", String(archivePage));
  }
  const headers: Record<string,string> = { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" };
  if (archivePage === undefined && source.etag) headers["If-None-Match"] = source.etag;
  if (archivePage === undefined && source.last_modified) headers["If-Modified-Since"] = source.last_modified;
  const response = await boundedFetch(url, { headers }, fetcher);
  if (response.status === 304) return { items: [], etag: source.etag, lastModified: source.last_modified, cacheUntil: cacheUntil(response), notModified: true };
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  const xml = await boundedText(response);
  return { items: parseRss(xml, source), bodies: [...parseNasaNewsBodies(xml, source), ...parseNoaaNewsBodies(xml, source)], etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), cacheUntil: cacheUntil(response), notModified: false };
} };
export const providers: Record<NewsSource["provider"], NewsProvider> = { gdelt: gdeltProvider, rss: rssProvider };
