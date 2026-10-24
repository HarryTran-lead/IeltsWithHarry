import { createClient } from "@supabase/supabase-js";
import { providers, type NewsSource } from "./providers";

export function newsAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("News sync credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function syncNews() {
  const db = newsAdminClient();
  const { data: sources, error } = await db.from("news_sources").select("*").eq("enabled", true).order("created_at").limit(10);
  if (error) throw error;
  const results: { source: string; status: string; fetched: number; inserted: number; error?: string }[] = [];
  for (const source of (sources ?? []) as NewsSource[]) {
    if (!["METADATA_ONLY", "FULL_REUSE_ALLOWED"].includes(source.policy_status) || source.reviewed_basis.trim().length < 12) continue;
    const { data: claimed, error: claimError } = await db.rpc("news_claim_source", { p_source_id: source.id });
    if (claimError) { results.push({ source: source.name, status: "error", fetched: 0, inserted: 0, error: claimError.message }); continue; }
    if (!claimed) { results.push({ source: source.name, status: "skipped", fetched: 0, inserted: 0 }); continue; }
    const { data: run, error: runError } = await db.from("news_sync_runs").insert({ source_id: source.id }).select("id").single();
    if (runError) throw runError;
    try {
      const provider = providers[source.provider];
      if (!provider) throw new Error("Unknown news provider");
      const response = await provider.fetch(source);
      const unique = [...new Map(response.items.map((item) => [item.canonical_hash, item])).values()];
      let inserted = 0;
      if (!response.notModified && unique.length) {
        const hashes = unique.map((item) => item.canonical_hash);
        const { data: existing, error: existingError } = await db.from("news_articles").select("canonical_hash").in("canonical_hash", hashes);
        if (existingError) throw existingError;
        const known = new Set((existing ?? []).map((row) => row.canonical_hash));
        const fresh = unique.filter((item) => !known.has(item.canonical_hash));
        if (fresh.length) {
          const { error: insertError } = await db.from("news_articles").upsert(fresh, { onConflict: "canonical_hash", ignoreDuplicates: true });
          if (insertError) throw insertError;
          inserted = fresh.length;
        }
      }
      const finished_at = new Date().toISOString();
      const status = response.notModified ? "not_modified" : "success";
      const { error: sourceError } = await db.from("news_sources").update({ last_success_at: finished_at, last_error: null, etag: response.etag, last_modified: response.lastModified, cache_until: response.cacheUntil }).eq("id", source.id);
      if (sourceError) throw sourceError;
      await db.from("news_sync_runs").update({ finished_at, status, fetched_count: unique.length, inserted_count: inserted }).eq("id", run.id);
      results.push({ source: source.name, status, fetched: unique.length, inserted });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 400) : "Unknown sync error";
      const finished_at = new Date().toISOString();
      await Promise.all([
        db.from("news_sources").update({ last_error: message }).eq("id", source.id),
        db.from("news_sync_runs").update({ finished_at, status: "error", error_message: message }).eq("id", run.id),
      ]);
      results.push({ source: source.name, status: "error", fetched: 0, inserted: 0, error: message });
    }
  }
  return results;
}
