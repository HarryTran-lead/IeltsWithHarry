import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const chain = ["202610240001_foundation.sql", "202610240002_notebook.sql", "202610240007_daily_news.sql", "202610240008_news_practice_samples.sql", "202610240010_news_read_completion.sql", "202610240011_news_preferences.sql", "202610240012_nasa_article_reader.sql", "202610240013_noaa_full_text.sql", "202610250001_news_article_reads.sql", "202610250002_news_article_images.sql", "202610250003_news_translation_quota.sql", "202610250004_news_archive.sql", "202610250008_news_preview_images.sql", "202610250010_news_enrichment.sql", "202610250011_news_enrichment_claim_fix.sql", "202610250012_news_illustration_credit.sql", "202610250013_news_creative_commons_images.sql", "202610250014_news_admin_controls.sql", "202610250015_news_manual_quiz_reset.sql", "202610250016_news_full_text_sources.sql", "202610250017_news_ielts_question_types.sql", "202610250018_news_open_licence_sources.sql"];

async function migratedDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;`);
  for (const name of chain) {
    if (name.includes("007")) await db.exec(readFileSync(resolve("supabase/seed.sql"), "utf8"));
    await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
  }
  return db;
}

describe("Daily News IELTS question sets", () => {
  it("publishes twenty mixed questions and grades written answers leniently", async () => {
    const db = await migratedDb();
    try {
      const source = (await db.query<{ id: string }>("select id from public.news_sources where feed_url='https://www.nasa.gov/news-release/feed/'")).rows[0].id;
      const article = (await db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',repeat('d',64),'Heat shield test','https://www.nasa.gov/news-release/heat/','NASA','Science',now(),'published') returning id", [source])).rows[0].id;
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url) values ($1,repeat('Engineers measured the heat shield during the flight. ',60),repeat('NASA media guidelines reviewed ',2),'https://www.nasa.gov/news-release/heat/')", [article]);
      const evidence = { supporting_sentence: "Engineers measured the heat shield during the flight.", explanation: "The sentence says so." };
      const questions = [
        ...Array.from({ length: 6 }, (_, i) => ({ type: "tfng", prompt: `TFNG statement ${i}`, options: ["True", "False", "Not Given"], correct_index: i % 3, accepted_answers: null, ...evidence })),
        ...Array.from({ length: 6 }, (_, i) => ({ type: "mcq", prompt: `Multiple choice ${i}`, options: ["a", "b", "c", "d"], correct_index: 1, accepted_answers: null, ...evidence })),
        ...Array.from({ length: 8 }, (_, i) => ({ type: i < 4 ? "sentence_completion" : "short_answer", prompt: `Written ${i} ______`, options: [], correct_index: null, accepted_answers: ["the heat shield"], ...evidence })),
      ];
      expect((await db.query<{ ok: boolean }>("select public.news_publish_auto_quiz($1,'test',$2::jsonb) as ok", [article, JSON.stringify(questions)])).rows[0].ok).toBe(true);
      expect((await db.query<{ question_count: number }>("select question_count from public.news_auto_quiz_sets where article_id=$1", [article])).rows[0].question_count).toBe(20);
      await expect(db.query("insert into public.news_auto_questions(article_id,sort_order,question_type,prompt,options,supporting_sentence) values ($1,25,'tfng','A bad TFNG row','[\"Yes\",\"No\",\"Maybe\"]',$2)", [article, evidence.supporting_sentence])).rejects.toThrow();

      const ids = (await db.query<{ id: string; question_type: string; sort_order: number }>("select id, question_type, sort_order from public.news_auto_questions where article_id=$1 order by sort_order", [article])).rows;
      const answers = Object.fromEntries(ids.map((row) => [row.id,
        row.question_type === "tfng" ? row.sort_order % 3 : row.question_type === "mcq" ? 1 : row.sort_order === 12 ? "Heat-Shield!" : row.sort_order === 13 ? "wrong words" : "THE HEAT SHIELD"]));
      const user = "33333333-3333-4333-8333-333333333333";
      await db.query("insert into auth.users(id) values ($1)", [user]);
      await db.exec(`set request.jwt.claim.sub = '${user}'`);
      const graded = (await db.query<{ result: { score: number; total: number; review: { correct: boolean; acceptedAnswers: string[] | null }[] } }>("select public.news_submit_auto_quiz($1,$2::jsonb) as result", [article, JSON.stringify(answers)])).rows[0].result;
      expect(graded).toMatchObject({ score: 19, total: 20 });
      expect(graded.review[13]).toMatchObject({ correct: false, acceptedAnswers: ["the heat shield"] });
      expect((await db.query<{ total: number }>("select total from public.news_auto_attempts where article_id=$1", [article])).rows[0].total).toBe(20);
      const partial = Object.fromEntries(Object.entries(answers).slice(0, 19));
      await expect(db.query("select public.news_submit_auto_quiz($1,$2::jsonb)", [article, JSON.stringify(partial)])).rejects.toThrow(/Answer every question/);
    } finally { await db.close(); }
  }, 30000);
});

describe("Daily News full-text and illustration sources migration", () => {
  it("accepts science.nasa.gov bodies, NASA Library illustrations and claims Ocean Service pages once", async () => {
    const db = await migratedDb();
    try {
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.news_sources where enabled and (feed_url like 'https://www.gov.uk/%' or feed_url in ('https://globalvoices.org/feed/','https://www.nasa.gov/feed/'))")).rows[0].count).toBe(7);
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
