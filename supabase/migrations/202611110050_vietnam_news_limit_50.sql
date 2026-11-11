-- Raise the Vietnam factual-article capacity without changing the source,
-- originality, or publication checks.
alter table public.news_admin_settings
  drop constraint if exists news_admin_settings_daily_rewrite_limit_check;
alter table public.news_admin_settings
  add constraint news_admin_settings_daily_rewrite_limit_check
  check (daily_rewrite_limit between 0 and 50);

update public.news_admin_settings
set daily_rewrite_limit = 50
where id = true and daily_rewrite_limit = 30;
