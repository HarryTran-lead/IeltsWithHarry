-- The discovery endpoint has repeatedly timed out in production and has no
-- published rows; keep it available for later review without delaying cron.
update public.news_sources set enabled = false, auto_publish = false where provider = 'gdelt';
