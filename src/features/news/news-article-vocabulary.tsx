"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type ArticleWordRow = { id: string; word: string; part_of_speech: string; meaning_vi: string; example: string };

/** Key vocabulary chosen for this Daily News article, each with its sentence from the passage. */
export function NewsArticleVocabulary({ articleId }: { articleId: string }) {
  const db = useMemo(() => createClient(), []);
  const [words, setWords] = useState<ArticleWordRow[]>([]);
  useEffect(() => {
    let active = true;
    void db.from("news_article_vocabulary").select("id,word,part_of_speech,meaning_vi,example")
      .eq("article_id", articleId).order("sort_order").then(({ data }) => { if (active) setWords((data ?? []) as ArticleWordRow[]); });
    return () => { active = false; };
  }, [db, articleId]);
  if (!words.length) return null;
  return <section className="news-vocab-panel news-article-vocab" aria-label="Từ vựng trong bài">
    <h2><BookOpenText size={18} aria-hidden="true"/> Từ vựng trong bài</h2>
    <p>{words.length} từ đáng học, kèm câu nguyên văn trong bài.</p>
    <dl>{words.map((item) => <div key={item.id} className="news-article-vocab-item">
      <dt><strong lang="en">{item.word}</strong>{item.part_of_speech && <span> · {item.part_of_speech}</span>}</dt>
      <dd>{item.meaning_vi}<em lang="en">{item.example}</em></dd>
    </div>)}</dl>
  </section>;
}
