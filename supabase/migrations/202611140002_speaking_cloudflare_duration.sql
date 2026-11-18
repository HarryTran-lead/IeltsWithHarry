-- The Cloudflare worker needs the recorded Part 2 duration to calculate speaking rate.
alter table public.speaking_coaching_jobs
  add column recording_seconds integer not null default 120 check (recording_seconds between 5 and 125);
