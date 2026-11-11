-- Opt-in, cached coaching report. The original grade stays immutable.
create table public.writing_deep_reports (
  job_id uuid primary key references public.writing_grading_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('analyzing','completed','failed')),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or result is not null)
);
create index writing_deep_reports_user_idx on public.writing_deep_reports(user_id, created_at desc);
alter table public.writing_deep_reports enable row level security;
create policy writing_deep_reports_own on public.writing_deep_reports
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.writing_deep_reports from anon, authenticated;
grant select on public.writing_deep_reports to authenticated;

-- A single request owns an inference lease; duplicate clicks reuse the row.
create function public.writing_claim_deep_report(p_job_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid();
declare claimed uuid;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.writing_grading_jobs j
    where j.id = p_job_id and j.user_id = p_user_id and j.status = 'completed'
  ) then return null; end if;
  insert into public.writing_deep_reports(job_id,user_id,status,lease_token,lease_until)
  values(p_job_id,p_user_id,'analyzing',token,now() + interval '75 seconds')
  on conflict (job_id) do update set
    status = 'analyzing', lease_token = token, lease_until = now() + interval '75 seconds',
    error_code = null, updated_at = now()
  where public.writing_deep_reports.status = 'failed'
    or (public.writing_deep_reports.status = 'analyzing' and public.writing_deep_reports.lease_until < now())
  returning lease_token into claimed;
  return claimed;
end;
$$;
revoke all on function public.writing_claim_deep_report(uuid,uuid) from public, anon, authenticated;
grant execute on function public.writing_claim_deep_report(uuid,uuid) to service_role;
