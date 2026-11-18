-- The earlier eight-article ceiling is a capacity setting, not a rights gate.
-- Keep factual-source verification and independent-expression review mandatory.
update public.news_admin_settings
set daily_rewrite_limit = 30
where id = true and daily_rewrite_limit = 8;
