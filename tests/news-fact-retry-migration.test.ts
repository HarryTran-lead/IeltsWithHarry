import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("retries recent source and passage-shape failures without clearing rights rejections", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.news_skipped_urls (canonical_hash text, reason text, detail text, skipped_at timestamptz);
      insert into public.news_skipped_urls values
        ('source', 'ai_rewrite', 'Insufficient independent primary-source facts', now()),
        ('shape', 'ai_rewrite', 'The factual dossier did not support a complete independent article (words=425)', now()),
        ('old', 'ai_rewrite', 'Insufficient independent primary-source facts', now() - interval '4 days'),
        ('rights', 'copyright', 'Rights missing', now()),
        ('review', 'ai_rewrite', 'The article failed factual or originality review', now());`);
    await db.exec(readFileSync(resolve("supabase/migrations/202611110099_retry_vietnam_fact_leads.sql"), "utf8"));
    const remaining = await db.query<{ canonical_hash: string }>("select canonical_hash from public.news_skipped_urls order by canonical_hash");
    expect(remaining.rows.map((row) => row.canonical_hash)).toEqual(["old", "review", "rights"]);
  } finally {
    await db.close();
  }
}, 15000);
