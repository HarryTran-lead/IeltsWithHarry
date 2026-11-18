-- Add Vietnamese press topics for travel, technology and sport to fact discovery.
-- Feed titles are leads only; publication still requires a verified original dossier.
create or replace function public.news_block_press_rewrites() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.provider = 'ai_rewrite' and (
    new.auto_publish
    or new.feed_url is null
    or new.feed_url not in (
      'https://e.vnexpress.net/rss/news.rss',
      'https://e.vnexpress.net/rss/life.rss',
      'https://e.vnexpress.net/rss/business.rss',
      'https://e.vnexpress.net/rss/travel.rss',
      'https://e.vnexpress.net/rss/tech.rss',
      'https://e.vnexpress.net/rss/sports.rss',
      'https://news.tuoitre.vn/rss',
      'https://mst.gov.vn/rss/tin-tuc-su-kien.rss',
      'https://baochinhphu.vn/giao-duc.rss',
      'https://baochinhphu.vn/y-te.rss',
      'https://baochinhphu.vn/kinh-te.rss',
      'https://baochinhphu.vn/van-hoa.rss',
      'https://baochinhphu.vn/du-lich.rss',
      'https://baochinhphu.vn/home.rss'
    )
  ) then
    raise exception 'Fact discovery feeds cannot publish their source material';
  end if;
  return new;
end;
$$;

insert into public.news_sources
  (name, provider, feed_url, category, policy_status, reviewed_basis,
   attribution_text, enabled, auto_publish, min_interval_minutes, origin_region)
values
  ('VnExpress International Travel', 'ai_rewrite', 'https://e.vnexpress.net/rss/travel.rss',
   'Culture', 'METADATA_ONLY',
   'RSS title is an event lead only. Independently checked primary/open facts support an original English passage. No publisher prose, summary, image, headline or article structure is republished.',
   'Independent factual sources in editorial dossier.', true, false, 30, 'vietnam'),
  ('VnExpress International Tech', 'ai_rewrite', 'https://e.vnexpress.net/rss/tech.rss',
   'Technology', 'METADATA_ONLY',
   'RSS title is an event lead only. Independently checked primary/open facts support an original English passage. No publisher prose, summary, image, headline or article structure is republished.',
   'Independent factual sources in editorial dossier.', true, false, 30, 'vietnam'),
  ('VnExpress International Sports', 'ai_rewrite', 'https://e.vnexpress.net/rss/sports.rss',
   'Culture', 'METADATA_ONLY',
   'RSS title is an event lead only. Independently checked primary/open facts support an original English passage. No publisher prose, summary, image, headline or article structure is republished.',
   'Independent factual sources in editorial dossier.', true, false, 30, 'vietnam')
on conflict (feed_url) where feed_url is not null do update
  set enabled = true, auto_publish = false, policy_status = 'METADATA_ONLY',
      reviewed_basis = excluded.reviewed_basis, min_interval_minutes = 30,
      origin_region = 'vietnam';
