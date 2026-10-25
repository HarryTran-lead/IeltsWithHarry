-- A single source-credited image may accompany an on-site NASA/NOAA reading.
-- The ingest code accepts only an agency-hosted image with an agency credit.
alter table public.news_article_bodies
  add column image_url text,
  add column image_alt text,
  add column image_credit text,
  add column image_rights_basis text;

alter table public.news_article_bodies add constraint news_article_image_complete check (
  image_url is null and image_alt is null and image_credit is null and image_rights_basis is null
  or image_url is not null and length(trim(coalesce(image_alt, ''))) >= 5
    and length(trim(coalesce(image_credit, ''))) >= 3
    and length(trim(coalesce(image_rights_basis, ''))) >= 30
    and (
      source_url ~ '^https://www\.noaa\.gov/' and image_url ~ '^https://www\.noaa\.gov/sites/default/files/' and image_credit ~* '\mNOAA\M'
      or source_url ~ '^https://www\.nasa\.gov/' and image_url ~ '^https://www\.nasa\.gov/wp-content/uploads/' and image_credit ~* '\mNASA\M'
    )
);
