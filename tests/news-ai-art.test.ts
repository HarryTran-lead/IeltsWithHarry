import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { AiArtLimitError, aiArtPrompt, aiArtSeed, aiArtSlots, generateAiArt } from "../src/lib/news/ai-art";

const id = "3f2b6c1e-8a4d-4c2e-9b1f-0a1b2c3d4e5f";
const jpeg = (size = 20_000) => new Response(new Uint8Array(size), { status: 200, headers: { "content-type": "image/jpeg" } });

describe("AI illustration fallback", () => {
  afterEach(() => { delete process.env.POLLINATIONS_API_KEY; });

  it("describes the story's subject without text, logos or real people", () => {
    const prompt = aiArtPrompt("NASA&#8217;s X-59 Aircraft and Test Pilot", "supersonic test aircraft");
    expect(prompt).toContain("supersonic test aircraft");
    expect(prompt).toContain("NASA’s X-59 Aircraft");
    expect(prompt).not.toContain("&#8217;");
    expect(prompt).toMatch(/no recognizable real people/);
    expect(aiArtPrompt("Coral reefs recover", "")).toContain("about Coral reefs recover");
  });

  it("uses a stable seed per article", () => {
    expect(aiArtSeed(id)).toBe(aiArtSeed(id));
    expect(aiArtSeed(id)).not.toBe(aiArtSeed(id.replace("3f", "4f")));
  });

  it("generates one image per run on the free tier and three with a key", () => {
    expect(aiArtSlots()).toBe(1);
    process.env.POLLINATIONS_API_KEY = "sk_test";
    expect(aiArtSlots()).toBe(3);
  });

  it("requests a 16:9 image and returns its bytes", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => { urls.push(String(url)); return jpeg(); }) as typeof fetch;
    const art = await generateAiArt("Diesel spill fine", "diesel fuel spill", id, fetcher);
    expect(urls[0]).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
    expect(urls[0]).toContain("width=960");
    expect(urls[0]).toContain("height=540");
    expect(urls[0]).toContain("nologo=true");
    expect(art).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
    expect(art.bytes.length).toBe(20_000);
  });

  it("uses the keyed endpoint with a bearer token when a key is set", async () => {
    process.env.POLLINATIONS_API_KEY = "sk_test";
    let auth = ""; let href = "";
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => { href = String(url); auth = new Headers(init?.headers).get("authorization") ?? ""; return jpeg(); }) as typeof fetch;
    await generateAiArt("Diesel spill fine", "diesel fuel spill", id, fetcher);
    expect(href).toMatch(/^https:\/\/gen\.pollinations\.ai\/image\//);
    expect(auth).toBe("Bearer sk_test");
  });

  it("reports the free limit so the article waits instead of failing", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: { code: "FREE_LIMIT" } }), { status: 402 })) as typeof fetch;
    await expect(generateAiArt("t", "coral reef", id, fetcher)).rejects.toBeInstanceOf(AiArtLimitError);
  });

  it("rejects responses that are not a usable image", async () => {
    const html = (async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    await expect(generateAiArt("t", "coral reef", id, html)).rejects.toThrow("no image");
    const tiny = (async () => jpeg(100)) as typeof fetch;
    await expect(generateAiArt("t", "coral reef", id, tiny)).rejects.toThrow("unexpected size");
  });
});

const chain = ["202610240001_foundation.sql", "202610240002_notebook.sql", "202610240007_daily_news.sql", "202610240008_news_practice_samples.sql", "202610240010_news_read_completion.sql", "202610240011_news_preferences.sql", "202610240012_nasa_article_reader.sql", "202610240013_noaa_full_text.sql", "202610250001_news_article_reads.sql", "202610250002_news_article_images.sql", "202610250003_news_translation_quota.sql", "202610250004_news_archive.sql", "202610250008_news_preview_images.sql", "202610250010_news_enrichment.sql", "202610250011_news_enrichment_claim_fix.sql", "202610250012_news_illustration_credit.sql", "202610250013_news_creative_commons_images.sql", "202610250014_news_admin_controls.sql", "202610250015_news_manual_quiz_reset.sql", "202610250016_news_full_text_sources.sql", "202610250017_news_ielts_question_types.sql", "202610250018_news_open_licence_sources.sql", "202610250019_news_readable_only.sql", "202610250020_news_ai_vietnam_rewrites.sql", "202610250021_news_detailed_explanations.sql", "202610250022_news_ai_checked_images.sql", "202610260014_news_images_before_quizzes.sql", "202610260017_news_practice_history.sql"];

describe("AI illustration migration", () => {
  it("stores AI illustrations from our bucket only and re-queues stories that found no photo", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
        create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
      for (const name of chain) {
        if (name.includes("007")) await db.exec(readFileSync(resolve("supabase/seed.sql"), "utf8"));
        await db.exec(readFileSync(resolve("supabase/migrations", name), "utf8"));
      }
      const source = (await db.query<{ id: string }>("select id from public.news_sources where feed_url='https://www.nasa.gov/news-release/feed/'")).rows[0].id;
      const add = async (letter: string) => (await db.query<{ id: string }>("insert into public.news_articles(source_id,provider,canonical_hash,title,canonical_url,publisher,category,published_at,publication_status) values ($1,'rss',repeat($2,64),'An illustrated test article','https://www.nasa.gov/news-release/' || $2 || '/','NASA','Science',now(),'published') returning id", [source, letter])).rows[0].id;
      const [noPhoto, found] = [await add("a"), await add("b")];
      await db.query("insert into public.news_enrichment_attempts(article_id,kind,status,retry_after) values ($1,'image','none',now() + interval '7 days'), ($2,'image','success',now() + interval '7 days')", [noPhoto, found]);
      await db.exec(readFileSync(resolve("supabase/migrations/202610260018_news_ai_generated_illustrations.sql"), "utf8"));

      expect((await db.query<{ public: boolean }>("select public from storage.buckets where id = 'news-ai-illustrations'")).rows[0].public).toBe(true);
      const attempts = (await db.query<{ article_id: string; ai_art_pending: boolean; due: boolean }>("select article_id, ai_art_pending, retry_after <= now() as due from public.news_enrichment_attempts")).rows;
      expect(attempts.find((row) => row.article_id === noPhoto)).toMatchObject({ ai_art_pending: true, due: true });
      expect(attempts.find((row) => row.article_id === found)).toMatchObject({ ai_art_pending: false, due: false });

      const insert = (article: string, url: string, source = "https://pollinations.ai/", license = "AI-generated") => db.query(
        "insert into public.news_auto_illustrations(article_id,image_url,image_alt,image_credit,image_source_url,license_name,license_url) values ($1,$2,'Ảnh minh họa do AI tạo: rocket','AI (Pollinations.ai)',$3,$4,null)", [article, url, source, license]);
      await expect(insert(noPhoto, `https://example.com/storage/v1/object/public/user-avatars/${noPhoto}.jpg`)).rejects.toThrow();
      await expect(insert(noPhoto, `https://abc.supabase.co/storage/v1/object/public/news-ai-illustrations/${noPhoto}.jpg`, "https://pollinations.ai/", "CC0")).rejects.toThrow();
      await insert(noPhoto, `https://abc.supabase.co/storage/v1/object/public/news-ai-illustrations/${noPhoto}.jpg`);
      const catalog = (await db.query<{ illustration_source_url: string; illustration_license: string }>("select illustration_source_url, illustration_license from public.news_archive_catalog where id = $1", [noPhoto])).rows[0];
      expect(catalog).toEqual({ illustration_source_url: "https://pollinations.ai/", illustration_license: "AI-generated" });
    } finally { await db.close(); }
  }, 30000);
});
