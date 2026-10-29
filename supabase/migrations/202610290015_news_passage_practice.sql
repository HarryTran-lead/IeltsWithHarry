-- Passage level is a target for new AI rewrites. Existing licensed articles receive
-- a rough reading-length level so learners can use the selector immediately.
alter table public.news_article_bodies add column reading_passage smallint
  constraint news_article_bodies_reading_passage_check check (reading_passage between 1 and 3);
update public.news_article_bodies set reading_passage = case
  when length(body_text) < 2500 then 1
  when length(body_text) < 3600 then 2
  else 3 end;
alter table public.news_article_bodies alter column reading_passage set not null;
alter table public.news_article_bodies alter column reading_passage set default 2;

alter table public.news_auto_questions drop constraint news_auto_questions_type_check;
alter table public.news_auto_questions add constraint news_auto_questions_type_check check (question_type in (
  'mcq','tfng','ynng','matching_headings','matching_information','matching_features',
  'matching_sentence_endings','sentence_completion','summary_completion',
  'note_completion','table_completion','flow_chart_completion',
  'diagram_label_completion','short_answer'));
alter table public.news_auto_questions drop constraint news_auto_questions_options_check;
alter table public.news_auto_questions add constraint news_auto_questions_options_check check (
  jsonb_typeof(options) = 'array' and (
    question_type = 'tfng' and options = '["True","False","Not Given"]'::jsonb
    or question_type = 'ynng' and options = '["Yes","No","Not Given"]'::jsonb
    or question_type in ('mcq','matching_headings','matching_information','matching_features','matching_sentence_endings')
      and jsonb_array_length(options) between 3 and 4
    or question_type in ('sentence_completion','summary_completion','note_completion',
      'table_completion','flow_chart_completion','diagram_label_completion','short_answer')
      and jsonb_array_length(options) = 0
  ));

create or replace view public.news_archive_catalog with (security_invoker = true) as
select a.id, a.source_id, a.title, a.publisher, a.canonical_url, a.category,
  a.published_at, a.fetched_at, a.attribution_text, a.sensitive, a.publication_status,
  (b.article_id is not null) as readable,
  coalesce(b.image_url, i.image_url, f.image_url) as image_url,
  coalesce(b.image_alt, i.image_alt, f.image_alt) as image_alt,
  coalesce(b.image_credit, i.image_credit, f.image_credit) as image_credit,
  case when b.image_url is null and i.image_url is null then f.image_source_url end as illustration_source_url,
  case when b.image_url is null and i.image_url is null then f.license_name end as illustration_license,
  case when b.image_url is null and i.image_url is null then f.license_url end as illustration_license_url,
  b.reading_passage
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id
left join public.news_auto_illustrations f on f.article_id = a.id;
