import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import type { GlossaryEntry, SentencePair } from "@/lib/news/article-translation";
import { glossaryMeaning, sentenceFor, wordForms } from "@/lib/news/word-meaning";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value: unknown) => typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 160) : "";

/**
 * Vietnamese meaning of a word in a Daily News article without calling an AI model: the article's
 * glossary (made once when the article was translated), then the site's own vocabulary banks, plus
 * the translated sentence containing the word.
 */
export async function GET(request: NextRequest) {
  const viewer = await createClient();
  const { data: auth } = await viewer.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Cần đăng nhập để tra từ." }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const articleId = params.get("articleId") ?? "";
  const word = (params.get("word") ?? "").trim();
  const context = (params.get("context") ?? "").slice(0, 600);
  if (!UUID.test(articleId) || !/^[a-z][a-z'-]{0,59}$/i.test(word)) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const forms = wordForms(word);
  try {
    const db = newsAdminClient();
    const [body, bank, ielts, listening] = await Promise.all([
      db.from("news_article_bodies").select("translation_pairs,glossary,translation_vi,news_articles!inner(publication_status,sensitive)")
        .eq("article_id", articleId).eq("news_articles.publication_status", "published").eq("news_articles.sensitive", false).maybeSingle(),
      db.from("vocabulary_bank_entries").select("headword,pos,meaning_vi,auto_meaning_vi").in("headword", forms).limit(6),
      db.from("ielts_vocabulary_entries").select("normalized_term,pos_standard,definition_vi").in("normalized_term", forms).eq("published", true).limit(6),
      db.from("listening_vocabulary_entries").select("word,meaning_vi").in("word", forms).limit(4),
    ]);
    const failed = body.error ?? bank.error ?? ielts.error ?? listening.error;
    if (failed) throw failed;
    if (!body.data) return NextResponse.json({ error: "Không tìm thấy bài." }, { status: 404 });
    const pairs = (Array.isArray(body.data.translation_pairs) ? body.data.translation_pairs : []) as SentencePair[][];
    const glossary = (Array.isArray(body.data.glossary) ? body.data.glossary : []) as GlossaryEntry[];
    const sentence = sentenceFor(pairs, word, context);
    const article = glossaryMeaning(glossary, word, sentence?.en ?? context);
    // Prefer the exact form, then any base form, as the dictionaries list it.
    const rank = (value: string) => { const index = forms.indexOf(value.toLowerCase()); return index < 0 ? 99 : index; };
    const dictionary = [
      ...(bank.data ?? []).map((row) => ({ term: String(row.headword), pos: clean(row.pos), vi: clean(row.meaning_vi) || clean(row.auto_meaning_vi) })),
      ...(ielts.data ?? []).map((row) => ({ term: String(row.normalized_term), pos: clean(row.pos_standard), vi: clean(row.definition_vi) })),
      ...(listening.data ?? []).map((row) => ({ term: String(row.word), pos: "", vi: clean(row.meaning_vi) })),
    ].filter((entry) => entry.vi).sort((a, b) => rank(a.term) - rank(b.term));
    const meanings = [...new Set([...(article ? [article.vi] : []), ...dictionary.map((entry) => entry.vi)])].slice(0, 4);
    return NextResponse.json({
      meaning: article ? { vi: article.vi, pos: article.pos, source: "article" } : dictionary[0] ? { vi: dictionary[0].vi, pos: dictionary[0].pos, source: "dictionary" } : null,
      alternatives: meanings,
      sentence,
      translated: Boolean(body.data.translation_vi),
    }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch {
    return NextResponse.json({ error: "Chưa tra được nghĩa. Hãy thử lại." }, { status: 500 });
  }
}
