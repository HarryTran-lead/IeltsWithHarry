import type { newsAdminClient } from "./sync";

/** Legacy single-publisher articles stay hidden; feeds may identify topics only. */
export async function pauseLegacyPressRewrites(db: ReturnType<typeof newsAdminClient>) {
  const sources = await db.from("news_sources").update({ auto_publish: false })
    .eq("provider", "ai_rewrite").eq("auto_publish", true);
  if (sources.error) throw new Error(`Could not disable press feeds: ${sources.error.message}`);

  const articles = await db.from("news_articles").update({ publication_status: "hidden" })
    .eq("provider", "ai_rewrite").eq("publication_status", "published");
  if (articles.error) throw new Error(`Could not hide legacy press articles: ${articles.error.message}`);

}
