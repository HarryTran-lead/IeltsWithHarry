-- Reuse the existing Daily News worker endpoint and secret unless dedicated IELTS Vault secrets are set.
-- The endpoint decides which approved sources are due according to ielts_sources.sync_hours.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('english-skill-lab-ielts-worker','*/5 * * * *',$cron$
  select net.http_post(
    url := coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name='ielts_sync_url'),
      replace((select decrypted_secret from vault.decrypted_secrets where name='news_sync_url'), '/api/news/sync', '/api/ielts/bank/scheduled')
    ),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name='ielts_sync_secret'),
      (select decrypted_secret from vault.decrypted_secrets where name='news_sync_secret')
    )),
    body := '{}'::jsonb, timeout_milliseconds := 45000
  );
$cron$);
