import type { newsAdminClient } from "./sync";

/** Keep legacy single-publisher rewrites out of the learner catalog pending review. */
export async function pauseLegacyPressRewrites(db: ReturnType<typeof newsAdminClient>) {
  const sources = await db.from("news_sources").update({ enabled: false, auto_publish: false })
    .eq("provider", "ai_rewrite").eq("enabled", true);
  if (sources.error) throw new Error(`Could not disable press feeds: ${sources.error.message}`);

  const articles = await db.from("news_articles").update({ publication_status: "hidden" })
    .eq("provider", "ai_rewrite").eq("publication_status", "published");
  if (articles.error) throw new Error(`Could not hide legacy press articles: ${articles.error.message}`);

  const settings = await db.from("news_admin_settings").update({ daily_rewrite_limit: 0 }).eq("id", true);
  if (settings.error) throw new Error(`Could not lock the rewrite quota: ${settings.error.message}`);
}
