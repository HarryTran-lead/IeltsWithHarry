-- Add a direct official Vietnamese discovery feed. Its article text and media
-- are not republished; the fact-dossier worker checks source facts and writes
-- independent English lessons under the same review gate as press leads.
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
      'https://news.tuoitre.vn/rss',
      'https://mst.gov.vn/rss/tin-tuc-su-kien.rss'
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
  ('Vietnam Ministry of Science and Technology', 'ai_rewrite',
   'https://mst.gov.vn/rss/tin-tuc-su-kien.rss', 'Science', 'METADATA_ONLY',
   'Official ministry RSS is used to identify a topic; the worker checks atomic facts against the linked official page and writes independent English text. No page prose, RSS summary, image or headline is republished.',
   'Independent facts from Vietnam Ministry of Science and Technology.',
   true, false, 60, 'vietnam')
on conflict (feed_url) where feed_url is not null do update
  set enabled = true, auto_publish = false, policy_status = 'METADATA_ONLY',
      reviewed_basis = excluded.reviewed_basis, origin_region = 'vietnam';
