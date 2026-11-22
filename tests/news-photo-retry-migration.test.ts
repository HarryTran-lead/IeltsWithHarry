import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("keeps photo search history on retry and resets it after a week", async () => {
  const db = new PGlite();
  const id = "23e516a2-bf15-4393-8172-d4d78c318124";
  try {
    await db.exec(`
      create table public.news_articles (id uuid primary key, title text, published_at timestamptz,
        publication_status text, sensitive boolean);
      create table public.news_article_bodies (article_id uuid primary key, body_text text, image_url text);
      create table public.news_article_images (article_id uuid primary key, image_url text);
      create table public.news_auto_illustrations (article_id uuid primary key, image_url text, image_source_url text);
      create table public.news_inline_images (article_id uuid, position smallint);
      create table public.news_enrichment_attempts (
        article_id uuid, kind text, attempted_at timestamptz default now(),
        retry_after timestamptz default now() + interval '1 day', status text default 'running',
        error_message text, constraint news_enrichment_attempts_pkey primary key (article_id, kind));
    `);
    await db.exec(readFileSync(resolve("supabase/migrations/202611220001_news_photo_retry_cycle.sql"), "utf8"));
    await db.query("insert into public.news_articles values ($1,'Vietnam news',now(),'published',false)", [id]);
    await db.query("insert into public.news_article_bodies values ($1,repeat('A readable news passage. ',100),'https://example.com/cover.jpg')", [id]);

    const claim = () => db.query<{ article_id: string }>("select article_id from public.news_claim_photo_work('inline_image',1)");
    expect((await claim()).rows.map((row) => row.article_id)).toEqual([id]);
    await db.query(`update public.news_enrichment_attempts set retry_after=now() - interval '1 minute',
      photo_search_queries=array['Vietnam bridge'], photo_rejected_urls=array['https://example.com/old.jpg']
      where article_id=$1`, [id]);
    expect((await claim()).rows).toHaveLength(1);
    const second = (await db.query<{ photo_attempt_count: number; photo_search_queries: string[]; photo_rejected_urls: string[] }>(
      "select photo_attempt_count,photo_search_queries,photo_rejected_urls from public.news_enrichment_attempts where article_id=$1", [id])).rows[0];
    expect(second).toMatchObject({ photo_attempt_count: 2, photo_search_queries: ["Vietnam bridge"],
      photo_rejected_urls: ["https://example.com/old.jpg"] });

    await db.query(`update public.news_enrichment_attempts set retry_after=now() - interval '1 minute',
      photo_cycle_started_at=now() - interval '8 days' where article_id=$1`, [id]);
    expect((await claim()).rows).toHaveLength(1);
    const reset = (await db.query<{ photo_attempt_count: number; photo_search_queries: string[]; photo_rejected_urls: string[] }>(
      "select photo_attempt_count,photo_search_queries,photo_rejected_urls from public.news_enrichment_attempts where article_id=$1", [id])).rows[0];
    expect(reset).toMatchObject({ photo_attempt_count: 1, photo_search_queries: [], photo_rejected_urls: [] });
  } finally {
    await db.close();
  }
}, 30_000);
