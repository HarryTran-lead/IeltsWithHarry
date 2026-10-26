-- AI-generated illustrations: when no licensed photo fits a story, the worker
-- generates an illustration of its subject (Pollinations.ai) and stores the file in
-- this bucket. Only the service role writes; the bucket is public for reading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-ai-illustrations', 'news-ai-illustrations', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Set once a photo search has failed, so later runs skip straight to generation.
alter table public.news_enrichment_attempts add column if not exists ai_art_pending boolean not null default false;

-- The licensed libraries as before, plus generated files in our own storage bucket,
-- labelled 'AI-generated' so the reader always knows the picture is not a photo.
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_library_check;
alter table public.news_auto_illustrations add constraint news_auto_illustrations_library_check check (coalesce(
  (
    image_url ~ '^https://(upload|thumb)\.wikimedia\.org/' and image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:'
    or image_url ~ '^https://live\.staticflickr\.com/' and image_source_url ~ '^https://www\.flickr\.com/photos/'
  ) and (
    (license_name in ('Public domain', 'CC0') and license_url is null)
    or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$'
      and coalesce(license_url, '') ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/')
  )
  or image_url ~ '^https://images-assets\.nasa\.gov/image/'
    and image_source_url ~ '^https://images\.nasa\.gov/details/'
    and license_name = 'NASA media guidelines'
    and coalesce(license_url, '') = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
    and image_credit ~* '\mNASA\M'
  or image_url ~ '^https://[a-z0-9.-]+/storage/v1/object/public/news-ai-illustrations/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and image_source_url = 'https://pollinations.ai/'
    and license_name = 'AI-generated'
    and license_url is null,
  false));

-- Stories whose photo search found nothing suitable are queued again for an AI illustration.
update public.news_enrichment_attempts
set ai_art_pending = true, retry_after = now()
where kind = 'image' and status = 'none';
