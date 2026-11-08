import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

it("re-enables discovery only and publishes original text only after dossier review", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.objects(bucket_id text, name text);
      create function public.is_admin() returns boolean language sql as $$select true$$;
      create table public.news_sources(id uuid primary key, provider text, feed_url text, enabled boolean, auto_publish boolean, policy_status text, reviewed_basis text);
      create table public.news_admin_settings(id boolean primary key, daily_rewrite_limit integer);
      create table public.news_articles(id uuid primary key, provider text, publication_status text, metadata jsonb);
      create table public.news_article_bodies(article_id uuid, ai_generated boolean, body_text text, image_url text, source_url text);
      create table public.content_rights_evidence(content_kind text, content_id uuid, asset_kind text, asset_url text, web_publication_allowed boolean, commercial_use_allowed boolean, modification_translation_allowed boolean, permission_document_ref text);
      create table public.lesson_blocks(lesson_id uuid, kind text);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');
      insert into public.news_admin_settings values (true,0);
      insert into public.news_sources values ('22222222-2222-4222-8222-222222222222','ai_rewrite','https://news.tuoitre.vn/rss',false,false,'METADATA_ONLY','old');
    `);
    const migration = readFileSync(resolve("supabase/migrations/202611080006_press_fact_discovery.sql"), "utf8").split("-- Primary-source search")[0];
    await db.exec(migration);
    expect((await db.query<{ enabled: boolean; auto_publish: boolean }>("select enabled,auto_publish from public.news_sources")).rows[0]).toEqual({ enabled: true, auto_publish: false });
    expect((await db.query<{ daily_rewrite_limit: number }>("select daily_rewrite_limit from public.news_admin_settings")).rows[0].daily_rewrite_limit).toBe(4);
    await db.exec(`
      create trigger press_guard before update on public.news_sources for each row execute function public.news_block_press_rewrites();
      create trigger rights_guard before update on public.news_articles for each row execute function public.content_require_publish_rights();
      insert into public.news_articles values ('33333333-3333-4333-8333-333333333333','manual','review','{"fact_discovery":true}');
      insert into public.news_article_bodies values ('33333333-3333-4333-8333-333333333333',true,'An original verified passage',null,'https://www.nasa.gov/test');
      insert into public.news_fact_dossiers(article_id,dossier,verification_model) values
        ('33333333-3333-4333-8333-333333333333','{"facts":[{},{},{},{},{},{},{},{}]}','gemini-test');
    `);
    await expect(db.exec("update public.news_sources set auto_publish=true where provider='ai_rewrite'")).rejects.toThrow("cannot publish");
    await expect(db.exec("update public.news_articles set publication_status='published' where provider='manual'")).rejects.toThrow("fact dossier");
    await db.exec("update public.news_fact_dossiers set reviewed_by='11111111-1111-4111-8111-111111111111', reviewed_at=now()");
    await db.exec("update public.news_articles set publication_status='published' where provider='manual'");
    expect((await db.query<{ publication_status: string }>("select publication_status from public.news_articles")).rows[0].publication_status).toBe("published");
    await expect(db.exec("update public.news_article_bodies set body_text='A modified passage'")).rejects.toThrow("Unpublish and re-review");
  } finally { await db.close(); }
}, 30000);
