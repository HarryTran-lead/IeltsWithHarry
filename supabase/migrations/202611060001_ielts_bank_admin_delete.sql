-- One exam is removed atomically, including records that require its versions.
-- Only the server's service role can call this after an admin session check.
create table if not exists public.ielts_import_skill_pauses (
  skill text primary key check (skill in ('Reading', 'Listening', 'Writing', 'Speaking')),
  paused boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.ielts_import_skill_pauses enable row level security;
revoke all on public.ielts_import_skill_pauses from anon, authenticated;
create table if not exists public.ielts_import_exam_exclusions (
  source_id text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (source_id, external_id)
);
alter table public.ielts_import_exam_exclusions enable row level security;
revoke all on public.ielts_import_exam_exclusions from anon, authenticated;

-- Preserve the installed importer while allowing a skill to be cleared without
-- the next scheduled source sync filling it again. Manual reviewed uploads work.
do $$
begin
  if to_regprocedure('public.ielts_upsert_import_unfiltered(text,text,jsonb,jsonb,text,text,jsonb)') is null then
    alter function public.ielts_upsert_import(text,text,jsonb,jsonb,text,text,jsonb)
      rename to ielts_upsert_import_unfiltered;
  end if;
end $$;

create or replace function public.ielts_upsert_import(
  p_source text, p_external text, p_meta jsonb, p_content jsonb,
  p_hash text, p_upstream text, p_warnings jsonb
) returns text language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(773221, pg_catalog.hashtext(p_meta->>'skill'));
  if p_source <> 'manual' and exists (
    select 1 from public.ielts_import_exam_exclusions
    where source_id = p_source and external_id = p_external
  ) then return 'skipped'; end if;
  if p_source <> 'manual' and exists (
    select 1 from public.ielts_import_skill_pauses
    where skill = p_meta->>'skill' and paused
  ) then return 'skipped'; end if;
  return public.ielts_upsert_import_unfiltered(
    p_source, p_external, p_meta, p_content, p_hash, p_upstream, p_warnings
  );
end;
$$;
revoke all on function public.ielts_upsert_import(text,text,jsonb,jsonb,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.ielts_upsert_import(text,text,jsonb,jsonb,text,text,jsonb) to service_role;

create or replace function public.ielts_delete_exam(p_exam uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target public.ielts_exams%rowtype;
  target_skill text;
  attempt_count integer;
  job_count integer;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  select skill into target_skill from public.ielts_exams where id = p_exam;
  if not found then raise exception 'Exam unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(773221, pg_catalog.hashtext(target_skill));
  select * into target from public.ielts_exams where id = p_exam for update;
  if not found then raise exception 'Exam unavailable'; end if;
  if target.source_id <> 'manual' then
    insert into public.ielts_import_exam_exclusions(source_id, external_id)
    values (target.source_id, target.external_id)
    on conflict do nothing;
  end if;

  select count(*) into attempt_count from public.ielts_attempts where exam_id = p_exam;
  select count(*) into job_count from public.ai_factory_jobs
    where exam_id = p_exam or exam_version_id in
      (select id from public.ielts_exam_versions where exam_id = p_exam);

  delete from public.ai_factory_usage where job_id in (
    select id from public.ai_factory_jobs
    where exam_id = p_exam or exam_version_id in
      (select id from public.ielts_exam_versions where exam_id = p_exam)
  );
  delete from public.ai_factory_jobs where exam_id = p_exam or exam_version_id in
    (select id from public.ielts_exam_versions where exam_id = p_exam);
  delete from public.study_tasks where lesson_slug = 'ielts:' || p_exam::text;
  delete from public.ielts_attempts where exam_id = p_exam;
  delete from public.ielts_review_log where exam_id = p_exam;
  update public.ielts_exams set current_version_id = null, published_version_id = null where id = p_exam;
  delete from public.ielts_exam_versions where exam_id = p_exam;
  delete from public.ielts_exams where id = p_exam;
  return jsonb_build_object('deleted', p_exam, 'skill', target.skill,
    'attempts', attempt_count, 'factoryJobs', job_count);
end;
$$;
revoke all on function public.ielts_delete_exam(uuid) from public, anon, authenticated;
grant execute on function public.ielts_delete_exam(uuid) to service_role;

-- Bulk cleanup uses the same per-exam transaction path. Intended for replacing
-- an entire unreviewed skill bank; called only after typed UI confirmation.
create or replace function public.ielts_delete_skill_exams(p_skill text)
returns integer language plpgsql security definer set search_path='' as $$
declare exam_row record; removed integer := 0;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  if p_skill not in ('Reading', 'Listening', 'Writing', 'Speaking') then
    raise exception 'Unknown skill';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(773221, pg_catalog.hashtext(p_skill));
  insert into public.ielts_import_skill_pauses(skill, paused, updated_at)
  values (p_skill, true, now())
  on conflict (skill) do update set paused = true, updated_at = now();
  delete from public.ai_factory_usage where job_id in (
    select id from public.ai_factory_jobs
    where kind = case when p_skill = 'Listening' then 'listening_audio' else lower(p_skill) end
  );
  delete from public.ai_factory_jobs
  where kind = case when p_skill = 'Listening' then 'listening_audio' else lower(p_skill) end;
  for exam_row in select id from public.ielts_exams where skill = p_skill order by id loop
    perform public.ielts_delete_exam(exam_row.id);
    removed := removed + 1;
  end loop;
  return removed;
end;
$$;
revoke all on function public.ielts_delete_skill_exams(text) from public, anon, authenticated;
grant execute on function public.ielts_delete_skill_exams(text) to service_role;

-- A newer editorial draft does not hide the already published revision.
create or replace function public.ielts_catalog_summary(p_skill text default null)
returns table (
  exam_id uuid, question_types text[], question_count integer, task_type text,
  visual_kind text, visual jsonb, image_url text, prompt_preview text,
  question_preview text[], attempt_count integer
)
language sql stable security definer set search_path = '' as $$
  select e.id,
    coalesce(array(
      select distinct q->>'type'
      from jsonb_array_elements(coalesce(v.content->'sections', '[]'::jsonb)) s,
           jsonb_array_elements(coalesce(s->'questions', '[]'::jsonb)) q
      where q->>'type' is not null
    ), '{}'),
    (select count(*)::integer
      from jsonb_array_elements(coalesce(v.content->'sections', '[]'::jsonb)) s,
           jsonb_array_elements(coalesce(s->'questions', '[]'::jsonb)) q),
    v.content->>'taskType',
    case
      when jsonb_typeof(v.content->'visual') <> 'object' then null
      when v.content->'visual' ? 'snapshots' then 'map'
      when v.content->'visual' ? 'steps' then 'process'
      when v.content->'visual' ? 'panels' then 'mixed'
      when v.content->'visual' ? 'rows' then 'table'
      else coalesce(v.content->'visual'->>'kind', v.content->'visual'->>'chart_type', v.content->'visual'->>'type', case when v.content->'visual' ? 'series' then 'chart' end)
    end,
    case when jsonb_typeof(v.content->'visual') = 'object' and pg_column_size(v.content->'visual') < 6000 then v.content->'visual' end,
    coalesce(v.content->>'imageUrl', e.cover_image_url),
    left(nullif(v.content->>'prompt', ''), 280),
    coalesce(array(
      select left(q->>'prompt', 160)
      from jsonb_array_elements(coalesce(v.content->'sections', '[]'::jsonb)) s,
           jsonb_array_elements(coalesce(s->'questions', '[]'::jsonb)) q
      limit 3
    ), '{}'),
    (select count(*)::integer from public.ielts_attempts a where a.exam_id = e.id)
  from public.ielts_exams e
  join public.ielts_exam_versions v on v.id = e.published_version_id
  where p_skill is null or e.skill = p_skill;
$$;
revoke all on function public.ielts_catalog_summary(text) from public, anon, authenticated;
grant execute on function public.ielts_catalog_summary(text) to service_role;
