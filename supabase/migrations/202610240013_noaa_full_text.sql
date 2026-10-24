-- NOAA's official RSS includes original article text. Keep the same per-item
-- rights record and published-article RLS as NASA's on-site reader.
alter table public.news_article_bodies drop constraint news_article_bodies_source_url_check;
alter table public.news_article_bodies add constraint news_article_bodies_source_url_check
  check (source_url ~ '^https://www\.(nasa\.gov/news-release/|noaa\.gov/(news-release|news|stories|media-advisory)/)');

insert into public.news_sources(name,provider,feed_url,category,policy_status,reviewed_basis,attribution_text,enabled,auto_publish,min_interval_minutes)
values (
  'NOAA News', 'rss', 'https://www.noaa.gov/rss.xml', 'Environment', 'METADATA_ONLY',
  'NOAA Office of Education public-domain content guidance reviewed: https://www.noaa.gov/office-education/outreach-communication/faq . NOAA-authored text only; exclude third-party notices and media.',
  'Source: National Oceanic and Atmospheric Administration (NOAA).', true, true, 60
)
on conflict (feed_url) where feed_url is not null do nothing;
