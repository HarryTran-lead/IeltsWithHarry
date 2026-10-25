import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { manualNewsSchema } from "../src/lib/news/validation";

const migration = ["202610250014_news_admin_controls.sql", "202610250015_news_manual_quiz_reset.sql"]
  .map((file) => readFileSync(resolve("supabase/migrations", file), "utf8")).join("\n");

describe("Daily News admin controls", () => {
  it("validates manual full-text rights before saving", () => {
    const article = { title: "A new learning project", canonical_url: "https://example.org/story", publisher: "Editorial team",
      category: "Education", published_at: "2026-10-24T10:00:00.000Z", sensitive: false, body_text: "A short copied paragraph", rights_basis: "" };
    expect(manualNewsSchema.safeParse(article).success).toBe(false);
    expect(manualNewsSchema.safeParse({ ...article, body_text: "" }).success).toBe(true);
  });

  it("applies the migration and atomically saves a manual article with its body", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create function public.is_admin() returns boolean language sql stable as $$
          select current_setting('news.admin', true) = 'yes';
        $$;
        create table public.news_sources (
          id uuid primary key default gen_random_uuid(), name text not null,
          provider text not null constraint news_sources_provider_check check (provider in ('gdelt','rss')),
          category text not null, policy_status text not null, reviewed_basis text not null,
          attribution_text text not null, feed_url text, enabled boolean not null default false,
          auto_publish boolean not null default false, min_interval_minutes integer not null default 30,
          last_checked_at timestamptz
        );
        create table public.news_articles (
          id uuid primary key default gen_random_uuid(), source_id uuid not null references public.news_sources(id),
          provider text not null, canonical_hash text not null unique, canonical_url text not null,
          title text not null, publisher text not null, category text not null,
          published_at timestamptz not null, publication_status text not null,
          sensitive boolean not null, attribution_text text not null, updated_at timestamptz not null default now()
        );
        create table public.news_article_bodies (
          article_id uuid primary key references public.news_articles(id) on delete cascade,
          body_text text not null, rights_basis text not null,
          source_url text not null constraint news_article_bodies_source_url_check
            check (source_url ~ '^https://www\\.nasa\\.gov/news-release/'),
          ingested_at timestamptz not null default now()
        );
        create table public.news_auto_quiz_sets (
          article_id uuid primary key references public.news_articles(id) on delete cascade,
          model text not null
        );
        create table public.news_enrichment_attempts (
          article_id uuid not null references public.news_articles(id) on delete cascade,
          kind text not null, attempted_at timestamptz not null default now(),
          status text not null, error_message text, primary key(article_id, kind)
        );
      `);
      await db.exec(migration);
      expect((await db.query<{ auto_sync_enabled: boolean }>("select auto_sync_enabled from public.news_admin_settings")).rows[0].auto_sync_enabled).toBe(true);
      await db.exec("set news.admin = 'yes'");
      const body = "The editorial team wrote an original article about how students read scientific news in English. ".repeat(4);
      const args = ["An original science reading", "https://example.org/story", "Editorial team", "Education", "2026-10-24T10:00:00Z", false, body, "Original article written by the editorial team for this website."];
      const result = await db.query<{ id: string }>("select public.admin_save_manual_news(null,$1,$2,$3,$4,$5,$6,$7,$8) as id", args);
      const id = result.rows[0].id;
      expect((await db.query<{ publication_status: string }>("select publication_status from public.news_articles where id=$1", [id])).rows[0].publication_status).toBe("review");
      expect((await db.query<{ body_text: string }>("select body_text from public.news_article_bodies where article_id=$1", [id])).rows[0].body_text).toBe(body.trim());
      await db.query("insert into public.news_auto_quiz_sets(article_id,model) values ($1,'test')", [id]);
      await db.query("insert into public.news_enrichment_attempts(article_id,kind,status) values ($1,'quiz','success')", [id]);
      await db.query("select public.admin_save_manual_news($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, ...args.slice(0, 6), `${body} Updated.`, args[7]]);
      expect((await db.query("select * from public.news_auto_quiz_sets where article_id=$1", [id])).rows).toHaveLength(0);
      expect((await db.query("select * from public.news_enrichment_attempts where article_id=$1", [id])).rows).toHaveLength(0);
      await db.exec("set news.admin = 'no'");
      await expect(db.query("select public.admin_save_manual_news($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, ...args])).rejects.toThrow(/Admin required/);
    } finally { await db.close(); }
  }, 20000);
});
