-- Daily News keeps only articles that can be read on site. Headline-only rows
-- are removed, and their links are remembered so a later sync does not re-import them.

create table public.news_skipped_urls (
  canonical_hash text primary key check (canonical_hash ~ '^[0-9a-f]{64}$'),
  skipped_at timestamptz not null default now()
);
alter table public.news_skipped_urls enable row level security;
revoke all on public.news_skipped_urls from public, anon, authenticated;

-- Teaser-only feeds (keep in sync with pageBodyReader in src/lib/news/sync.ts) keep an
-- article until its page has been read and found unusable. Other feeds deliver text with
-- the headline, so an article without text never becomes readable.
create function public.news_prune_unreadable() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  create temporary table pruned on commit drop as
  select a.id, a.canonical_hash from public.news_articles a
  join public.news_sources s on s.id = a.source_id
  where s.provider <> 'manual'
    and not exists (select 1 from public.news_article_bodies b where b.article_id = a.id)
    and not exists (select 1 from public.news_learning_articles l where l.related_news_id = a.id)
    and (
      not (s.feed_url = 'https://oceanservice.noaa.gov/rss/nosnews.xml' or s.feed_url like 'https://www.gov.uk/search/news-and-communications.atom?%')
      or exists (select 1 from public.news_enrichment_attempts t where t.article_id = a.id and t.kind = 'body' and t.status = 'none')
    );
  insert into public.news_skipped_urls(canonical_hash) select canonical_hash from pruned on conflict do nothing;
  delete from public.news_articles a using pruned p where a.id = p.id;
  get diagnostics v_count = row_count;
  drop table pruned;
  return v_count;
end;
$$;
revoke all on function public.news_prune_unreadable() from public;
grant execute on function public.news_prune_unreadable() to service_role;

-- NSF's feed has no reusable text, so it would only add headline-only rows.
update public.news_sources set enabled = false, auto_publish = false where feed_url = 'https://www.nsf.gov/rss/rss_www_news.xml';

select public.news_prune_unreadable();
