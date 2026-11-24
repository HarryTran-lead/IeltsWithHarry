-- Key vocabulary for Daily News articles (news_articles), generated once per article.
-- news_vocabulary stays tied to the separate learning articles.
create table if not exists public.news_article_vocabulary (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  word text not null check (length(word) between 1 and 60),
  part_of_speech text not null default '' check (length(part_of_speech) <= 20),
  meaning_vi text not null check (length(meaning_vi) between 1 and 200),
  example text not null check (length(example) between 10 and 400),
  sort_order smallint not null default 0,
  model text not null default '',
  created_at timestamptz not null default now(),
  unique (article_id, word)
);
create index if not exists news_article_vocabulary_article_idx on public.news_article_vocabulary(article_id, sort_order);

alter table public.news_article_vocabulary enable row level security;
create policy news_article_vocabulary_read on public.news_article_vocabulary for select to authenticated using (
  exists (select 1 from public.news_articles a where a.id = article_id
    and ((a.publication_status = 'published' and not a.sensitive) or public.is_admin()))
);
revoke all on public.news_article_vocabulary from public, anon, authenticated;
grant select on public.news_article_vocabulary to authenticated;
grant select, insert, update, delete on public.news_article_vocabulary to service_role;

-- The worker records one vocabulary attempt per article, like quiz and image work.
alter table public.news_enrichment_attempts drop constraint news_enrichment_attempts_kind_check;
alter table public.news_enrichment_attempts add constraint news_enrichment_attempts_kind_check
  check (kind in ('quiz', 'image', 'body', 'inline_image', 'real_cover_upgrade', 'vocabulary'));
