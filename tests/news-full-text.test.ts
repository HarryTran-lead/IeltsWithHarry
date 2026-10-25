import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const chain = ["202610240001_foundation.sql", "202610240002_notebook.sql", "202610240007_daily_news.sql", "202610240008_news_practice_samples.sql", "202610240010_news_read_completion.sql", "202610240011_news_preferences.sql", "202610240012_nasa_article_reader.sql", "202610240013_noaa_full_text.sql", "202610250001_news_article_reads.sql", "202610250002_news_article_images.sql", "202610250003_news_translation_quota.sql", "202610250004_news_archive.sql", "202610250008_news_preview_images.sql", "202610250010_news_enrichment.sql", "202610250011_news_enrichment_claim_fix.sql", "202610250012_news_illustration_credit.sql", "202610250013_news_creative_commons_images.sql", "202610250014_news_admin_controls.sql", "202610250015_news_manual_quiz_reset.sql", "202610250016_news_full_text_sources.sql"];

describe("Daily News full-text and illustration sources migration", () => {
  it("accepts science.nasa.gov bodies, NASA Library illustrations and claims Ocean Service pages once", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;`);
      for (const name of chain) {
        if (name.includes("007")) await db.exec(readFileSync(resolve("supabase/seed.sql"), "utf8"));
        await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
      }
      const ocean = (await db.query<{ id: string }>("select id from public.news_sources where feed_url='https://oceanservice.noaa.gov/rss/nosnews.xml'")).rows[0].id;
      const insert = (hash: string, url: string) => db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',$2,'Ocean report released',$3,'NOAA','Environment',now(),'published') returning id", [ocean, hash, url]);
      const first = (await insert("b".repeat(64), "https://oceanservice.noaa.gov/news/oct26/a.html")).rows[0].id;
      await insert("c".repeat(64), "https://oceanservice.noaa.gov/news/oct26/b.html");

      const claimed = await db.query<{ article_id: string }>("select * from public.news_claim_body_fetch($1, 1)", [ocean]);
      expect(claimed.rows).toHaveLength(1);
      const again = await db.query<{ article_id: string }>("select * from public.news_claim_body_fetch($1, 5)", [ocean]);
      expect(again.rows.map((row) => row.article_id)).not.toContain(claimed.rows[0].article_id);
      expect(again.rows).toHaveLength(1);

      const text = "NASA scientists explained how the instrument maps the surface of Earth in three dimensions. ".repeat(4);
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url,image_url,image_alt,image_credit,image_rights_basis) values ($1,$2,repeat('NASA media guidelines reviewed ',2),'https://science.nasa.gov/earth/story/','https://assets.science.nasa.gov/dynamicimage/assets/map.jpg','A 3D map of Earth','NASA',repeat('NASA imagery reviewed ',3))", [first, text]);
      expect((await db.query("select * from public.news_claim_body_fetch($1, 5)", [ocean])).rows).toHaveLength(0);

      const illustration = (url: string, source: string, license: string, licenseUrl: string | null, credit = "NASA/James Blair") =>
        db.query("insert into public.news_auto_illustrations(article_id,image_url,image_alt,image_credit,image_source_url,license_name,license_url) values ($1,$2,'Ảnh minh họa: lunar lander',$3,$4,$5,$6) on conflict (article_id) do update set image_url = excluded.image_url, image_credit = excluded.image_credit, image_source_url = excluded.image_source_url, license_name = excluded.license_name, license_url = excluded.license_url", [first, url, credit, source, license, licenseUrl]);
      await illustration("https://images-assets.nasa.gov/image/a1/a1~medium.jpg", "https://images.nasa.gov/details/a1", "NASA media guidelines", "https://www.nasa.gov/nasa-brand-center/images-and-media/");
      await illustration("https://thumb.wikimedia.org/x.jpg", "https://commons.wikimedia.org/wiki/File:X.jpg", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "Jane Doe");
      await expect(illustration("https://images-assets.nasa.gov/image/a1/a1~medium.jpg", "https://commons.wikimedia.org/wiki/File:X.jpg", "Public domain", null)).rejects.toThrow();
      await expect(illustration("https://images-assets.nasa.gov/image/a1/a1~medium.jpg", "https://images.nasa.gov/details/a1", "NASA media guidelines", "https://www.nasa.gov/nasa-brand-center/images-and-media/", "Intuitive Machines")).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);
});
