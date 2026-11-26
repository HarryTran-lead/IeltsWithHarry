import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { GLOSSARY_LIMIT, MAX_TRANSLATION_BATCHES, applyReviewFixes, completeTranslation, mergeGlossary, nextTranslationBatch, shouldTryNextKey, splitSentences, translateRemaining, translationPlan } from "./article-translation";
import { AiQuotaError } from "./enrichment";
import { glossaryMeaning, selectionTranslation, sentenceFor, wordForms } from "./word-meaning";

describe("stored news translations", () => {
  it("splits sentences without breaking at abbreviations, initials or decimals", () => {
    expect(splitSentences("Dr. Smith met Mr. Jones in the U.S. on Monday. Prices rose 2.5% in Jan. last year! Was it worth it? \"Yes,\" she said."))
      .toEqual(["Dr. Smith met Mr. Jones in the U.S. on Monday.", "Prices rose 2.5% in Jan. last year!", "Was it worth it?", "\"Yes,\" she said."]);
    expect(splitSentences("  ")).toEqual([]);
    expect(splitSentences("word ".repeat(400)).every((part) => part.length <= 1500)).toBe(true);
  });

  it("keeps sentences aligned with their paragraphs and builds pairs for look-ups", () => {
    const { paragraphs, sentences } = translationPlan("One. Two.\n\nThree.");
    expect(paragraphs).toHaveLength(2);
    expect(sentences.map((sentence) => sentence.paragraph)).toEqual([0, 0, 1]);
    expect(nextTranslationBatch(sentences, 2)).toEqual([{ paragraph: 1, text: "Three." }]);
    expect(completeTranslation(sentences, ["Một.", "Hai.", "Ba."], 2)).toEqual({
      paragraphs: ["Một. Hai.", "Ba."],
      pairs: [[{ en: "One.", vi: "Một." }, { en: "Two.", vi: "Hai." }], [{ en: "Three.", vi: "Ba." }]],
    });
    expect(completeTranslation(sentences, ["Một."], 2)).toBeNull();
    expect(completeTranslation(sentences, ["Một.", " ", "Ba."], 2)).toBeNull();
  });

  it("caps a batch by sentence count and characters", () => {
    const many = Array.from({ length: 70 }, () => ({ paragraph: 0, text: "Short." }));
    expect(nextTranslationBatch(many, 0)).toHaveLength(60);
    const long = Array.from({ length: 5 }, () => ({ paragraph: 0, text: "y".repeat(1400) }));
    expect(nextTranslationBatch(long, 0)).toHaveLength(3);
  });

  it("finishes an article in one run and merges the glossary without duplicates", async () => {
    const sentences = Array.from({ length: 8 }, (_, index) => ({ paragraph: index, text: `${"x".repeat(1400)}.` }));
    let requests = 0;
    const run = await translateRemaining(sentences, [], async (texts) => {
      requests++;
      return { translations: texts.map(() => "Bản dịch"), glossary: [{ word: "Indicator", pos: "noun", vi: "chỉ số" }, { word: "indicator", pos: "noun", vi: "lặp" }, { word: "x", pos: "", vi: "" }], model: "m" };
    });
    expect(requests).toBe(MAX_TRANSLATION_BATCHES);
    expect(run.output).toHaveLength(8);
    expect(run.glossary).toEqual([{ word: "Indicator", pos: "noun", vi: "chỉ số" }]);
  });

  it("keeps finished batches when a later batch fails or returns too few sentences", async () => {
    const sentences = Array.from({ length: 8 }, (_, paragraph) => ({ paragraph, text: "y".repeat(2400) }));
    let requests = 0;
    const failing = await translateRemaining(sentences, [], async (texts) => {
      requests++;
      if (requests === 2) return { translations: texts.slice(1).map(() => "Thiếu"), glossary: [], model: "m" };
      return { translations: texts.map(() => "Đã dịch"), glossary: [], model: "m" };
    });
    expect(failing.output).toHaveLength(2);
    expect((failing.error as Error).message).toMatch(/thiếu câu/);
  });

  it("limits the glossary size and phrase length", () => {
    const many = Array.from({ length: GLOSSARY_LIMIT + 10 }, (_, index) => ({ word: `word${"abcdefghij"[index % 10]}${"abcdefghijklmnop"[Math.floor(index / 10)]}`, pos: "noun", vi: "nghĩa" }));
    expect(mergeGlossary([], many)).toHaveLength(GLOSSARY_LIMIT);
    expect(mergeGlossary([], [{ word: "a very long five word phrase", pos: "phrase", vi: "cụm" }])).toEqual([]);
  });

  it("applies an editor's fixes by sentence id and ignores malformed ones", () => {
    const { output, changed } = applyReviewFixes(["Một.", "Hai.", "Ba."], [{ id: "2", vi: "Hai (đã sửa)." }, { id: "9", vi: "x" }, { id: "1", vi: " " }, { id: "3", vi: "Ba." }, "bad"]);
    expect(output).toEqual(["Một.", "Hai (đã sửa).", "Ba."]);
    expect(changed).toBe(1);
    expect(applyReviewFixes(["Một."], null).output).toEqual(["Một."]);
  });
  it("moves to the next Free Tier key only on quota or overload failures", () => {
    expect(shouldTryNextKey(new AiQuotaError(1000, true))).toBe(true);
    expect(shouldTryNextKey(new Error("Gemini HTTP 503"))).toBe(true);
    expect(shouldTryNextKey(new Error("Gemini HTTP 400"))).toBe(false);
  });
});

describe("word meanings from the stored translation", () => {
  const pairs = [[{ en: "Unemployment indicators rose sharply.", vi: "Các chỉ số thất nghiệp tăng mạnh." }, { en: "Officials expect it to fall.", vi: "Giới chức kỳ vọng nó sẽ giảm." }],
    [{ en: "The indicator is watched closely.", vi: "Chỉ số này được theo dõi sát." }]];
  it("finds base forms of inflected words", () => {
    expect(wordForms("Indicators")).toContain("indicator");
    expect(wordForms("studies")).toContain("study");
    expect(wordForms("rising")).toContain("rise");
    expect(wordForms("stopped")).toContain("stop");
  });
  it("matches glossary words in any form and phrases in the sentence being read", () => {
    const glossary = [{ word: "indicators", pos: "noun", vi: "chỉ số" }, { word: "set out", pos: "phrasal verb", vi: "trình bày" }];
    expect(glossaryMeaning(glossary, "indicator")?.vi).toBe("chỉ số");
    expect(glossaryMeaning(glossary, "out", "The plan set out three goals.")?.vi).toBe("trình bày");
    expect(glossaryMeaning(glossary, "out", "They went out.")).toBeNull();
  });
  it("returns the translated sentence the learner is reading", () => {
    expect(sentenceFor(pairs, "indicator", "The indicator is watched closely.")?.vi).toBe("Chỉ số này được theo dõi sát.");
    expect(sentenceFor(pairs, "fall")?.vi).toBe("Giới chức kỳ vọng nó sẽ giảm.");
    expect(sentenceFor(pairs, "missing")).toBeNull();
  });
  it("maps a selection onto every stored sentence it covers", () => {
    expect(selectionTranslation(pairs[0], "indicators rose")).toBe("Các chỉ số thất nghiệp tăng mạnh.");
    expect(selectionTranslation(pairs[0], "rose sharply. Officials expect")).toBe("Các chỉ số thất nghiệp tăng mạnh. Giới chức kỳ vọng nó sẽ giảm.");
    expect(selectionTranslation(pairs[0], "nothing like this")).toBeNull();
  });
});

describe("translation trigger", () => {
  it("preserves a translation on an unchanged feed upsert and clears it after an English edit", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table public.news_article_bodies (article_id uuid primary key, body_text text not null, ingested_at timestamptz not null default now())");
      for (const file of ["202611060004_news_article_translations.sql", "202611260001_news_sentence_translation.sql", "202611260002_news_translation_reset_pairs.sql"])
        await db.exec(await readFile(join(process.cwd(), "supabase/migrations", file), "utf8"));
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
      await db.query("update public.news_article_bodies set translation_vi_draft='{}', translation_vi=$1, translation_pairs=$2, glossary=$3 where article_id=$4", [["Đoạn."], JSON.stringify([[{ en: "Edited paragraph.", vi: "Đoạn." }]]), JSON.stringify([{ word: "edited", pos: "verb", vi: "đã sửa" }]), id]);
      await db.query("insert into public.news_article_bodies(article_id,body_text) values ($1,$2) on conflict(article_id) do update set body_text=excluded.body_text,translation_vi=excluded.translation_vi,translation_pairs=excluded.translation_pairs,glossary=excluded.glossary", [id, "Edited paragraph."]);
      const kept = await db.query<{ translation_pairs: unknown; glossary: unknown }>("select translation_pairs, glossary from public.news_article_bodies where article_id=$1", [id]);
      expect(kept.rows[0].translation_pairs).not.toBeNull();
      expect(kept.rows[0].glossary).not.toBeNull();
      // An admin reset sets a past retry time and is not undone by the trigger.
      await db.query("update public.news_article_bodies set translation_vi=null, translation_vi_draft='{}', translation_pairs=null, glossary=null, translation_model=null, translation_updated_at=null, translation_retry_after=now() - interval '1 second' where article_id=$1", [id]);
      const reset = await db.query<{ translation_vi: unknown; translation_pairs: unknown }>("select translation_vi, translation_pairs from public.news_article_bodies where article_id=$1", [id]);
      expect(reset.rows[0]).toEqual({ translation_vi: null, translation_pairs: null });
      await db.query("update public.news_article_bodies set body_text=$1 where article_id=$2", ["Changed again.", id]);
    } finally {
      await db.close();
    }
  }, 20_000);
});
