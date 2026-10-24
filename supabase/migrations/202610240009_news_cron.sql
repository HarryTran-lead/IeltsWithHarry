-- Set vault secrets news_sync_url and news_sync_secret before enabling this job.
-- Only a fixed production endpoint and bearer token are read at execution time.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'english-skill-lab-news-30m',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='news_sync_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='news_sync_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 45000
    );
  $cron$
);
