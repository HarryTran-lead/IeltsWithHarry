import { randomUUID } from "node:crypto";
import { factDossierSchema, factualSourceHosts } from "./fact-dossier-schema";
import { writeArticleFromFacts } from "./fact-dossier";
import { AiQuotaError, geminiJson } from "./enrichment";
import { pressDiscoveryFeedUrls, rssProvider, type NewsItem, type NewsSource } from "./providers";
import type { NewsAdminSettings } from "./settings";
import type { newsAdminClient } from "./sync";

type Db = ReturnType<typeof newsAdminClient>;
export type DiscoveryRun = { rewritesChecked: number; rewritesAdded: number; quotaLimited: boolean; errors: string[] };
const searchSchema = { type: "object", additionalProperties: false, required: ["topic", "facts"], properties: {
  topic: { type: "string" },
  facts: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim", "source_url"], properties: { claim: { type: "string" }, source_url: { type: "string" } } } },
} } as const;
const eligible = (item: NewsItem) => !item.sensitive && Date.now() - new Date(item.published_at).valueOf() < 48 * 3600000;
/** A rejected topic consumes a research attempt, not one of the article slots. */
export function discoveryBudget(articleCount: number, rejectedCount: number, articleLimit: number) {
  const attemptLimit = Math.min(articleLimit * 4, 24);
  return articleLimit > 0 && articleCount < articleLimit && articleCount + rejectedCount < attemptLimit;
}
function repeatsHeadlinePhrase(text: string, headline: string) {
  const words = (value: string) => value.toLocaleLowerCase("en").match(/[a-z0-9]+/g) ?? [];
  const source = words(headline);
  const output = words(text).join(" ");
  return source.slice(0, -4).some((_, index) => output.includes(source.slice(index, index + 5).join(" ")));
}

/** A press headline is a search lead only. Factual notes must come from other pages. */
export async function findIndependentDossier(item: NewsItem, fetcher: typeof fetch = fetch) {
  const { data } = await geminiJson<{ topic?: string; facts?: { claim: string; source_url: string }[] }>(
    `Research the event named in the title using Google Search. Search in English and the relevant local language. Use only independently published primary pages or reviewed open sources at these domains: ${factualSourceHosts.join(", ")}. Government announcements and original agency data are preferred. Never use a newspaper, the title itself, a search snippet or your memory as factual evidence. Return 8–16 distinct, atomic facts directly supported by at most four specific source pages and a short neutral topic in your own words. Background facts must be directly relevant to the event. If independent pages do not establish enough facts, return an empty facts array. Do not quote source prose or repeat the search-lead headline.`,
    `Event search lead: ${item.title}\nFind independently verifiable facts about this event.`,
    searchSchema, { fetcher, googleSearch: true, temperature: 0, maxOutputTokens: 2200 });
  const dossier = factDossierSchema.safeParse({ topic: data.topic, category: item.category, facts: data.facts ?? [] });
  if (dossier.success && repeatsHeadlinePhrase(dossier.data.topic, item.title)) return factDossierSchema.safeParse({ ...dossier.data, topic: "" });
  return dossier;
}

/** One bounded attempt per run; only a fully verified original article becomes public. */
export async function discoverPressFacts(db: Db, result: DiscoveryRun, settings: NewsAdminSettings, fetcher: typeof fetch = fetch) {
  if (!process.env.GEMINI_API_KEY || settings.daily_rewrite_limit <= 0) return;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const [drafts, rejected, sources] = await Promise.all([
    db.from("news_articles").select("id", { count: "exact", head: true }).like("external_id", "press-discovery:%").gte("published_at", today.toISOString()),
    db.from("news_skipped_urls").select("canonical_hash", { count: "exact", head: true }).eq("reason", "ai_rewrite").gte("skipped_at", today.toISOString()),
    db.from("news_sources").select("*").eq("provider", "ai_rewrite").eq("enabled", true).eq("policy_status", "METADATA_ONLY"),
  ]);
  if (drafts.error || rejected.error || sources.error) throw drafts.error ?? rejected.error ?? sources.error;
  if (!discoveryBudget(drafts.count ?? 0, rejected.count ?? 0, settings.daily_rewrite_limit)) return;
  const feeds = await Promise.allSettled(((sources.data ?? []) as NewsSource[]).filter((source) => source.feed_url && pressDiscoveryFeedUrls.has(source.feed_url))
    .map(async (source) => {
      const { data: claimed, error: claimError } = await db.rpc("news_claim_source", { p_source_id: source.id });
      if (claimError) throw claimError;
      if (!claimed) return null;
      try {
        const feed = await rssProvider.fetch({ ...source, provider: "rss", etag: null, last_modified: null }, fetcher);
        await db.from("news_sources").update({ last_success_at: new Date().toISOString(), last_error: null, cache_until: feed.cacheUntil }).eq("id", source.id);
        return { source, feed };
      } catch (cause) {
        await db.from("news_sources").update({ last_error: cause instanceof Error ? cause.message.slice(0, 400) : "Feed discovery failed" }).eq("id", source.id);
        throw cause;
      }
    }));
  for (const outcome of feeds) if (outcome.status === "rejected") result.errors.push(`Press feed: ${outcome.reason instanceof Error ? outcome.reason.message : "Unavailable"}`);
  const candidates = feeds.flatMap((outcome) => outcome.status === "fulfilled" && outcome.value ? outcome.value.feed.items.filter(eligible).map((item) => ({ item, source: outcome.value!.source })) : []);
  if (!candidates.length) return;
  const ordered = [...new Map(candidates.map((candidate) => [candidate.item.canonical_hash, candidate])).values()]
    .sort((a, b) => new Date(b.item.published_at).valueOf() - new Date(a.item.published_at).valueOf());
  const hashes = ordered.map(({ item }) => item.canonical_hash);
  const [existing, skipped] = await Promise.all([
    db.from("news_articles").select("canonical_hash").in("canonical_hash", hashes),
    db.from("news_skipped_urls").select("canonical_hash").in("canonical_hash", hashes),
  ]);
  if (existing.error || skipped.error) throw existing.error ?? skipped.error;
  const seen = new Set([...(existing.data ?? []), ...(skipped.data ?? [])].map((row) => row.canonical_hash));
  const candidate = ordered.find(({ item }) => !seen.has(item.canonical_hash));
  if (!candidate) return;
  const { item, source } = candidate;
  result.rewritesChecked++;
  try {
    const dossier = await findIndependentDossier(item, fetcher);
    if (!dossier.success) {
      await db.from("news_skipped_urls").upsert({ canonical_hash: item.canonical_hash, reason: "ai_rewrite", detail: "Insufficient independent primary-source facts" }, { onConflict: "canonical_hash" });
      return;
    }
    const written = await writeArticleFromFacts(dossier.data, fetcher);
    if (repeatsHeadlinePhrase(`${written.title} ${written.body}`, item.title)) throw new Error("Original draft repeated the discovery headline");
    const { data: manual, error: manualError } = await db.from("news_sources").select("id").eq("provider", "manual").single();
    if (manualError || !manual) throw manualError ?? new Error("Manual source unavailable");
    const id = randomUUID();
    const sourceUrl = written.dossier.facts[0].source_url;
    const { error: articleError } = await db.from("news_articles").insert({
      id, source_id: manual.id, provider: "manual", external_id: `press-discovery:${item.canonical_hash}`,
      canonical_hash: item.canonical_hash, canonical_url: sourceUrl, title: written.title,
      publisher: "IeltsWithHarry", category: item.category, published_at: new Date().toISOString(),
      publication_status: "review", sensitive: false, attribution_text: "Independent factual sources in editorial dossier",
      metadata: { discovery_url: item.canonical_url, discovery_source: source.name },
    });
    if (articleError) throw articleError;
    const { error: bodyError } = await db.from("news_article_bodies").insert({
      article_id: id, body_text: written.body, source_url: sourceUrl, ai_generated: true,
      byline: "IeltsWithHarry editorial",
      rights_basis: `Original AI-assisted draft from verified primary/open facts. Discovery lead: ${item.canonical_url}. Editorial dossier: ${JSON.stringify({ topic: written.dossier.topic, category: written.dossier.category, facts: written.dossier.facts, model: written.model, verified_with: written.verified_with, reviewed_with: written.reviewed_with })}`,
    });
    if (bodyError) { await db.from("news_articles").delete().eq("id", id); throw bodyError; }
    const { error: dossierError } = await db.from("news_fact_dossiers").insert({
      article_id: id, dossier: written.dossier, verification_model: written.verified_with,
      ai_reviewed_at: new Date().toISOString(), ai_review_model: written.reviewed_with,
    });
    if (dossierError) { await db.from("news_articles").delete().eq("id", id); throw dossierError; }
    const { error: publishError } = await db.from("news_articles").update({ publication_status: "published" }).eq("id", id);
    if (publishError) throw publishError;
    result.rewritesAdded++;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Press discovery failed";
    result.errors.push(`Discovery ${item.canonical_url}: ${message}`);
    if (cause instanceof AiQuotaError) result.quotaLimited = true;
    if (/not verified|did not support|failed factual or originality review|repeated the discovery headline/.test(message)) {
      await db.from("news_skipped_urls").upsert({ canonical_hash: item.canonical_hash, reason: "ai_rewrite", detail: message.slice(0, 300) }, { onConflict: "canonical_hash" });
    }
  }
}
