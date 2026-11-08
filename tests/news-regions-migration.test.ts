import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("news source regions and interests migration", () => {
  it("backfills existing Vietnamese stories and exposes region and topic filters through the catalog", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.news_sources (id uuid primary key default gen_random_uuid(), name text, provider text, feed_url text, category text, policy_status text, reviewed_basis text, attribution_text text, enabled boolean, auto_publish boolean, min_interval_minutes integer);
        create unique index news_sources_feed_unique on public.news_sources(feed_url) where feed_url is not null;
        create table public.news_articles (id uuid primary key default gen_random_uuid(), source_id uuid references public.news_sources(id), title text, publisher text, canonical_url text, category text, published_at timestamptz, fetched_at timestamptz, attribution_text text, sensitive boolean, publication_status text);
        create table public.news_article_bodies (article_id uuid, image_url text, image_alt text, image_credit text, reading_passage smallint);
        create table public.news_article_images (article_id uuid, image_url text, image_alt text, image_credit text);
        create table public.news_auto_illustrations (article_id uuid, image_url text, image_alt text, image_credit text, image_source_url text, license_name text, license_url text);
        insert into public.news_sources(name,provider,feed_url) values ('Tuoi Tre News','ai_rewrite','https://news.tuoitre.vn/rss/news.rss');
        insert into public.news_articles(source_id,title,canonical_url,category,published_at,publication_status) select id,'A film festival brings good news','https://news.tuoitre.vn/test','Culture',now(),'published' from public.news_sources;
      `);
      await db.exec(readFileSync(resolve("supabase/migrations/202611080002_news_regions_and_interests.sql"), "utf8"));
      const article = (await db.query<{ origin_region: string; interest_topics: string[] }>("select origin_region, interest_topics from public.news_archive_catalog where title = 'A film festival brings good news' ")).rows[0];
      expect(article).toEqual({ origin_region: "vietnam", interest_topics: ["entertainment", "curious"] });
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.news_sources where interest_topic is not null")).rows[0].count).toBe(4);
    } finally { await db.close(); }
  }, 30000);
});
