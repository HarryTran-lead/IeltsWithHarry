import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { assertApprovedFeedUrl, canonicalUrl, gdeltProvider, newsHash, normalizeGdelt, parseNasaNewsBodies, parseNoaaNewsBodies, parsePublishedDate, parseRss, parseRssImages, rssProvider, type NewsSource } from "../src/lib/news/providers";
import { nextWordReview } from "../src/lib/news/review";
import { recommendReadings } from "../src/lib/news/recommend";

const source: NewsSource = { id: "11111111-1111-4111-8111-111111111111", name: "NASA", provider: "rss", feed_url: "https://www.nasa.gov/news-release/feed/", category: "Science", policy_status: "METADATA_ONLY", reviewed_basis: "NASA official RSS feed reviewed", attribution_text: "NASA", auto_publish: true, enabled: true, etag: null, last_modified: null, min_interval_minutes: 30, archive_next_page: 2 };
const xml = `<rss version="2.0"><channel><title>NASA</title><item><title>New science mission announced</title><link>https://www.nasa.gov/news/mission/?utm_source=test</link><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate><guid>mission-1</guid><description>Third-party text is intentionally ignored.</description></item></channel></rss>`;

describe("news providers", () => {
  it("ranks unread lessons by saved preferences and recent study evidence", () => {
    const items = [
      { id: "science", stage_id: "foundation", category: "Science", created_at: "2026-10-24T00:00:00Z" },
      { id: "tech", stage_id: "elementary", category: "Technology", created_at: "2026-10-23T00:00:00Z" },
    ];
    expect(recommendReadings(items, { stage_id: "elementary", topics: ["Technology"] }, [{ article_id: "science", completed_at: "2026-10-24T01:00:00Z" }], null, [{ article_id: "tech", word: "device" }], ["device"])[0].id).toBe("tech");
    expect(recommendReadings(items, { stage_id: null, topics: [] }, [], { article_id: "science", score: 5, total: 5 }, [], [])[0].id).toBe("tech");
  });
  it("schedules saved vocabulary reviews without duplicate intervals", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const first = nextWordReview(undefined,"good",now);
    expect(first.interval_days).toBe(1);
    expect(nextWordReview({notebook_entry_id:"x",...first},"good",now).interval_days).toBe(2);
    expect(nextWordReview({notebook_entry_id:"x",...first},"again",now).interval_days).toBe(1);
    expect(nextWordReview({notebook_entry_id:"x",...first},"again",now).due_at).toBe("2026-10-25T12:00:00.000Z");
  });
  it("parses dates to UTC and rejects invalid future dates", () => {
    expect(parsePublishedDate("20261023120000")).toBe("2026-10-23T12:00:00.000Z");
    expect(parsePublishedDate("not a date")).toBeNull();
    expect(parsePublishedDate("29990101000000")).toBeNull();
  });
  it("parses RSS and Atom metadata without copying the body", () => {
    const rss = parseRss(xml, source);
    expect(rss).toHaveLength(1);
    expect(rss[0]).toMatchObject({ title: "New science mission announced", published_at: "2026-10-23T12:00:00.000Z", publication_status: "published", metadata: {} });
    expect(rss[0].canonical_url).not.toContain("utm_source");
    const atom = `<feed><entry><title>Science update for students</title><link href="https://www.nasa.gov/news/students/" rel="alternate"/><updated>2026-10-23T12:00:00Z</updated><content>Do not save full text</content></entry></feed>`;
    expect(parseRss(atom, source)[0].title).toBe("Science update for students");
    expect(() => parseRss("<!DOCTYPE rss><rss/>", source)).toThrow();
    expect(parseRss(xml.replace("Third-party text is intentionally ignored.", "<![CDATA[<!DOCTYPE html><p>Historic article markup</p>]]>"), source)).toHaveLength(1);
  });
  it("keeps the older entries nested in the NOAA Ocean Service archive feed", () => {
    const archive = `<rss><channel><item><title>New ocean finding</title><link>https://oceanservice.noaa.gov/news/new.html</link><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate></item><item><item><title>Ocean discovery from 2013</title><link>https://oceanservice.noaa.gov/news/old.html</link><pubDate>Wed, 02 Jan 2013 18:03:20 GMT</pubDate></item></item></channel></rss>`;
    expect(parseRss(archive, source).map((item) => item.published_at.slice(0, 4))).toEqual(["2026", "2013"]);
  });
  it("fetches a numbered NASA archive page without reusing the latest feed cache", async () => {
    const mock = vi.fn(async (url: URL, init: RequestInit) => { void url; void init; return new Response(xml, { status: 200 }); });
    const result = await rssProvider.fetch({ ...source, etag: '"latest"' }, mock as unknown as typeof fetch, 25);
    expect(result.items).toHaveLength(1);
    expect(String(mock.mock.calls[0][0])).toContain("paged=25");
    expect((mock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("If-None-Match");
    await expect(rssProvider.fetch(source, mock as unknown as typeof fetch, 4001)).rejects.toThrow();
  });
  it("copies only eligible NASA news-release text and strips markup", () => {
    const passage = "NASA announced a new mission to study the Moon and share its findings with students around the world. ".repeat(4);
    const feed = `<rss><channel><item><title>NASA announces a new mission</title><link>https://www.nasa.gov/news-release/new-mission/</link><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate><content:encoded><![CDATA[<script>danger()</script><p>${passage}</p>]]></content:encoded></item><item><title>Outside NASA release</title><link>https://science.nasa.gov/image-article/example/</link><content:encoded><![CDATA[<p>${passage}</p>]]></content:encoded></item></channel></rss>`;
    const bodies = parseNasaNewsBodies(feed, source);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].body_text).toContain("NASA announced");
    expect(bodies[0].body_text).not.toContain("danger()");
    expect(parseNasaNewsBodies(feed, { ...source, feed_url: "https://science.nasa.gov/feed/" })).toHaveLength(0);
    expect(parseNasaNewsBodies(feed.replace(passage, `${passage} Copyright third party`), source)).toHaveLength(0);
  });
  it("reads NOAA-authored text from its official RSS and excludes third-party notices", () => {
    const noaa = { ...source, name: "NOAA News", feed_url: "https://www.noaa.gov/rss.xml" };
    const passage = "NOAA researchers measured the ocean and explained how changing water temperatures can affect weather across the coast. ".repeat(4);
    const figure = `<figure><img src="https://www.noaa.gov/sites/default/files/ocean.jpg" alt="NOAA researcher measuring ocean water"><figcaption>Ocean research. (Image credit: NOAA)</figcaption></figure>`;
    const feed = `<rss><channel><item><title>Ocean research update</title><link>https://www.noaa.gov/news-release/ocean-research-update</link><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[${figure}<div class="c-field--name-field-body-formatted-long"><script>bad()</script><p>${passage}</p></div>]]></description></item></channel></rss>`;
    const bodies = parseNoaaNewsBodies(feed, noaa);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].body_text).toContain("NOAA researchers");
    expect(bodies[0].body_text).not.toContain("bad()");
    expect(bodies[0]).toMatchObject({image_url:"https://www.noaa.gov/sites/default/files/ocean.jpg",image_credit:"NOAA"});
    expect(parseNoaaNewsBodies(feed.replace("(Image credit: NOAA)","(Image credit: Smith Media)"), noaa)[0].image_url).toBeNull();
    expect(parseNoaaNewsBodies(feed.replace("www.noaa.gov/sites/default/files/ocean.jpg","other.example/ocean.jpg"), noaa)[0].image_url).toBeNull();
    expect(parseNoaaNewsBodies(feed.replace(passage, `${passage} © Reuters`), noaa)).toHaveLength(0);
  });
  it("syncs only agency-hosted and credited preview images from approved feeds", () => {
    const nasaFigure = `<figure><img src="https://assets.science.nasa.gov/dynamicimage/assets/nasa-mission.jpg" alt="A NASA spacecraft above Earth"><figcaption>Spacecraft in orbit</figcaption><div class="hds-credits">NASA</div></figure>`;
    const nasaFeed = `<rss><channel><item><title>NASA spacecraft reaches orbit</title><link>https://www.nasa.gov/news-release/spacecraft/</link><description><![CDATA[${nasaFigure}]]></description></item></channel></rss>`;
    expect(parseRssImages(nasaFeed, source)).toMatchObject([{image_credit:"NASA",image_url:"https://assets.science.nasa.gov/dynamicimage/assets/nasa-mission.jpg"}]);
    expect(parseRssImages(nasaFeed.replace("<div class=\"hds-credits\">NASA</div>","<div class=\"hds-credits\">SpaceX</div>"),source)).toHaveLength(0);
    const ocean = { ...source, feed_url: "https://oceanservice.noaa.gov/rss/nosnews.xml" };
    const oceanFeed = `<rss><channel><item><title>New coastal research</title><link>https://oceanservice.noaa.gov/news/coastal-research.html</link><description><![CDATA[<img src="https://oceanservice.noaa.gov/news/coastal-research.jpg" alt="A NOAA scientist studying the coast">]]></description></item></channel></rss>`;
    expect(parseRssImages(oceanFeed,ocean)).toMatchObject([{image_credit:"NOAA National Ocean Service",image_url:"https://oceanservice.noaa.gov/news/coastal-research.jpg"}]);
    expect(parseRssImages(oceanFeed.replace("<img ","(Image credit: Getty Images) <img "),ocean)).toHaveLength(0);
    expect(parseRssImages(oceanFeed,{...ocean,feed_url:"https://www.nsf.gov/rss/news.xml"})).toHaveLength(0);
  });
  it("normalizes GDELT English results and holds sensitive titles for review", () => {
    const gdelt = { ...source, provider: "gdelt" as const };
    const rows = normalizeGdelt({ articles: [
      { url: "https://example.org/science", title: "Science students build a new garden", seendate: "20261023120000", domain: "example.org", language: "English", fullText: "must not be copied" },
      { url: "https://example.org/war", title: "War attack hits town center", seendate: "20261023120000", domain: "example.org", language: "English" },
      { url: "https://example.org/fr", title: "French-language result", seendate: "20261023120000", domain: "example.org", language: "French" },
    ] }, gdelt);
    expect(rows).toHaveLength(2);
    expect(rows[0].metadata).toEqual({});
    expect(rows[1]).toMatchObject({ sensitive: true, publication_status: "review" });
  });
  it("deduplicates tracking URLs and restricts RSS hosts", () => {
    expect(newsHash(canonicalUrl("https://www.nasa.gov/news/mission/?utm_source=x")!)).toBe(newsHash(canonicalUrl("https://www.nasa.gov/news/mission/")!));
    expect(() => assertApprovedFeedUrl("https://127.0.0.1/private")).toThrow();
    expect(() => assertApprovedFeedUrl("https://evil.example/feed.xml")).toThrow();
    expect(() => assertApprovedFeedUrl("http://www.nasa.gov/feed/")).toThrow();
  });
  it("handles conditional RSS responses, rate limits and blocked redirects", async () => {
    const unchanged = vi.fn(async () => new Response(null, { status: 304 }));
    expect((await rssProvider.fetch(source, unchanged as unknown as typeof fetch)).notModified).toBe(true);
    const rateLimited = vi.fn(async () => new Response("Slow down", { status: 429 }));
    await expect(gdeltProvider.fetch({ ...source, provider: "gdelt" }, rateLimited as unknown as typeof fetch)).rejects.toThrow("429");
    expect(rateLimited).toHaveBeenCalledTimes(3);
    const transient = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response(xml, { status: 200 }));
    expect((await rssProvider.fetch(source, transient as unknown as typeof fetch)).items).toHaveLength(1);
    expect(transient).toHaveBeenCalledTimes(2);
    const redirected = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    await expect(rssProvider.fetch(source, redirected as unknown as typeof fetch)).rejects.toThrow("redirect blocked");
  });
});

describe("news database permissions and grading", () => {
  it("seeds all seven stages, protects private rows, grades once per attempt, and avoids duplicate XP", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
      for (const name of ["202610240001_foundation.sql", "202610240002_notebook.sql", "202610240007_daily_news.sql", "202610240008_news_practice_samples.sql", "202610240010_news_read_completion.sql", "202610240011_news_preferences.sql", "202610240012_nasa_article_reader.sql", "202610240013_noaa_full_text.sql", "202610250001_news_article_reads.sql", "202610250002_news_article_images.sql", "202610250003_news_translation_quota.sql", "202610250004_news_archive.sql", "202610250008_news_preview_images.sql"]) {
        if (name.includes("007")) await db.exec(readFileSync(resolve("supabase/seed.sql"), "utf8"));
        await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
      }
      expect((await db.query<{ count:number }>("select count(*)::int as count from public.news_learning_articles where published")).rows[0].count).toBe(7);
      expect((await db.query<{ count:number }>("select count(*)::int as count from public.news_questions")).rows[0].count).toBe(35);
      const alice="11111111-1111-4111-8111-111111111111",bob="22222222-2222-4222-8222-222222222222";
      await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,'{}'),($2,'{}')",[alice,bob]);
      const imported=(await db.query<{id:string}>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) select id,'rss',repeat('a',64),'A safe NASA reading','https://www.nasa.gov/news-release/test-reading/','NASA','Science',now(),'published' from public.news_sources where feed_url='https://www.nasa.gov/news-release/feed/' returning id")).rows[0];
      await db.query("insert into public.news_article_bodies(article_id,body_text,rights_basis,source_url) values ($1,repeat('NASA article text. ',20),repeat('rights reviewed ',3),'https://www.nasa.gov/news-release/test-reading/')",[imported.id]);
      await expect(db.query("update public.news_article_bodies set image_url='https://example.com/x.jpg',image_alt='Example image',image_credit='NASA',image_rights_basis=repeat('rights reviewed ',3) where article_id=$1",[imported.id])).rejects.toThrow();
      await db.query("insert into public.news_article_images(article_id,source_url,image_url,image_alt,image_credit,image_rights_basis) values ($1,'https://www.nasa.gov/news-release/test-reading/','https://assets.science.nasa.gov/dynamicimage/assets/nasa-mission.jpg','A NASA spacecraft above Earth','NASA',repeat('NASA imagery reviewed ',3))",[imported.id]);
      expect((await db.query<{image_url:string}>("select image_url from public.news_archive_catalog where id=$1",[imported.id])).rows[0].image_url).toContain("assets.science.nasa.gov");
      await expect(db.query("update public.news_article_images set image_url='https://example.com/unapproved.jpg' where article_id=$1",[imported.id])).rejects.toThrow();
      const article=(await db.query<{id:string}>("select id from public.news_learning_articles where slug='technology-changing-education'")).rows[0];
      const questions=(await db.query<{id:string;correct_answer:string}>("select q.id,k.correct_answer from public.news_questions q join public.news_answer_keys k on k.question_id=q.id where q.article_id=$1 order by q.sort_order",[article.id])).rows;
      const answers=Object.fromEntries(questions.map((q)=>[q.id,q.correct_answer]));
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}';`);
      expect((await db.query<{new_read:boolean}>("select public.news_mark_article_read($1) as new_read",[imported.id])).rows[0].new_read).toBe(true);
      expect((await db.query<{new_read:boolean}>("select public.news_mark_article_read($1) as new_read",[imported.id])).rows[0].new_read).toBe(false);
      expect((await db.query("select * from public.user_news_article_reads")).rows).toHaveLength(1);
      for (let claim = 0; claim < 6; claim++) expect((await db.query<{allowed:boolean}>("select public.news_claim_translation_quota(5000) as allowed")).rows[0].allowed).toBe(true);
      expect((await db.query<{allowed:boolean}>("select public.news_claim_translation_quota(1) as allowed")).rows[0].allowed).toBe(false);
      expect((await db.query("select * from public.news_answer_keys")).rows).toEqual([]);
      await expect(db.query("insert into public.news_learning_articles(slug,title,category,stage_id,passage,rights_status,rights_basis) values ('learner-content','Learner content','Science','foundation',repeat('x',110),'ORIGINAL','Original by learner')")).rejects.toThrow();
      await db.query("select public.news_mark_read('technology-changing-education')");
      const word=(await db.query<{id:string}>("insert into public.notebook_entries(kind,title,meaning_vi) values ('word','tablet','máy tính bảng') returning id")).rows[0];
      await db.query("insert into public.user_word_reviews(notebook_entry_id) values ($1)",[word.id]);
      await db.query("select public.news_finish_read('technology-changing-education')");
      await db.query("select public.news_finish_read('technology-changing-education')");
      expect((await db.query<{xp_awarded:number}>("select xp_awarded from public.user_news_progress")).rows[0].xp_awarded).toBe(5);
      await db.query("insert into public.study_tasks(title,skill,due_date,lesson_slug) values ('Read news','Reading','2026-10-24','news:technology-changing-education')");
      const first=await db.query<{result:{score:number;total:number}}>("select public.news_submit_quiz($1,$2::jsonb) as result",["technology-changing-education",JSON.stringify(answers)]);
      expect(first.rows[0].result).toMatchObject({score:5,total:5});
      await db.query("select public.news_submit_quiz($1,$2::jsonb)",["technology-changing-education",JSON.stringify(answers)]);
      expect((await db.query<{xp_awarded:number}>("select xp_awarded from public.user_news_progress")).rows[0].xp_awarded).toBe(25);
      expect((await db.query<{completed:boolean}>("select completed from public.study_tasks where lesson_slug='news:technology-changing-education'")).rows[0].completed).toBe(true);
      await db.query("insert into public.user_saved_news(article_id) values ($1) on conflict do nothing",[article.id]).catch(()=>undefined);
      await db.exec(`set request.jwt.claim.sub='${bob}';`);
      expect((await db.query("select * from public.user_news_article_reads")).rows).toEqual([]);
      expect((await db.query("select * from public.user_news_progress")).rows).toEqual([]);
      expect((await db.query("select * from public.news_reading_attempts")).rows).toEqual([]);
      expect((await db.query("select * from public.user_word_reviews")).rows).toEqual([]);
      await expect(db.query("insert into public.user_word_reviews(notebook_entry_id) values ($1)",[word.id])).rejects.toThrow();
      await expect(db.query("select public.admin_save_news_question(null,$1,'main_idea','Unauthorized question','[]'::jsonb,'Answer','','')",[article.id])).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);
});
