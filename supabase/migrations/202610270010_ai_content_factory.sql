-- Admin-only production queue. Inference runs in a separate service, never in a web request.
insert into public.ielts_sources(id,name,repository_url,license,license_url,approved,enabled)
values ('ai-factory','AI Content Factory','https://github.com/hexgrad/kokoro','Original AI-assisted content','https://huggingface.co/hexgrad/Kokoro-82M',true,false)
on conflict (id) do nothing;

create table public.ai_factory_settings (
  id boolean primary key default true check (id),
  generation_enabled boolean not null default false,
  paid_provider_enabled boolean not null default false,
  daily_job_limit integer not null default 2 check (daily_job_limit between 0 and 100),
  max_concurrency integer not null default 1 check (max_concurrency between 1 and 8),
  daily_paid_limit_usd numeric(10,4) not null default 0 check (daily_paid_limit_usd >= 0),
  monthly_paid_limit_usd numeric(10,4) not null default 0 check (monthly_paid_limit_usd >= 0),
  updated_at timestamptz not null default now()
);
insert into public.ai_factory_settings(id) values(true);

create table public.ai_factory_voices (
  id text primary key,
  provider text not null default 'kokoro' check (provider='kokoro'),
  model_id text not null default 'hexgrad/Kokoro-82M',
  name text not null,
  language text not null default 'en',
  accent text not null check (accent in ('US','UK')),
  characteristics text not null default '',
  pace numeric(3,2) not null default 1 check (pace between 0.75 and 1.25),
  sample_url text,
  enabled boolean not null default true
);
insert into public.ai_factory_voices(id,name,accent,characteristics) values
('bf_emma','Emma','UK','female, clear'),('bm_george','George','UK','male, measured'),
('af_heart','Heart','US','female, warm'),('am_michael','Michael','US','male, conversational');

create table public.ai_factory_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('listening_audio','reading','writing','speaking')),
  status text not null default 'queued' check(status in ('queued','running','qa_failed','awaiting_review','approved','rejected','failed','cancelled')),
  exam_id uuid references public.ielts_exams(id),
  exam_version_id uuid references public.ielts_exam_versions(id),
  payload jsonb not null default '{}'::jsonb,
  artifact_path text,
  provider text not null default 'kokoro',
  model_id text not null default 'hexgrad/Kokoro-82M',
  model_sha256 text,
  error text,
  attempts integer not null default 0 check(attempts between 0 and 5),
  lease_token uuid,
  lease_until timestamptz,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index ai_factory_jobs_queue_idx on public.ai_factory_jobs(status,created_at);
create index ai_factory_jobs_exam_idx on public.ai_factory_jobs(exam_id,created_at desc);
create unique index ai_factory_one_active_pilot_idx on public.ai_factory_jobs((payload->>'pilot'))
  where payload->>'pilot'='true' and status in ('queued','running','awaiting_review','approved');

create table public.ai_factory_segments (
  job_id uuid not null references public.ai_factory_jobs(id) on delete cascade,
  ordinal integer not null check(ordinal >= 0),
  speaker_id text not null,
  voice_id text not null references public.ai_factory_voices(id),
  pace numeric(3,2) not null check (pace between 0.75 and 1.25),
  canonical_text text not null,
  normalized_text text not null,
  cache_key text not null,
  start_ms integer not null check(start_ms >= 0),
  end_ms integer not null check(end_ms > start_ms),
  primary key(job_id,ordinal)
);
create table public.ai_factory_qa (
  job_id uuid primary key references public.ai_factory_jobs(id) on delete cascade,
  technical jsonb not null,
  answer_alignment jsonb not null default '{}'::jsonb,
  asr jsonb not null default '{"status":"not_run"}'::jsonb,
  naturalness_review jsonb not null default '{}'::jsonb,
  passed boolean not null default false,
  checked_at timestamptz not null default now()
);
create table public.ai_factory_usage (
  id bigint generated always as identity primary key,
  job_id uuid references public.ai_factory_jobs(id),
  provider text not null,
  characters integer not null default 0,
  audio_seconds numeric(12,2) not null default 0,
  processing_seconds numeric(12,2) not null default 0,
  storage_bytes bigint not null default 0,
  estimated_usd numeric(10,4) not null default 0,
  actual_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create unique index ai_factory_usage_audio_once_idx on public.ai_factory_usage(job_id,provider);

alter table public.ai_factory_settings enable row level security;
alter table public.ai_factory_voices enable row level security;
alter table public.ai_factory_jobs enable row level security;
alter table public.ai_factory_segments enable row level security;
alter table public.ai_factory_qa enable row level security;
alter table public.ai_factory_usage enable row level security;
create policy ai_factory_settings_admin on public.ai_factory_settings for select to authenticated using(public.is_admin());
create policy ai_factory_voices_admin on public.ai_factory_voices for select to authenticated using(public.is_admin());
create policy ai_factory_jobs_admin on public.ai_factory_jobs for select to authenticated using(public.is_admin());
create policy ai_factory_segments_admin on public.ai_factory_segments for select to authenticated using(public.is_admin());
create policy ai_factory_qa_admin on public.ai_factory_qa for select to authenticated using(public.is_admin());
create policy ai_factory_usage_admin on public.ai_factory_usage for select to authenticated using(public.is_admin());
revoke all on public.ai_factory_settings,public.ai_factory_voices,public.ai_factory_jobs,public.ai_factory_segments,public.ai_factory_qa,public.ai_factory_usage from anon,authenticated;
grant select on public.ai_factory_settings,public.ai_factory_voices,public.ai_factory_jobs,public.ai_factory_segments,public.ai_factory_qa,public.ai_factory_usage to authenticated;

-- SKIP LOCKED makes competing workers claim disjoint jobs. Only service role may call.
create function public.ai_factory_claim_job(p_token uuid) returns setof public.ai_factory_jobs
language plpgsql security definer set search_path='' as $$
declare j public.ai_factory_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  perform 1 from public.ai_factory_settings where id=true for update;
  if (select count(*) from public.ai_factory_jobs where status='running' and lease_until > now()) >=
     (select max_concurrency from public.ai_factory_settings where id=true) then return; end if;
  select * into j from public.ai_factory_jobs
    where (status='queued' or (status='running' and lease_until < now())) and kind='listening_audio' and attempts < 5
    order by created_at for update skip locked limit 1;
  if not found then return; end if;
  update public.ai_factory_jobs set status='running',lease_token=p_token,lease_until=now()+interval '15 minutes',
    attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
  return next j;
end;
$$;
revoke all on function public.ai_factory_claim_job(uuid) from public;
grant execute on function public.ai_factory_claim_job(uuid) to service_role;

-- Unapproved drafts stay in a private bucket. Approved audio is copied to the existing public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ai-factory-drafts','ai-factory-drafts',false,20000000,array['audio/mpeg'])
on conflict(id) do nothing;
