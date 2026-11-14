-- Private, opt-in Part 2 coaching. Existing recordings remain in Supabase Storage.
create table public.speaking_coaching_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.speaking_mock_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_index integer not null check (answer_index between 0 and 49),
  question_snapshot text not null check (char_length(question_snapshot) between 1 and 1000),
  recording_path text not null,
  status text not null default 'queued' check (status in ('queued','analyzing','completed','failed')),
  attempt_no integer not null default 0 check (attempt_no between 0 and 3),
  error_code text,
  result jsonb,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (result is not null))
);
create index speaking_coaching_queue_idx on public.speaking_coaching_jobs(status, available_at, created_at);
create index speaking_coaching_user_idx on public.speaking_coaching_jobs(user_id, created_at desc);
alter table public.speaking_coaching_jobs enable row level security;
create policy speaking_coaching_own on public.speaking_coaching_jobs for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.speaking_coaching_jobs from anon, authenticated;
grant select on public.speaking_coaching_jobs to authenticated;
grant all on public.speaking_coaching_jobs to service_role;

create function public.speaking_claim_coaching_job(p_lease_seconds integer default 900)
returns public.speaking_coaching_jobs language plpgsql security definer set search_path = '' as $$
declare claimed public.speaking_coaching_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if p_lease_seconds < 60 or p_lease_seconds > 1800 then raise exception 'Invalid lease'; end if;
  update public.speaking_coaching_jobs set status='failed', error_code='WORKER_LEASE_EXHAUSTED',
    lease_token=null, lease_until=null, updated_at=now()
  where status='analyzing' and lease_until < now() and attempt_no >= 3;
  select * into claimed from public.speaking_coaching_jobs j
  where ((j.status='queued' and j.available_at <= now()) or (j.status='analyzing' and j.lease_until < now()))
    and j.attempt_no < 3
  order by j.created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.speaking_coaching_jobs set status='analyzing', attempt_no=attempt_no+1,
    lease_token=gen_random_uuid(), lease_until=now()+make_interval(secs => p_lease_seconds),
    error_code=null, updated_at=now()
  where id=claimed.id returning * into claimed;
  return claimed;
end;
$$;
revoke all on function public.speaking_claim_coaching_job(integer) from public, anon, authenticated;
grant execute on function public.speaking_claim_coaching_job(integer) to service_role;

create function public.speaking_finish_coaching_job(p_job_id uuid, p_lease_token uuid, p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed public.speaking_coaching_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'Invalid result'; end if;
  select * into claimed from public.speaking_coaching_jobs where id=p_job_id for update;
  if not found or claimed.status <> 'analyzing' or claimed.lease_token is distinct from p_lease_token
     or claimed.lease_until <= now() then return false; end if;
  update public.speaking_coaching_jobs set status='completed', result=p_result,
    lease_token=null, lease_until=null, updated_at=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.speaking_finish_coaching_job(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.speaking_finish_coaching_job(uuid,uuid,jsonb) to service_role;
