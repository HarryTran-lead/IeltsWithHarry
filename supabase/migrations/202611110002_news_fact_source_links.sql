-- Expose citation URLs without exposing the private factual dossier or source text.
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
  a.interest_topics,
  a.metadata->>'discovery_url' as report_url,
  case when jsonb_typeof(a.metadata->'fact_source_urls') = 'array'
    then a.metadata->'fact_source_urls' else '[]'::jsonb end as fact_source_urls
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id
left join public.news_auto_illustrations f on f.article_id = a.id;

-- Reconsider recent leads rejected solely by the former twelve-fact or
-- 520-word threshold. All other skipped leads retain their audit record.
delete from public.news_skipped_urls
where reason = 'ai_rewrite'
  and skipped_at >= now() - interval '3 days'
  and (detail = 'Insufficient independent primary-source facts'
    or detail like 'The factual dossier did not support a complete independent article%');
