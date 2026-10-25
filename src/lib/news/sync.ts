import { createClient } from "@supabase/supabase-js";
import { fetchGovUkBody, fetchOceanServiceBody, providers, type FetchResult, type NewsBodyCandidate, type NewsSource } from "./providers";
import { loadNewsSettings } from "./settings";

const nasaArchiveFeed = "https://www.nasa.gov/news-release/feed/";
/** Teaser-only feeds and how their article text is read. */
function pageBodyReader(feed: string | null): ((url: string) => Promise<NewsBodyCandidate | null>) | null {
  if (feed === "https://oceanservice.noaa.gov/rss/nosnews.xml") return fetchOceanServiceBody;
  if (feed?.startsWith("https://www.gov.uk/search/news-and-communications.atom?")) return fetchGovUkBody;
  return null;
}

export function newsAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("News sync credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type AdminClient = ReturnType<typeof newsAdminClient>;
function batches<T>(values: T[], size = 50): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

/**
 * Only readable articles are stored. A feed that carries text keeps just the items with
 * text; a teaser-only feed keeps every item until its page has been read.
 */
async function ingest(db: AdminClient, response: FetchResult, requireBody: boolean) {
  const withText = new Set((response.bodies ?? []).map((body) => body.canonical_hash));
  const unique = [...new Map(response.items.filter((item) => !requireBody || withText.has(item.canonical_hash)).map((item) => [item.canonical_hash, item])).values()];
  let inserted = 0;
  for (const group of batches(unique)) {
    const hashes = group.map((item) => item.canonical_hash);
    const [{ data: existing, error: existingError }, { data: skipped, error: skippedError }] = await Promise.all([
      db.from("news_articles").select("canonical_hash").in("canonical_hash", hashes),
      db.from("news_skipped_urls").select("canonical_hash").in("canonical_hash", hashes),
    ]);
    if (existingError) throw existingError;
    if (skippedError) throw skippedError;
    const known = new Set([...(existing ?? []), ...(skipped ?? [])].map((row) => row.canonical_hash));
    const fresh = group.filter((item) => !known.has(item.canonical_hash));
    if (fresh.length) {
      const { error } = await db.from("news_articles").upsert(fresh, { onConflict: "canonical_hash", ignoreDuplicates: true });
      if (error) throw error;
      inserted += fresh.length;
    }
  }
  for (const group of batches([...new Map((response.bodies ?? []).map((body) => [body.canonical_hash, body])).values()])) {
    const { data: articles, error: articleError } = await db.from("news_articles").select("id,canonical_hash").in("canonical_hash", group.map((body) => body.canonical_hash));
    if (articleError) throw articleError;
    const ids = new Map((articles ?? []).map((article) => [article.canonical_hash, article.id]));
    const eligible = group.flatMap((body) => ids.has(body.canonical_hash) ? [{ article_id: ids.get(body.canonical_hash), body_text: body.body_text, rights_basis: body.rights_basis, source_url: body.source_url, image_url: body.image_url, image_alt: body.image_alt, image_credit: body.image_credit, image_rights_basis: body.image_rights_basis, byline: body.byline ?? null }] : []);
    if (eligible.length) {
      const { error } = await db.from("news_article_bodies").upsert(eligible, { onConflict: "article_id" });
      if (error) throw error;
    }
  }
  for (const group of batches([...new Map((response.images ?? []).map((image) => [image.canonical_hash, image])).values()])) {
    const { data: articles, error: articleError } = await db.from("news_articles").select("id,canonical_hash").in("canonical_hash", group.map((image) => image.canonical_hash));
    if (articleError) throw articleError;
    const ids = new Map((articles ?? []).map((article) => [article.canonical_hash, article.id]));
    const eligible = group.flatMap((image) => ids.has(image.canonical_hash) ? [{ article_id: ids.get(image.canonical_hash), source_url: image.source_url, image_url: image.image_url, image_alt: image.image_alt, image_credit: image.image_credit, image_rights_basis: image.image_rights_basis }] : []);
    if (eligible.length) {
      const { error } = await db.from("news_article_images").upsert(eligible, { onConflict: "article_id" });
      if (error) throw error;
    }
  }
  return { fetched: unique.length, inserted };
}

/**
 * Feeds that carry only a teaser get their text from the article page. A few
 * pages per sync, newest first; a failed or empty page waits a week.
 */
async function fetchPageBodies(db: AdminClient, source: NewsSource, read: (url: string) => Promise<NewsBodyCandidate | null>, limit = 4) {
  const { data: claims, error } = await db.rpc("news_claim_body_fetch", { p_source_id: source.id, p_limit: limit });
  if (error) throw error;
  let added = 0;
  // Pages are read in parallel so several teaser-only sources fit in one sync request.
  await Promise.all(((claims ?? []) as { article_id: string; canonical_url: string }[]).map(async (claim) => {
    let status: "success" | "none" | "error" = "none"; let message = "";
    try {
      const body = await read(claim.canonical_url);
      if (body) {
        const { error: bodyError } = await db.from("news_article_bodies").upsert({ article_id: claim.article_id, body_text: body.body_text, rights_basis: body.rights_basis, source_url: body.source_url, byline: body.byline ?? null }, { onConflict: "article_id" });
        if (bodyError) throw bodyError;
        status = "success"; added++;
      }
    } catch (cause) {
      status = "error"; message = cause instanceof Error ? cause.message : "Page fetch failed";
    }
    await db.from("news_enrichment_attempts").update({ status, error_message: message.slice(0, 300) }).eq("article_id", claim.article_id).eq("kind", "body");
  }));
  return added;
}

/** Seed a bounded set of older NASA pages; duplicates are ignored. */
export async function backfillNews(pages: number[]) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 5 || pages.some((page) => !Number.isInteger(page) || page < 2 || page > 4000)) throw new Error("Choose 1–5 NASA archive pages between 2 and 4000");
  const db = newsAdminClient();
  const { data: source, error } = await db.from("news_sources").select("*").eq("feed_url", nasaArchiveFeed).single();
  if (error || !source?.enabled) throw new Error("NASA archive source unavailable");
  const results = [];
  for (const page of [...new Set(pages)]) {
    const response = await providers.rss.fetch(source as NewsSource, fetch, page);
    results.push({ page, ...await ingest(db, response, true) });
  }
  return results;
}

export async function syncNews({ scheduled = false }: { scheduled?: boolean } = {}) {
  const db = newsAdminClient();
  if (scheduled && !(await loadNewsSettings(db)).auto_sync_enabled) return [];
  const { data: sources, error } = await db.from("news_sources").select("*").eq("enabled", true).order("created_at").limit(25);
  if (error) throw error;
  const results: { source: string; status: string; fetched: number; inserted: number; error?: string }[] = [];
  for (const source of (sources ?? []) as NewsSource[]) {
    if (!["METADATA_ONLY", "FULL_REUSE_ALLOWED"].includes(source.policy_status) || source.reviewed_basis.trim().length < 12) continue;
    const { data: claimed, error: claimError } = await db.rpc(scheduled ? "news_claim_source" : "news_claim_source_force", { p_source_id: source.id });
    if (claimError) { results.push({ source: source.name, status: "error", fetched: 0, inserted: 0, error: claimError.message }); continue; }
    if (!claimed) { results.push({ source: source.name, status: "skipped", fetched: 0, inserted: 0 }); continue; }
    const { data: run, error: runError } = await db.from("news_sync_runs").insert({ source_id: source.id }).select("id").single();
    if (runError) throw runError;
    try {
      const provider = providers[source.provider];
      if (!provider) throw new Error("Unknown news provider");
      const response = await provider.fetch(source);
      const reader = pageBodyReader(source.feed_url);
      let fetched = 0;
      let inserted = 0;
      if (!response.notModified) {
        const count = await ingest(db, response, !reader);
        fetched += count.fetched; inserted += count.inserted;
      }
      let archiveNextPage = source.archive_next_page;
      // Two older pages per sync, in order. The cursor advances only after
      // successful ingestion.
      if (source.feed_url === nasaArchiveFeed && archiveNextPage) {
        for (let step = 0; step < 2 && archiveNextPage <= 4000; step++) {
          const archive = await providers.rss.fetch(source, fetch, archiveNextPage);
          if (!archive.items.length) { archiveNextPage = null; break; }
          const count = await ingest(db, archive, true);
          fetched += count.fetched; inserted += count.inserted;
          archiveNextPage++;
        }
      }
      // A page problem must not fail the sync; the article is pruned only once its page proves unusable.
      if (reader) await fetchPageBodies(db, source, reader, 8).catch(() => 0);
      const finished_at = new Date().toISOString();
      const status = response.notModified && !fetched ? "not_modified" : "success";
      const { error: sourceError } = await db.from("news_sources").update({ last_success_at: finished_at, last_error: null, etag: response.etag, last_modified: response.lastModified, cache_until: response.cacheUntil, archive_next_page: archiveNextPage }).eq("id", source.id);
      if (sourceError) throw sourceError;
      await db.from("news_sync_runs").update({ finished_at, status, fetched_count: fetched, inserted_count: inserted }).eq("id", run.id);
      results.push({ source: source.name, status, fetched, inserted });
    } catch (cause) {
      const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
        ? cause.message.slice(0, 400) : "Unknown sync error";
      const finished_at = new Date().toISOString();
      await Promise.all([
        db.from("news_sources").update({ last_error: message }).eq("id", source.id),
        db.from("news_sync_runs").update({ finished_at, status: "error", error_message: message }).eq("id", run.id),
      ]);
      results.push({ source: source.name, status: "error", fetched: 0, inserted: 0, error: message });
    }
  }
  // Remove articles that turned out not to be readable on site (their links are remembered).
  await db.rpc("news_prune_unreadable").then(() => undefined, () => undefined);
  return results;
}
