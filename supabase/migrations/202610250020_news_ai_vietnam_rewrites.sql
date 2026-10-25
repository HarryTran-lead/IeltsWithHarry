-- Vietnamese news in English, written by AI from the facts of a source report.
-- Source text is read only for fact-checking and never stored; only the AI-written
-- article, which cites the original and carries an AI label, is kept.

alter table public.news_sources drop constraint news_sources_provider_check;
alter table public.news_sources add constraint news_sources_provider_check
  check (provider in ('gdelt', 'rss', 'manual', 'ai_rewrite'));
alter table public.news_sources drop constraint news_sources_check2;
alter table public.news_sources add constraint news_sources_check2 check (provider not in ('rss', 'ai_rewrite') or feed_url ~ '^https://');

alter table public.news_article_bodies add column ai_generated boolean not null default false;

-- Rejected rewrites are remembered so the same story is not attempted (and paid for) twice.
alter table public.news_skipped_urls add column reason text not null default 'unreadable' check (reason in ('unreadable', 'ai_rewrite'));
alter table public.news_skipped_urls add column detail text check (detail is null or length(detail) <= 300);
create index news_skipped_urls_reason_day on public.news_skipped_urls(reason, skipped_at desc);

alter table public.news_admin_settings add column daily_rewrite_limit integer not null default 6 check (daily_rewrite_limit between 0 and 30);

insert into public.news_sources(name, provider, feed_url, category, policy_status, reviewed_basis, attribution_text, enabled, auto_publish, min_interval_minutes)
values
  ('VnExpress International', 'ai_rewrite', 'https://e.vnexpress.net/rss/news.rss', 'World News', 'METADATA_ONLY',
   'Facts only: the report is read to fact-check an original AI-written English article that links to it. No source text is stored or reproduced. Reviewed 2026-10-25.',
   'AI-written English article based on reporting by VnExpress International.', true, true, 60),
  ('VnExpress International Life', 'ai_rewrite', 'https://e.vnexpress.net/rss/life.rss', 'Culture', 'METADATA_ONLY',
   'Facts only: the report is read to fact-check an original AI-written English article that links to it. No source text is stored or reproduced. Reviewed 2026-10-25.',
   'AI-written English article based on reporting by VnExpress International.', true, true, 60),
  ('VnExpress International Business', 'ai_rewrite', 'https://e.vnexpress.net/rss/business.rss', 'Business', 'METADATA_ONLY',
   'Facts only: the report is read to fact-check an original AI-written English article that links to it. No source text is stored or reproduced. Reviewed 2026-10-25.',
   'AI-written English article based on reporting by VnExpress International.', true, true, 60),
  ('Tuoi Tre News', 'ai_rewrite', 'https://news.tuoitre.vn/rss', 'World News', 'METADATA_ONLY',
   'Facts only: the report is read to fact-check an original AI-written English article that links to it. No source text is stored or reproduced. Reviewed 2026-10-25.',
   'AI-written English article based on reporting by Tuoi Tre News.', true, true, 60)
on conflict (feed_url) where feed_url is not null do nothing;
