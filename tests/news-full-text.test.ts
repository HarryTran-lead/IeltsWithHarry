import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const chain = ["202610240001_foundation.sql", "202610240002_notebook.sql", "202610240007_daily_news.sql", "202610240008_news_practice_samples.sql", "202610240010_news_read_completion.sql", "202610240011_news_preferences.sql", "202610240012_nasa_article_reader.sql", "202610240013_noaa_full_text.sql", "202610250001_news_article_reads.sql", "202610250002_news_article_images.sql", "202610250003_news_translation_quota.sql", "202610250004_news_archive.sql", "202610250008_news_preview_images.sql", "202610250010_news_enrichment.sql", "202610250011_news_enrichment_claim_fix.sql", "202610250012_news_illustration_credit.sql", "202610250013_news_creative_commons_images.sql", "202610250014_news_admin_controls.sql", "202610250015_news_manual_quiz_reset.sql", "202610250016_news_full_text_sources.sql", "202610250017_news_ielts_question_types.sql", "202610250018_news_open_licence_sources.sql", "202610250019_news_readable_only.sql", "202610250020_news_ai_vietnam_rewrites.sql", "202610250021_news_detailed_explanations.sql", "202610250022_news_ai_checked_images.sql", "202610260014_news_images_before_quizzes.sql", "202610260017_news_practice_history.sql"];

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

describe("Daily News readable-only archive", () => {
  it("prunes headline-only articles, remembers their links and waits for unread pages", async () => {
    const db = await migratedDb();
    try {
      const id = async (feed: string) => (await db.query<{ id: string }>("select id from public.news_sources where feed_url = $1", [feed])).rows[0].id;
      const nasa = await id("https://www.nasa.gov/news-release/feed/");
      const ocean = await id("https://oceanservice.noaa.gov/rss/nosnews.xml");
      const add = async (source: string, letter: string, url: string) => (await db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',repeat($2,64),'A readable test article',$3,'Agency','Science',now(),'published') returning id", [source, letter, url])).rows[0].id;
      const headlineOnly = await add(nasa, "1", "https://www.nasa.gov/news-release/headline-only/");
      const readable = await add(nasa, "2", "https://www.nasa.gov/news-release/readable/");
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url) values ($1,repeat('NASA article text for readers. ',20),repeat('NASA media guidelines reviewed ',2),'https://www.nasa.gov/news-release/readable/')", [readable]);
      const pagePending = await add(ocean, "3", "https://oceanservice.noaa.gov/news/pending.html");
      const pageEmpty = await add(ocean, "4", "https://oceanservice.noaa.gov/news/empty.html");
      await db.query("insert into public.news_enrichment_attempts(article_id,kind,status) values ($1,'body','none')", [pageEmpty]);

      expect((await db.query<{ removed: number }>("select public.news_prune_unreadable() as removed")).rows[0].removed).toBe(2);
      const left = (await db.query<{ id: string }>("select id from public.news_articles")).rows.map((row) => row.id);
      expect(left.sort()).toEqual([readable, pagePending].sort());
      expect(left).not.toContain(headlineOnly);
      expect((await db.query<{ canonical_hash: string }>("select canonical_hash from public.news_skipped_urls order by 1")).rows.map((row) => row.canonical_hash)).toEqual(["1".repeat(64), "4".repeat(64)]);
      expect((await db.query<{ enabled: boolean }>("select enabled from public.news_sources where feed_url='https://www.nsf.gov/rss/rss_www_news.xml'")).rows[0].enabled).toBe(false);
      // AI-rewrite sources and their settings.
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.news_sources where provider = 'ai_rewrite' and enabled")).rows[0].count).toBe(4);
      expect((await db.query<{ daily_rewrite_limit: number }>("select daily_rewrite_limit from public.news_admin_settings")).rows[0].daily_rewrite_limit).toBe(6);
      await db.query("insert into public.news_skipped_urls(canonical_hash, reason, detail) values (repeat('9',64), 'ai_rewrite', 'Fact-check UNSUPPORTED')");
      await expect(db.query("insert into public.news_skipped_urls(canonical_hash, reason) values (repeat('8',64), 'other')")).rejects.toThrow();
      expect((await db.query<{ ai_generated: boolean }>("select ai_generated from public.news_article_bodies where article_id = $1", [readable])).rows[0].ai_generated).toBe(false);
    } finally { await db.close(); }
  }, 30000);
});

describe("Daily News IELTS question sets", () => {
  it("publishes twenty mixed questions and grades written answers leniently", async () => {
    const db = await migratedDb();
    try {
      const source = (await db.query<{ id: string }>("select id from public.news_sources where feed_url='https://www.nasa.gov/news-release/feed/'")).rows[0].id;
      const article = (await db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',repeat('d',64),'Heat shield test','https://www.nasa.gov/news-release/heat/','NASA','Science',now(),'published') returning id", [source])).rows[0].id;
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url) values ($1,repeat('Engineers measured the heat shield during the flight. ',60),repeat('NASA media guidelines reviewed ',2),'https://www.nasa.gov/news-release/heat/')", [article]);
      const evidence = { supporting_sentence: "Engineers measured the heat shield during the flight.", explanation: "The sentence says so." };
      const questions = [
        ...Array.from({ length: 6 }, (_, i) => ({ type: "tfng", prompt: `TFNG statement ${i}`, options: ["True", "False", "Not Given"], correct_index: i % 3, accepted_answers: null, option_notes: ["Đúng vì bài nói vậy.", "Sai vì bài không phủ nhận.", "Sai vì bài có nhắc tới."], ...evidence })),
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
      expect((graded.review[0] as unknown as { optionNotes: string[] }).optionNotes).toEqual(["Đúng vì bài nói vậy.", "Sai vì bài không phủ nhận.", "Sai vì bài có nhắc tới."]);
      expect((graded.review[6] as unknown as { optionNotes: string[] | null }).optionNotes).toBeNull();
      expect((await db.query<{ total: number }>("select total from public.news_auto_attempts where article_id=$1", [article])).rows[0].total).toBe(20);
      const partial = Object.fromEntries(Object.entries(answers).slice(0, 19));
      await expect(db.query("select public.news_submit_auto_quiz($1,$2::jsonb)", [article, JSON.stringify(partial)])).rejects.toThrow(/Answer every question/);

      // A round of chosen question types is graded, saved with its breakdown and does not replace the full result.
      expect((await db.query<{ breakdown: Record<string, { correct: number; total: number }> }>("select breakdown from public.news_auto_attempts where article_id=$1", [article])).rows[0].breakdown)
        .toEqual({ tfng: { correct: 6, total: 6 }, mcq: { correct: 6, total: 6 }, sentence_completion: { correct: 3, total: 4 }, short_answer: { correct: 4, total: 4 } });
      const written = Object.fromEntries(ids.filter((row) => row.sort_order >= 12 && row.sort_order < 16).map((row) => [row.id, answers[row.id]]));
      const round = (await db.query<{ result: { score: number; total: number; partial: boolean; review: { id: string }[]; breakdown: object } }>("select public.news_submit_auto_practice($1,$2::jsonb,95) as result", [article, JSON.stringify(written)])).rows[0].result;
      expect(round).toMatchObject({ score: 3, total: 4, partial: true, breakdown: { sentence_completion: { correct: 3, total: 4 } } });
      expect(round.review.map((item) => item.id)).toEqual(ids.slice(12, 16).map((row) => row.id));
      const saved = (await db.query<{ partial: boolean; total: number; duration_seconds: number | null }>("select partial,total,duration_seconds from public.news_auto_attempts where article_id=$1 order by submitted_at, partial", [article])).rows;
      expect(saved).toEqual([{ partial: false, total: 20, duration_seconds: null }, { partial: true, total: 4, duration_seconds: 95 }]);
      const last = (await db.query<{ r: { score: number; total: number; attempts: number } }>("select public.news_auto_quiz_last_result($1) as r", [article])).rows[0].r;
      expect(last).toMatchObject({ score: 19, total: 20, attempts: 1 });
      await expect(db.query("select public.news_submit_auto_practice($1,$2::jsonb)", [article, JSON.stringify({ [ids[0].id]: 7 })])).rejects.toThrow(/Answer every question/);
      await expect(db.query("select public.news_submit_auto_practice($1,$2::jsonb)", [article, JSON.stringify({ [ids[12].id]: "   " })])).rejects.toThrow(/Answer every question/);
      await expect(db.query("select public.news_submit_auto_practice($1,$2::jsonb)", [article, JSON.stringify({ "00000000-0000-4000-8000-000000000000": 1 })])).rejects.toThrow(/Answer every question/);
      await expect(db.query("select public.news_submit_auto_practice($1,'{}'::jsonb)", [article])).rejects.toThrow(/Answer every question/);
    } finally { await db.close(); }
  }, 30000);
});

describe("Daily News full-text and illustration sources migration", () => {
  it("claims readable articles for images before their quiz is ready", async () => {
    const db = await migratedDb();
    try {
      const source = (await db.query<{ id: string }>("select id from public.news_sources where feed_url='https://www.nasa.gov/news-release/feed/'")).rows[0].id;
      const article = (await db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',repeat('f',64),'New telescope observes Earth','https://www.nasa.gov/news-release/telescope-earth/','NASA','Science',now(),'published') returning id", [source])).rows[0].id;
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url) values ($1,repeat('The telescope observed Earth from orbit. ',80),repeat('NASA media guidelines reviewed ',2),'https://www.nasa.gov/news-release/telescope-earth/')", [article]);
      const first = await db.query<{ article_id: string }>("select article_id from public.news_claim_enrichment('image', 1)");
      expect(first.rows.map((row) => row.article_id)).toContain(article);
      expect((await db.query<{ article_id: string }>("select article_id from public.news_claim_enrichment('image', 1)")).rows).toHaveLength(0);
    } finally { await db.close(); }
  }, 30000);

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
      await illustration("https://live.staticflickr.com/1/2_abc_b.jpg", "https://www.flickr.com/photos/jane/2", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/", "Jane Doe");
      await expect(illustration("https://live.staticflickr.com/1/2_abc_b.jpg", "https://www.flickr.com/photos/jane/2", "CC BY 2.0", null, "Jane Doe")).rejects.toThrow();
      await expect(illustration("https://images-assets.nasa.gov/image/a1/a1~medium.jpg", "https://commons.wikimedia.org/wiki/File:X.jpg", "Public domain", null)).rejects.toThrow();
      await expect(illustration("https://images-assets.nasa.gov/image/a1/a1~medium.jpg", "https://images.nasa.gov/details/a1", "NASA media guidelines", "https://www.nasa.gov/nasa-brand-center/images-and-media/", "Intuitive Machines")).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);
});
