-- Keep source-credited preview images separate from licensed full-text bodies.
-- A preview never grants permission to show the publisher's full article.
create table public.news_article_images (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  source_url text not null,
  image_url text not null,
  image_alt text not null check (length(trim(image_alt)) >= 5),
  image_credit text not null check (length(trim(image_credit)) >= 3),
  image_rights_basis text not null check (length(trim(image_rights_basis)) >= 30),
  ingested_at timestamptz not null default now(),
  constraint news_preview_approved_source check (
    (
      source_url ~ '^https://(www|science)\.nasa\.gov/'
      and (image_url ~ '^https://www\.nasa\.gov/wp-content/uploads/'
        or image_url ~ '^https://assets\.science\.nasa\.gov/dynamicimage/assets/')
      and image_credit ~* '\mNASA\M'
    ) or (
      source_url ~ '^https://www\.noaa\.gov/'
      and image_url ~ '^https://www\.noaa\.gov/sites/default/files/'
      and image_credit ~* '\mNOAA\M'
    ) or (
      source_url ~ '^https://oceanservice\.noaa\.gov/'
      and image_url ~ '^https://oceanservice\.noaa\.gov/'
      and image_credit ~* '\mNOAA\M'
    )
  )
);
alter table public.news_article_images enable row level security;
create policy news_preview_read on public.news_article_images for select to authenticated
  using (exists (select 1 from public.news_articles a where a.id = article_id and a.publication_status = 'published' and not a.sensitive));
revoke all on public.news_article_images from public, anon, authenticated;
grant select on public.news_article_images to authenticated;

alter table public.news_article_bodies drop constraint news_article_image_complete;
alter table public.news_article_bodies add constraint news_article_image_complete check (
  image_url is null and image_alt is null and image_credit is null and image_rights_basis is null
  or image_url is not null and length(trim(coalesce(image_alt, ''))) >= 5
    and length(trim(coalesce(image_credit, ''))) >= 3
    and length(trim(coalesce(image_rights_basis, ''))) >= 30
    and (
      source_url ~ '^https://www\.noaa\.gov/' and image_url ~ '^https://www\.noaa\.gov/sites/default/files/' and image_credit ~* '\mNOAA\M'
      or source_url ~ '^https://www\.nasa\.gov/' and (
        image_url ~ '^https://www\.nasa\.gov/wp-content/uploads/'
        or image_url ~ '^https://assets\.science\.nasa\.gov/dynamicimage/assets/'
      ) and image_credit ~* '\mNASA\M'
    )
);

create or replace view public.news_archive_catalog with (security_invoker = true) as
select a.id, a.source_id, a.title, a.publisher, a.canonical_url, a.category,
  a.published_at, a.fetched_at, a.attribution_text, a.sensitive, a.publication_status,
  (b.article_id is not null) as readable,
  coalesce(b.image_url, i.image_url) as image_url,
  coalesce(b.image_alt, i.image_alt) as image_alt,
  coalesce(b.image_credit, i.image_credit) as image_credit
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id;
