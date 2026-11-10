-- Additive Writing grading foundation. Existing IELTS attempts and legacy feedback remain intact.
create table public.writing_grading_source_facts (
  exam_version_id uuid primary key references public.ielts_exam_versions(id) on delete cascade,
  facts jsonb not null check (jsonb_typeof(facts) = 'array'),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now()
);

create table public.writing_grading_jobs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ielts_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null check (task_type in ('academic_task1','academic_task2')),
  request_kind text not null default 'initial' check (request_kind in ('initial','regrade')),
  pipeline_version text not null,
  status text not null default 'queued' check (status in ('queued','analyzing','completed','partial','needs_review','failed')),
  prompt_snapshot text not null,
  visual_snapshot jsonb,
  essay_snapshot text not null check (char_length(essay_snapshot) between 1 and 20000),
  prompt_sha256 text not null check (prompt_sha256 ~ '^[a-f0-9]{64}$'),
  essay_sha256 text not null check (essay_sha256 ~ '^[a-f0-9]{64}$'),
  exam_version_id uuid not null references public.ielts_exam_versions(id),
  attempt_no integer not null default 0 check (attempt_no between 0 and 3),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id,pipeline_version,request_kind)
);
create index writing_grading_jobs_queue_idx on public.writing_grading_jobs(status,available_at,created_at);
create index writing_grading_jobs_user_idx on public.writing_grading_jobs(user_id,created_at desc);

create table public.writing_grading_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.writing_grading_jobs(id) on delete cascade,
  attempt_id uuid not null references public.ielts_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version text not null,
  rubric_version text not null,
  model_version text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);
create index writing_grading_results_attempt_idx on public.writing_grading_results(attempt_id,created_at desc);
create function public.writing_grading_result_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Writing grading results are immutable';
end;
$$;
create trigger writing_grading_result_no_update before update on public.writing_grading_results
  for each row execute function public.writing_grading_result_immutable();

create table public.writing_teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.writing_grading_results(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  criterion_scores jsonb not null check (jsonb_typeof(criterion_scores) = 'object'),
  rationale text not null check (char_length(rationale) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.writing_model_registry (
  id uuid primary key default gen_random_uuid(),
  model_id text not null, revision text not null,
  task_type text not null check (task_type in ('academic_task1','academic_task2')),
  weights_license text not null, license_decision text not null default 'unverified',
  training_data_rights text not null default 'unverified',
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  evaluation_report_ref text not null,
  status text not null default 'blocked' check (status in ('blocked','approved','retired')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (model_id,revision,task_type),
  check (status <> 'approved' or (license_decision = 'approved' and training_data_rights = 'approved'
    and reviewed_by is not null and reviewed_at is not null and length(evaluation_report_ref) > 0))
);

create table public.writing_dataset_manifest (
  id uuid primary key default gen_random_uuid(),
  source_ref text not null, source_type text not null,
  license_status text not null default 'unverified',
  consent_status text not null default 'not_given' check (consent_status in ('not_given','opted_in','withdrawn','not_applicable')),
  quality_tier text not null default 'quarantined' check (quality_tier in ('gold','silver','bronze','quarantined')),
  training_allowed boolean not null default false,
  reviewer_id uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (not training_allowed or (consent_status in ('opted_in','not_applicable') and license_status = 'approved' and quality_tier <> 'quarantined' and reviewer_id is not null))
);

alter table public.writing_grading_source_facts enable row level security;
alter table public.writing_grading_jobs enable row level security;
alter table public.writing_grading_results enable row level security;
alter table public.writing_teacher_reviews enable row level security;
alter table public.writing_model_registry enable row level security;
alter table public.writing_dataset_manifest enable row level security;
create policy writing_source_facts_admin on public.writing_grading_source_facts for select to authenticated using (public.is_admin());
create policy writing_jobs_own on public.writing_grading_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy writing_results_own on public.writing_grading_results for select to authenticated using (user_id = (select auth.uid()));
create policy writing_reviews_admin on public.writing_teacher_reviews for select to authenticated using (public.is_admin());
create policy writing_models_admin on public.writing_model_registry for select to authenticated using (public.is_admin());
create policy writing_datasets_admin on public.writing_dataset_manifest for select to authenticated using (public.is_admin());
revoke all on public.writing_grading_source_facts, public.writing_grading_jobs, public.writing_grading_results, public.writing_teacher_reviews, public.writing_model_registry, public.writing_dataset_manifest from anon, authenticated;
grant select on public.writing_grading_jobs, public.writing_grading_results to authenticated;
grant select on public.writing_grading_source_facts, public.writing_teacher_reviews to authenticated;
grant select on public.writing_model_registry, public.writing_dataset_manifest to authenticated;

-- Service-role-only atomic claim with a lease. A crash can be safely retried.
create function public.writing_claim_grading_job(p_lease_seconds integer default 180)
returns public.writing_grading_jobs language plpgsql security definer set search_path = '' as $$
declare claimed public.writing_grading_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'Invalid lease'; end if;
  update public.writing_grading_jobs j set
    status = 'completed', lease_token = null, lease_until = null, updated_at = now()
  where j.status = 'analyzing' and j.lease_until < now()
    and exists (select 1 from public.writing_grading_results r where r.job_id = j.id);
  update public.writing_grading_jobs j set
    status = 'failed', error_code = 'WORKER_LEASE_EXHAUSTED',
    lease_token = null, lease_until = null, updated_at = now()
  where j.status = 'analyzing' and j.lease_until < now() and j.attempt_no >= 3
    and not exists (select 1 from public.writing_grading_results r where r.job_id = j.id);
  select * into claimed from public.writing_grading_jobs j
  where ((j.status = 'queued' and j.available_at <= now())
      or (j.status = 'analyzing' and j.lease_until < now()))
    and j.attempt_no < 3
    and not exists (select 1 from public.writing_grading_results r where r.job_id = j.id)
  order by j.created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.writing_grading_jobs set status = 'analyzing', attempt_no = attempt_no + 1,
    lease_token = gen_random_uuid(), lease_until = now() + make_interval(secs => p_lease_seconds),
    error_code = null, updated_at = now()
  where id = claimed.id returning * into claimed;
  return claimed;
end;
$$;
revoke all on function public.writing_claim_grading_job(integer) from public, anon, authenticated;
grant execute on function public.writing_claim_grading_job(integer) to service_role;

-- Fence stale workers and commit the immutable result plus job completion atomically.
create function public.writing_finish_grading_job(
  p_job_id uuid, p_lease_token uuid, p_result_id uuid, p_result jsonb,
  p_schema_version text, p_rubric_version text, p_model_version text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed public.writing_grading_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  select * into claimed from public.writing_grading_jobs where id = p_job_id for update;
  if not found or claimed.status <> 'analyzing' or claimed.lease_token is distinct from p_lease_token
     or claimed.lease_until <= now() then return false; end if;
  if exists (select 1 from public.writing_grading_results where job_id = p_job_id) then
    update public.writing_grading_jobs set status='completed', lease_token=null, lease_until=null, updated_at=now() where id=p_job_id;
    return true;
  end if;
  insert into public.writing_grading_results(id,job_id,attempt_id,user_id,schema_version,rubric_version,model_version,result)
    values(p_result_id,p_job_id,claimed.attempt_id,claimed.user_id,p_schema_version,p_rubric_version,p_model_version,p_result);
  update public.writing_grading_jobs set status='completed', lease_token=null, lease_until=null, updated_at=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.writing_finish_grading_job(uuid,uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.writing_finish_grading_job(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
