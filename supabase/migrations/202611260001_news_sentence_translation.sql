-- Full-article translation done once per article by the background job, sentence by sentence,
-- plus a glossary of learner words with their meaning in this article. Word look-up and
-- "translate selection" read these instead of calling an AI model per learner request.
alter table public.news_article_bodies
  add column translation_pairs jsonb,
  add column glossary jsonb;

alter table public.news_article_bodies
  add constraint news_article_bodies_translation_pairs_check
    check (translation_pairs is null or (jsonb_typeof(translation_pairs) = 'array' and pg_column_size(translation_pairs) <= 400000)),
  add constraint news_article_bodies_glossary_check
    check (glossary is null or (jsonb_typeof(glossary) = 'array' and jsonb_array_length(glossary) <= 120 and pg_column_size(glossary) <= 60000));

-- Unfinished drafts were stored per paragraph chunk; the new job stores one entry per
-- sentence, so restart those articles cleanly.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'news_article_bodies' and column_name = 'translation_vi_draft') then
    update public.news_article_bodies set translation_vi_draft = '{}'
    where translation_vi is null and coalesce(array_length(translation_vi_draft, 1), 0) > 0;
  end if;
end $$;
