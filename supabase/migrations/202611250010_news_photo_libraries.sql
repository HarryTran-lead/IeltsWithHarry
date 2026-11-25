-- Allow Pexels and Unsplash photos (free licenses, photographer credited) as article
-- illustrations, next to Wikimedia Commons, Flickr (Openverse), NASA and AI art.
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_library_check;
alter table public.news_auto_illustrations add constraint news_auto_illustrations_library_check check (coalesce(
  (((image_url ~ '^https://(upload|thumb)\.wikimedia\.org/' and image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:')
      or (image_url ~ '^https://live\.staticflickr\.com/' and image_source_url ~ '^https://www\.flickr\.com/photos/'))
    and ((license_name in ('Public domain', 'CC0') and license_url is null)
      or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$' and coalesce(license_url, '') ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/')))
  or (image_url ~ '^https://images-assets\.nasa\.gov/image/' and image_source_url ~ '^https://images\.nasa\.gov/details/'
    and license_name = 'NASA media guidelines' and coalesce(license_url, '') = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
    and image_credit ~* '\mNASA\M')
  or (image_url ~ '^https://[a-z0-9.-]+/storage/v1/object/public/news-ai-illustrations/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and image_source_url = 'https://pollinations.ai/' and license_name = 'AI-generated' and license_url is null)
  or (image_url ~ '^https://images\.pexels\.com/photos/' and image_source_url ~ '^https://www\.pexels\.com/photo/'
    and license_name = 'Pexels License' and license_url = 'https://www.pexels.com/license/' and image_credit ~ ' / Pexels$')
  or (image_url ~ '^https://images\.unsplash\.com/' and image_source_url ~ '^https://unsplash\.com/photos/'
    and license_name = 'Unsplash License' and license_url = 'https://unsplash.com/license' and image_credit ~ ' / Unsplash$'),
  false));
