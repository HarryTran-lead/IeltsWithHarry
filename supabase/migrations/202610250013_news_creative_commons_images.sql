alter table public.news_auto_illustrations add column license_url text;
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_license_name_check;
alter table public.news_auto_illustrations add constraint news_auto_illustrations_license_check check (
  (license_name in ('Public domain', 'CC0') and license_url is null)
  or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$'
    and license_url ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/')
);

create or replace view public.news_archive_catalog with (security_invoker = true) as
select a.id, a.source_id, a.title, a.publisher, a.canonical_url, a.category,
  a.published_at, a.fetched_at, a.attribution_text, a.sensitive, a.publication_status,
  (b.article_id is not null) as readable,
  coalesce(b.image_url, i.image_url, f.image_url) as image_url,
  coalesce(b.image_alt, i.image_alt, f.image_alt) as image_alt,
  coalesce(b.image_credit, i.image_credit, f.image_credit) as image_credit,
  case when b.image_url is null and i.image_url is null then f.image_source_url end as illustration_source_url,
  case when b.image_url is null and i.image_url is null then f.license_name end as illustration_license,
  case when b.image_url is null and i.image_url is null then f.license_url end as illustration_license_url
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id
left join public.news_auto_illustrations f on f.article_id = a.id;
