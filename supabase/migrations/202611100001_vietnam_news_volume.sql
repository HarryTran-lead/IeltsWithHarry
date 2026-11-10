-- More Vietnamese event leads, still metadata only. Publisher prose and media
-- are never stored or sent to the fact writer.
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
      'https://mst.gov.vn/rss/tin-tuc-su-kien.rss',
      'https://baochinhphu.vn/giao-duc.rss',
      'https://baochinhphu.vn/y-te.rss',
      'https://baochinhphu.vn/kinh-te.rss',
      'https://baochinhphu.vn/van-hoa.rss',
      'https://baochinhphu.vn/du-lich.rss'
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
  ('Government News Education', 'ai_rewrite', 'https://baochinhphu.vn/giao-duc.rss', 'Education', 'METADATA_ONLY',
   'Government News RSS title is an event lead only. Facts must be checked against separate original government or open pages before independent English writing. No publisher prose, summary, image or headline is reused.',
   'Independent factual sources in editorial dossier.', true, false, 60, 'vietnam'),
  ('Government News Health', 'ai_rewrite', 'https://baochinhphu.vn/y-te.rss', 'Health', 'METADATA_ONLY',
   'Government News RSS title is an event lead only. Facts must be checked against separate original government or open pages before independent English writing. No publisher prose, summary, image or headline is reused.',
   'Independent factual sources in editorial dossier.', true, false, 60, 'vietnam'),
  ('Government News Business', 'ai_rewrite', 'https://baochinhphu.vn/kinh-te.rss', 'Business', 'METADATA_ONLY',
   'Government News RSS title is an event lead only. Facts must be checked against separate original government or open pages before independent English writing. No publisher prose, summary, image or headline is reused.',
   'Independent factual sources in editorial dossier.', true, false, 60, 'vietnam'),
  ('Government News Culture', 'ai_rewrite', 'https://baochinhphu.vn/van-hoa.rss', 'Culture', 'METADATA_ONLY',
   'Government News RSS title is an event lead only. Facts must be checked against separate original government or open pages before independent English writing. No publisher prose, summary, image or headline is reused.',
   'Independent factual sources in editorial dossier.', true, false, 60, 'vietnam'),
  ('Government News Tourism', 'ai_rewrite', 'https://baochinhphu.vn/du-lich.rss', 'Culture', 'METADATA_ONLY',
   'Government News RSS title is an event lead only. Facts must be checked against separate original government or open pages before independent English writing. No publisher prose, summary, image or headline is reused.',
   'Independent factual sources in editorial dossier.', true, false, 60, 'vietnam')
on conflict (feed_url) where feed_url is not null do update
  set enabled = true, auto_publish = false, policy_status = 'METADATA_ONLY',
      reviewed_basis = excluded.reviewed_basis, origin_region = 'vietnam';

-- Six independently checked facts can support a shorter IELTS reading lesson.
-- The source checks, originality review and publication gate remain required.
alter table public.news_fact_dossiers
  drop constraint if exists news_fact_dossiers_dossier_check;
alter table public.news_fact_dossiers
  add constraint news_fact_dossiers_dossier_check
  check (jsonb_typeof(dossier->'facts') = 'array' and jsonb_array_length(dossier->'facts') between 6 and 24);

update public.news_admin_settings set daily_rewrite_limit = 8 where id = true;
