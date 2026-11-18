-- Publisher origin and optional editorial interest filters are separate from the existing subject category.
alter table public.news_sources add column origin_region text not null default 'international'
  check (origin_region in ('vietnam', 'international'));
alter table public.news_sources add column interest_topic text
  check (interest_topic in ('conflict', 'entertainment', 'curious'));
alter table public.news_articles add column interest_topics text[] not null default '{}';
alter table public.news_articles add column origin_region text not null default 'international'
  check (origin_region in ('vietnam', 'international'));
create index news_articles_interest_topics_idx on public.news_articles using gin (interest_topics);
create index news_articles_origin_region_idx on public.news_articles(origin_region, published_at desc);
update public.news_articles set interest_topics = array_remove(array[
  case when title ~* '\m(war|conflict|invasion|ceasefire|military|airstrike|battle|refugees?)\M' then 'conflict' end,
  case when title ~* '\m(film|movie|cinema|music|concert|actor|actress|celebrity|drama|television|festival)\M' then 'entertainment' end,
  case when title ~* '\m(humou?r|funny|quirky|unusual|good news|uplifting|heartwarming|surprise)\M' then 'curious' end
], null);

update public.news_sources set origin_region = 'vietnam'
where provider = 'ai_rewrite' or feed_url like 'https://e.vnexpress.net/%' or feed_url like 'https://news.tuoitre.vn/%';
update public.news_articles a set origin_region = 'vietnam'
from public.news_sources s where s.id = a.source_id and
  (s.origin_region = 'vietnam' or a.canonical_url ~* '^https://(e\.vnexpress\.net|news\.tuoitre\.vn)/');

-- Reviewable, full-text Global Voices feeds. Existing articles receive tags when the feeds sync.
insert into public.news_sources
  (name, provider, feed_url, category, policy_status, reviewed_basis, attribution_text,
   enabled, auto_publish, min_interval_minutes, origin_region, interest_topic)
values
  ('Global Voices · War & Conflict', 'rss', 'https://globalvoices.org/-/topics/war-conflict/feed/', 'World News', 'FULL_REUSE_ALLOWED',
   'Global Voices Republishing Guidelines (https://globalvoices.org/about/global-voices-attribution-policy/): original Global Voices text is CC BY 3.0 with author and original link; partner and third-party material excluded. Reviewed 2026-11-08.',
   'Source: Global Voices, CC BY 3.0.', true, false, 60, 'international', 'conflict'),
  ('Global Voices · Film', 'rss', 'https://globalvoices.org/-/topics/film/feed/', 'Culture', 'FULL_REUSE_ALLOWED',
   'Global Voices Republishing Guidelines (https://globalvoices.org/about/global-voices-attribution-policy/): original Global Voices text is CC BY 3.0 with author and original link; partner and third-party material excluded. Reviewed 2026-11-08.',
   'Source: Global Voices, CC BY 3.0.', true, true, 120, 'international', 'entertainment'),
  ('Global Voices · Humor', 'rss', 'https://globalvoices.org/-/topics/humor/feed/', 'Culture', 'FULL_REUSE_ALLOWED',
   'Global Voices Republishing Guidelines (https://globalvoices.org/about/global-voices-attribution-policy/): original Global Voices text is CC BY 3.0 with author and original link; partner and third-party material excluded. Reviewed 2026-11-08.',
   'Source: Global Voices, CC BY 3.0.', true, true, 120, 'international', 'curious'),
  ('Global Voices · Good News', 'rss', 'https://globalvoices.org/-/topics/good-news/feed/', 'Culture', 'FULL_REUSE_ALLOWED',
   'Global Voices Republishing Guidelines (https://globalvoices.org/about/global-voices-attribution-policy/): original Global Voices text is CC BY 3.0 with author and original link; partner and third-party material excluded. Reviewed 2026-11-08.',
   'Source: Global Voices, CC BY 3.0.', true, true, 120, 'international', 'curious')
on conflict (feed_url) where feed_url is not null do nothing;

-- Add new columns at the end to preserve the view's existing column order.
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
  b.reading_passage,
  case when a.canonical_url ~* '^https://(e\.vnexpress\.net|news\.tuoitre\.vn)/' then 'vietnam' else a.origin_region end as origin_region,
  a.interest_topics
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id
left join public.news_auto_illustrations f on f.article_id = a.id;
