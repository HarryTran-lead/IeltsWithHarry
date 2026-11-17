-- M10-L26: make per-activity cooldown deletion-proof and transactionally
-- consistent with the L25 atomic attempt admission routine.
-- DO NOT apply to production. Disposable Supabase staging only, after L25.
create table public.speaking_s6_activity_cooldowns (
  user_id uuid not null references auth.users(id) on delete cascade,
  preview boolean not null,
  activity_id text not null check (activity_id ~ '^S6-[0-9]{3}-[GIM][0-9]{2}$'),
  last_started_at timestamptz not null default now(),
  primary key (user_id, preview, activity_id)
);
alter table public.speaking_s6_activity_cooldowns enable row level security;
revoke all on public.speaking_s6_activity_cooldowns from anon, authenticated;

-- Retain the same service-role-only signature and grant.
create or replace function public.speaking_s6_start_attempt_l25(
  p_user_id uuid,
  p_lesson_code text,
  p_revision text,
  p_activity_id text,
  p_mode text,
  p_preview boolean,
  p_audio_storage_consent boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hour timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_day date := (now() at time zone 'UTC')::date;
  v_quota public.speaking_s6_start_quotas%rowtype;
  v_hour_count integer;
  v_day_count integer;
  v_max_hour integer := case when p_preview then 36 else 8 end;
  v_max_day integer := case when p_preview then 180 else 30 end;
  v_attempt uuid;
begin
  if p_user_id is null or p_lesson_code is null or p_revision is null
    or p_activity_id is null or p_preview is null or p_audio_storage_consent is null
    or p_mode is null or p_mode not in ('guided','independent','mastery')
    or p_activity_id !~ '^S6-[0-9]{3}-[GIM][0-9]{2}$'
    or left(p_activity_id,length(p_lesson_code)+1) <> p_lesson_code || '-'
    or right(p_activity_id,3) not like
      (case p_mode when 'guided' then 'G%' when 'independent' then 'I%' else 'M%' end)
  then
    raise exception 'S6_START_INVALID' using errcode = 'P0001';
  end if;

  -- Defense in depth: user-specific S5 and global release gates checked
  -- again at the SQL transaction boundary, not only in the route.
  if not p_preview and (
    not public.speaking_s6_release_ready()
    or not exists (
      select 1 from public.speaking_s6_s5_eligibility e
      where e.user_id = p_user_id and e.s5_verified = true
        and e.verified_by is not null and e.verified_at is not null
        and nullif(btrim(e.evidence_reference),'') is not null
    )
  ) then
    raise exception 'S6_LOCKED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.speaking_s6_lesson_revisions r
    where r.lesson_code = p_lesson_code and r.revision = p_revision
      and r.status = case when p_preview then 'staging' else 'published' end
  ) then
    raise exception 'S6_REVISION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Ensure a row exists; SELECT FOR UPDATE serializes starts across all
  -- serverless instances for this user+preview identity.
  insert into public.speaking_s6_start_quotas
    (user_id,preview,hour_window,day_window,hour_count,day_count)
  values (p_user_id,p_preview,v_hour,v_day,0,0)
  on conflict (user_id,preview) do nothing;

  select * into strict v_quota from public.speaking_s6_start_quotas q
    where q.user_id = p_user_id and q.preview = p_preview for update;
  v_hour_count := case when v_quota.hour_window = v_hour then v_quota.hour_count else 0 end;
  v_day_count := case when v_quota.day_window = v_day then v_quota.day_count else 0 end;

  if v_hour_count >= v_max_hour or v_day_count >= v_max_day then
    raise exception 'S6_START_RATE_LIMIT' using errcode = 'P0001';
  end if;

  -- This table is independent of attempts. Deleting an attempt does NOT
  -- reset cooldown, and the user+preview quota lock serializes contenders.
  if exists (
    select 1 from public.speaking_s6_activity_cooldowns c
    where c.user_id = p_user_id and c.preview = p_preview
      and c.activity_id = p_activity_id
      and c.last_started_at > now() - interval '10 minutes'
  ) then
    raise exception 'S6_START_COOLDOWN' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.speaking_s6_attempts a
    where a.user_id = p_user_id and a.preview = p_preview
      and a.phase = 'started' and a.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'S6_START_ACTIVE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.speaking_s6_attempts
    (user_id,lesson_code,revision,activity_id,mode,preview,audio_storage_consent)
  values (p_user_id,p_lesson_code,p_revision,p_activity_id,p_mode,p_preview,p_audio_storage_consent)
  returning id into v_attempt;

  -- Same transaction as the attempt and counters: any failure rolls back
  -- all three writes, never leaving a partial quota/cooldown state.
  insert into public.speaking_s6_activity_cooldowns
    (user_id,preview,activity_id,last_started_at)
  values (p_user_id,p_preview,p_activity_id,now())
  on conflict (user_id,preview,activity_id) do update
    set last_started_at = excluded.last_started_at;

  update public.speaking_s6_start_quotas q set
    hour_window = v_hour,day_window = v_day,
    hour_count = v_hour_count + 1,day_count = v_day_count + 1,updated_at = now()
  where q.user_id = p_user_id and q.preview = p_preview;
  return v_attempt;
end $$;

revoke all on function public.speaking_s6_start_attempt_l25(
  uuid,text,text,text,text,boolean,boolean
) from public,anon,authenticated;
grant execute on function public.speaking_s6_start_attempt_l25(
  uuid,text,text,text,text,boolean,boolean
) to service_role;

comment on table public.speaking_s6_activity_cooldowns is
  'Private per-account cooldown. Survives attempt deletion, CASCADE only on account deletion. No learner SELECT.';
-- No staging release gates or S7 unlock are changed here.
