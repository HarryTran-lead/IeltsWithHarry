import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("registers the official latest feed without allowing source auto-publication", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.news_sources (
      name text, provider text, feed_url text, category text, policy_status text,
      reviewed_basis text, attribution_text text, enabled boolean,
      auto_publish boolean, min_interval_minutes integer, origin_region text);
      create unique index news_sources_feed_url_idx on public.news_sources(feed_url) where feed_url is not null;`);
    await db.exec(readFileSync(resolve("supabase/migrations/202611110150_government_home_feed.sql"), "utf8"));
    const row = await db.query<{ feed_url: string; category: string; auto_publish: boolean }>(
      "select feed_url, category, auto_publish from public.news_sources");
    expect(row.rows).toEqual([{ feed_url: "https://baochinhphu.vn/home.rss", category: "World News", auto_publish: false }]);
    await db.exec("create trigger news_block_press_rewrites before insert or update on public.news_sources for each row execute function public.news_block_press_rewrites()");
    await expect(db.exec("update public.news_sources set auto_publish = true")).rejects.toThrow("Fact discovery feeds cannot publish");
    await expect(db.exec("update public.news_sources set feed_url = 'https://unreviewed.example/rss'")).rejects.toThrow("Fact discovery feeds cannot publish");
  } finally {
    await db.close();
  }
}, 15000);
