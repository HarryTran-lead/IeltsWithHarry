-- IELTS bank is separate from curriculum exercises; no existing lesson or attempt is changed.
create table public.ielts_sources (
  id text primary key, name text not null, repository_url text not null,
  license text not null, license_url text not null, approved boolean not null default false,
  enabled boolean not null default true, sync_hours integer not null default 24 check (sync_hours between 1 and 720),
  cursor text, last_synced_at timestamptz, created_at timestamptz not null default now()
);
insert into public.ielts_sources(id,name,repository_url,license,license_url,approved) values
('bandready','BandReady Core','https://github.com/Luxshan2000/ielts-prep','CC0-1.0','https://creativecommons.org/publicdomain/zero/1.0/',true),
('ielts-ai-dataset','IELTS AI Dataset','https://github.com/LuchoBazz/ielts-ai-dataset','CC-BY-4.0','https://creativecommons.org/licenses/by/4.0/',true),
('manual','Admin upload','https://example.invalid/manual','Admin-confirmed','https://example.invalid/manual-license',true);
update public.ielts_sources set enabled=false where id='manual';

create table public.ielts_import_jobs (
  id uuid primary key default gen_random_uuid(), source_id text not null references public.ielts_sources(id),
  status text not null default 'running' check(status in ('running','completed','partial','failed','cancelled')),
  dry_run boolean not null default false, started_by uuid references auth.users(id),
  cursor_before text, cursor_after text, inserted integer not null default 0,
  target_version text, paths jsonb not null default '[]'::jsonb,
  path_index integer not null default 0, row_index integer not null default 0,
  lease_token uuid, lease_until timestamptz,
  updated integer not null default 0, skipped integer not null default 0, failed integer not null default 0,
  error text, started_at timestamptz not null default now(), finished_at timestamptz
);
create index ielts_import_jobs_source_idx on public.ielts_import_jobs(source_id,started_at desc);
create unique index ielts_import_one_running_idx on public.ielts_import_jobs(source_id,dry_run) where status='running';
create table public.ielts_import_items (
  id bigint generated always as identity primary key, job_id uuid not null references public.ielts_import_jobs(id),
  external_id text not null, status text not null, detail text, created_at timestamptz not null default now()
);
create index ielts_import_items_job_idx on public.ielts_import_items(job_id);

create table public.ielts_exams (
  id uuid primary key default gen_random_uuid(), source_id text not null references public.ielts_sources(id),
  external_id text not null, skill text not null check(skill in ('Reading','Listening','Writing','Speaking')),
  format text not null default 'Academic', mode text not null default 'practice',
  title text not null, topic text, difficulty text, duration_minutes integer not null default 20,
  license text not null, license_url text not null, source_url text not null,
  attribution text not null, ai_generated boolean not null default false,
  status text not null default 'needs_review' check(status in ('needs_review','ready','published','rejected','archived')),
  current_version_id uuid, published_version_id uuid, upstream_missing boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_id,external_id)
);
create index ielts_exams_library_idx on public.ielts_exams(status,skill,created_at desc);
create table public.ielts_exam_versions (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.ielts_exams(id),
  revision integer not null, upstream_version text not null, content_hash text not null,
  content jsonb not null, warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), unique(exam_id,revision)
);
create index ielts_versions_hash_idx on public.ielts_exam_versions(content_hash);
alter table public.ielts_exams add constraint ielts_current_version_fk foreign key(current_version_id) references public.ielts_exam_versions(id);
alter table public.ielts_exams add constraint ielts_published_version_fk foreign key(published_version_id) references public.ielts_exam_versions(id);
create table public.ielts_attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.ielts_exams(id), version_id uuid not null references public.ielts_exam_versions(id),
  state text not null default 'in_progress' check(state in ('in_progress','submitted','expired')),
  answers jsonb not null default '{}'::jsonb, flags jsonb not null default '[]'::jsonb,
  notes jsonb not null default '{}'::jsonb, started_at timestamptz not null default now(),
  submitted_at timestamptz, score integer, total integer,
  check(jsonb_typeof(answers)='object' and pg_column_size(answers) < 65536)
);
create index ielts_attempts_user_idx on public.ielts_attempts(user_id,started_at desc);
create table public.ielts_review_log (
  id bigint generated always as identity primary key, exam_id uuid not null references public.ielts_exams(id),
  version_id uuid references public.ielts_exam_versions(id), actor_id uuid references auth.users(id),
  action text not null, note text not null default '', created_at timestamptz not null default now()
);

alter table public.ielts_sources enable row level security;
alter table public.ielts_import_jobs enable row level security;
alter table public.ielts_import_items enable row level security;
alter table public.ielts_exams enable row level security;
alter table public.ielts_exam_versions enable row level security;
alter table public.ielts_attempts enable row level security;
alter table public.ielts_review_log enable row level security;
create policy ielts_sources_admin on public.ielts_sources for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy ielts_jobs_admin on public.ielts_import_jobs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy ielts_items_admin on public.ielts_import_items for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy ielts_exams_admin on public.ielts_exams for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy ielts_versions_admin on public.ielts_exam_versions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy ielts_attempts_own on public.ielts_attempts for select to authenticated using(user_id=auth.uid());
create policy ielts_reviews_admin on public.ielts_review_log for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.ielts_sources,public.ielts_import_jobs,public.ielts_import_items,public.ielts_exams,public.ielts_exam_versions,public.ielts_attempts,public.ielts_review_log from anon,authenticated;
grant select,update(enabled,sync_hours) on public.ielts_sources to authenticated;
grant select on public.ielts_import_jobs,public.ielts_import_items,public.ielts_exams,public.ielts_exam_versions,public.ielts_attempts,public.ielts_review_log to authenticated;

-- Atomic idempotent import. Published versions remain immutable and attempts pin a version.
create function public.ielts_upsert_import(p_source text,p_external text,p_meta jsonb,p_content jsonb,p_hash text,p_upstream text,p_warnings jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare e public.ielts_exams%rowtype; v uuid; n integer;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  select * into e from public.ielts_exams where source_id=p_source and external_id=p_external for update;
  if found and exists(select 1 from public.ielts_exam_versions where id=e.current_version_id and content_hash=p_hash) then return 'skipped'; end if;
  if not found then
    insert into public.ielts_exams(source_id,external_id,skill,format,mode,title,topic,difficulty,duration_minutes,license,license_url,source_url,attribution,ai_generated)
    values(p_source,p_external,p_meta->>'skill',coalesce(p_meta->>'format','Academic'),coalesce(p_meta->>'mode','practice'),p_meta->>'title',p_meta->>'topic',p_meta->>'difficulty',coalesce((p_meta->>'duration_minutes')::integer,20),p_meta->>'license',p_meta->>'license_url',p_meta->>'source_url',p_meta->>'attribution',coalesce((p_meta->>'ai_generated')::boolean,false)) returning * into e;
    n:=1;
  else
    select coalesce(max(revision),0)+1 into n from public.ielts_exam_versions where exam_id=e.id;
    update public.ielts_exams set skill=p_meta->>'skill',format=coalesce(p_meta->>'format','Academic'),mode=coalesce(p_meta->>'mode','practice'),title=p_meta->>'title',topic=p_meta->>'topic',difficulty=p_meta->>'difficulty',duration_minutes=coalesce((p_meta->>'duration_minutes')::integer,20),license=p_meta->>'license',license_url=p_meta->>'license_url',source_url=p_meta->>'source_url',attribution=p_meta->>'attribution',ai_generated=coalesce((p_meta->>'ai_generated')::boolean,false) where id=e.id;
  end if;
  insert into public.ielts_exam_versions(exam_id,revision,upstream_version,content_hash,content,warnings)
  values(e.id,n,p_upstream,p_hash,p_content,p_warnings) returning id into v;
  update public.ielts_exams set current_version_id=v,status='needs_review',upstream_missing=false,updated_at=now() where id=e.id;
  return case when n=1 then 'inserted' else 'updated' end;
end;
$$;
revoke all on function public.ielts_upsert_import(text,text,jsonb,jsonb,text,text,jsonb) from public;
grant execute on function public.ielts_upsert_import(text,text,jsonb,jsonb,text,text,jsonb) to service_role;

create function public.ielts_claim_job(p_job uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  update public.ielts_import_jobs set lease_token=p_token,lease_until=now()+interval '5 minutes'
  where id=p_job and status='running' and (lease_until is null or lease_until < now());
  return found;
end;
$$;
revoke all on function public.ielts_claim_job(uuid,uuid) from public;
grant execute on function public.ielts_claim_job(uuid,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ielts-audio','ielts-audio',true,20000000,array['audio/mpeg']) on conflict(id) do nothing;
create policy ielts_audio_public_read on storage.objects for select to anon,authenticated
using(bucket_id='ielts-audio');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ielts-images','ielts-images',true,10000000,array['image/png','image/jpeg']) on conflict(id) do nothing;
create policy ielts_images_public_read on storage.objects for select to anon,authenticated
using(bucket_id='ielts-images');
