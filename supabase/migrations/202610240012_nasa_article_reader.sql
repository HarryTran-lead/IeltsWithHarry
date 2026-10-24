-- Only individually eligible NASA news-release text is copied into the on-site reader.
-- Other RSS/GDELT articles remain metadata and publisher links.
create table public.news_article_bodies (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  body_text text not null check (length(body_text) between 200 and 50000),
  rights_basis text not null check (length(trim(rights_basis)) >= 30),
  source_url text not null check (source_url ~ '^https://www\.nasa\.gov/news-release/'),
  ingested_at timestamptz not null default now()
);
alter table public.news_article_bodies enable row level security;
create policy news_body_read on public.news_article_bodies for select to authenticated
  using (exists (select 1 from public.news_articles a where a.id = article_id and a.publication_status = 'published' and not a.sensitive));
create policy news_body_admin on public.news_article_bodies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.news_article_bodies from anon, authenticated;
grant select, delete on public.news_article_bodies to authenticated;
