import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("retries recent 300–399 word drafts while retaining thinner and rights rejections", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.news_skipped_urls (canonical_hash text, reason text, detail text, skipped_at timestamptz);
      insert into public.news_skipped_urls values
        ('near', 'ai_rewrite', 'The factual dossier did not support a complete independent article (words=354, paragraphs=7)', now()),
        ('thin', 'ai_rewrite', 'The factual dossier did not support a complete independent article (words=280, paragraphs=6)', now()),
        ('old', 'ai_rewrite', 'The factual dossier did not support a complete independent article (words=374, paragraphs=8)', now() - interval '4 days'),
        ('rights', 'copyright', 'The factual dossier did not support a complete independent article (words=374, paragraphs=8)', now());`);
    await db.exec(readFileSync(resolve("supabase/migrations/202611110250_retry_near_complete_news.sql"), "utf8"));
    const remaining = await db.query<{ canonical_hash: string }>("select canonical_hash from public.news_skipped_urls order by canonical_hash");
    expect(remaining.rows.map((row) => row.canonical_hash)).toEqual(["old", "rights", "thin"]);
  } finally {
    await db.close();
  }
}, 15000);
