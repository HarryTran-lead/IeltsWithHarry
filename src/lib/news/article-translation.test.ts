import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { completeTranslation, nextTranslationBatch, translationPlan } from "./article-translation";

describe("stored news translations", () => {
  it("keeps a long paragraph and the following paragraph aligned across batches", () => {
    const source = `${"A".repeat(3000)}\n\nSecond paragraph.`;
    const { paragraphs, chunks } = translationPlan(source);
    expect(paragraphs).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.paragraph)).toEqual([0, 0, 1]);
    expect(nextTranslationBatch(chunks, 0)).toHaveLength(3);
    expect(nextTranslationBatch(chunks, 2)).toEqual([{ paragraph: 1, text: "Second paragraph." }]);
    expect(completeTranslation(chunks, ["Đầu", "cuối", "Đoạn hai"], 2)).toEqual(["Đầu cuối", "Đoạn hai"]);
    expect(completeTranslation(chunks, ["Đầu"], 2)).toBeNull();
  });

  it("preserves a translation on an unchanged feed upsert and clears it after an English edit", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table public.news_article_bodies (article_id uuid primary key, body_text text not null, ingested_at timestamptz not null default now())");
      const migration = await readFile(join(process.cwd(), "supabase/migrations/202611060004_news_article_translations.sql"), "utf8");
      await db.exec(migration);
      const id = "00000000-0000-4000-8000-000000000001";
      await db.query("insert into public.news_article_bodies(article_id,body_text) values ($1,$2)", [id, "Original paragraph."]);
      await db.query("update public.news_article_bodies set translation_vi=$1 where article_id=$2", [["Đoạn gốc."], id]);
      await db.query("insert into public.news_article_bodies(article_id,body_text) values ($1,$2) on conflict(article_id) do update set body_text=excluded.body_text,translation_vi=excluded.translation_vi,translation_vi_draft=excluded.translation_vi_draft", [id, "Original paragraph."]);
      let row = await db.query<{ translation_vi: string[] | null }>("select translation_vi from public.news_article_bodies where article_id=$1", [id]);
      expect(row.rows[0].translation_vi).toEqual(["Đoạn gốc."]);
      await db.query("update public.news_article_bodies set body_text=$1 where article_id=$2", ["Edited paragraph.", id]);
      row = await db.query<{ translation_vi: string[] | null }>("select translation_vi from public.news_article_bodies where article_id=$1", [id]);
      expect(row.rows[0].translation_vi).toBeNull();
      await db.query("update public.news_article_bodies set translation_vi_draft=$1 where article_id=$2", [["Đoạn đang dịch"], id]);
      await db.query("insert into public.news_article_bodies(article_id,body_text) values ($1,$2) on conflict(article_id) do update set body_text=excluded.body_text,translation_vi_draft=excluded.translation_vi_draft", [id, "Edited paragraph."]);
      const draft = await db.query<{ translation_vi_draft: string[] }>("select translation_vi_draft from public.news_article_bodies where article_id=$1", [id]);
      expect(draft.rows[0].translation_vi_draft).toEqual(["Đoạn đang dịch"]);
    } finally {
      await db.close();
    }
  }, 20_000);
});
