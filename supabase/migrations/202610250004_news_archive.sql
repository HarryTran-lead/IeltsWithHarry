-- Archive inventory stays queryable with article and body RLS applied.
alter table public.news_sources add column archive_next_page integer check (archive_next_page between 2 and 4000);
update public.news_sources set archive_next_page = 2 where feed_url = 'https://www.nasa.gov/news-release/feed/';

create view public.news_archive_catalog with (security_invoker = true) as
select a.id, a.source_id, a.title, a.publisher, a.canonical_url, a.category,
  a.published_at, a.fetched_at, a.attribution_text, a.sensitive, a.publication_status,
  (b.article_id is not null) as readable,
  b.image_url, b.image_alt, b.image_credit
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id;
revoke all on public.news_archive_catalog from public, anon;
grant select on public.news_archive_catalog to authenticated;
create view public.news_source_options as
select id, name from public.news_sources where enabled = true;
revoke all on public.news_source_options from public, anon;
grant select on public.news_source_options to authenticated;
create index if not exists news_articles_publisher_date_idx on public.news_articles(publisher, publication_status, published_at desc);

-- Official agency RSS feeds. These remain metadata/link-only unless an
-- individual article has a separately reviewed full-text rights record.
insert into public.news_sources(name,provider,feed_url,category,policy_status,reviewed_basis,attribution_text,enabled,auto_publish,min_interval_minutes)
values
  ('NASA Technology','rss','https://www.nasa.gov/technology/feed/','Technology','METADATA_ONLY',
   'Official NASA RSS listing: https://www.nasa.gov/rss-feeds/ . Store headline, publication date and source link only. Reviewed 2026-10-25.',
   'Source: NASA Technology.',true,true,60),
  ('NASA Aeronautics','rss','https://www.nasa.gov/aeronautics/feed/','Science','METADATA_ONLY',
   'Official NASA RSS listing: https://www.nasa.gov/rss-feeds/ . Store headline, publication date and source link only. Reviewed 2026-10-25.',
   'Source: NASA Aeronautics.',true,true,60),
  ('NASA Space Station','rss','https://www.nasa.gov/missions/station/feed/','Science','METADATA_ONLY',
   'Official NASA RSS listing: https://www.nasa.gov/rss-feeds/ . Store headline, publication date and source link only. Reviewed 2026-10-25.',
   'Source: NASA Space Station.',true,true,60),
  ('NOAA Ocean Service','rss','https://oceanservice.noaa.gov/rss/nosnews.xml','Environment','METADATA_ONLY',
   'Official NOAA National Ocean Service RSS listing: https://oceanservice.noaa.gov/rss.html . Store headline, publication date and source link only. Reviewed 2026-10-25.',
   'Source: NOAA National Ocean Service.',true,true,120),
  ('NSF News','rss','https://www.nsf.gov/rss/rss_www_news.xml','Science','METADATA_ONLY',
   'Official U.S. National Science Foundation RSS listing: https://www.nsf.gov/rss . Store headline, publication date and source link only. Reviewed 2026-10-25.',
   'Source: U.S. National Science Foundation.',true,true,60)
on conflict (feed_url) where feed_url is not null do nothing;
