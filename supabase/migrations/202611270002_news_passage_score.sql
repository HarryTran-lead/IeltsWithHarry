-- The 0–100 difficulty score behind reading_passage (src/lib/news/passage-difficulty.ts). Null for articles whose
-- passage level is only the old length-based guess, so a measured level can be told apart from a default one.
alter table public.news_article_bodies add column if not exists passage_score smallint
  constraint news_article_bodies_passage_score_check check (passage_score between 0 and 100);
