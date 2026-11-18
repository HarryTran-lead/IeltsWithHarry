-- Limit model retries per essay, including failures and expired requests.
alter table public.writing_deep_reports
  add column attempt_no integer not null default 0 check (attempt_no between 0 and 3);

create or replace function public.writing_claim_deep_report(p_job_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid();
declare claimed uuid;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.writing_grading_jobs j
    where j.id = p_job_id and j.user_id = p_user_id and j.status = 'completed'
  ) then return null; end if;
  insert into public.writing_deep_reports(job_id,user_id,status,lease_token,lease_until,attempt_no)
  values(p_job_id,p_user_id,'analyzing',token,now() + interval '75 seconds',1)
  on conflict (job_id) do update set
    status = 'analyzing', lease_token = token, lease_until = now() + interval '75 seconds',
    error_code = null, attempt_no = public.writing_deep_reports.attempt_no + 1, updated_at = now()
  where public.writing_deep_reports.attempt_no < 3
    and (public.writing_deep_reports.status = 'failed'
      or (public.writing_deep_reports.status = 'analyzing' and public.writing_deep_reports.lease_until < now()))
  returning lease_token into claimed;
  return claimed;
end;
$$;
