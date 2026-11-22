-- Headings are metadata, never extra passage paragraphs; existing evidence stays valid.
alter table public.news_article_bodies add column reading_sections jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reading_sections) = 'array' and jsonb_array_length(reading_sections) <= 3);
