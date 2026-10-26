-- Keep the learner catalog grouped by exam format without loading full passages.
alter table public.ielts_exams add column if not exists practice_type text not null default 'practice';

create or replace function public.ielts_practice_type(p_skill text, p_format text, p_content jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when p_skill = 'Reading' and jsonb_array_length(coalesce(p_content->'sections', '[]'::jsonb)) >= 3 then 'full_test'
    when p_skill = 'Reading' then 'passage'
    when p_skill = 'Listening' and jsonb_array_length(coalesce(p_content->'sections', '[]'::jsonb)) >= 4 then 'full_test'
    when p_skill = 'Listening' then 'part'
    when p_skill = 'Writing' and (p_content->>'taskType' = 'gt_task1' or (p_format = 'General Training' and p_content->>'taskType' like '%task1%')) then 'task1_general'
    when p_skill = 'Writing' and p_content->>'taskType' like '%task1%' then 'task1_academic'
    when p_skill = 'Writing' then 'task2'
    when p_skill = 'Speaking' and p_content->>'speakingPart' in ('1','2','3') then 'part' || (p_content->>'speakingPart')
    else 'practice'
  end;
$$;

update public.ielts_exams e
set practice_type = public.ielts_practice_type(e.skill, e.format, v.content)
from public.ielts_exam_versions v
where v.id = e.current_version_id
  and e.practice_type is distinct from public.ielts_practice_type(e.skill, e.format, v.content);

create index if not exists ielts_exams_catalog_idx on public.ielts_exams(status, skill, practice_type, created_at desc);

-- Keep the grouping current whenever a source version changes.
create or replace function public.ielts_upsert_import(p_source text,p_external text,p_meta jsonb,p_content jsonb,p_hash text,p_upstream text,p_warnings jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare e public.ielts_exams%rowtype; v uuid; n integer; category text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role required'; end if;
  category := public.ielts_practice_type(p_meta->>'skill', coalesce(p_meta->>'format','Academic'), p_content);
  select * into e from public.ielts_exams where source_id=p_source and external_id=p_external for update;
  if found and exists(select 1 from public.ielts_exam_versions where id=e.current_version_id and content_hash=p_hash) then return 'skipped'; end if;
  if not found then
    insert into public.ielts_exams(source_id,external_id,skill,format,mode,title,topic,difficulty,duration_minutes,license,license_url,source_url,attribution,ai_generated,practice_type)
    values(p_source,p_external,p_meta->>'skill',coalesce(p_meta->>'format','Academic'),coalesce(p_meta->>'mode','practice'),p_meta->>'title',p_meta->>'topic',p_meta->>'difficulty',coalesce((p_meta->>'duration_minutes')::integer,20),p_meta->>'license',p_meta->>'license_url',p_meta->>'source_url',p_meta->>'attribution',coalesce((p_meta->>'ai_generated')::boolean,false),category) returning * into e;
    n:=1;
  else
    select coalesce(max(revision),0)+1 into n from public.ielts_exam_versions where exam_id=e.id;
    update public.ielts_exams set skill=p_meta->>'skill',format=coalesce(p_meta->>'format','Academic'),mode=coalesce(p_meta->>'mode','practice'),title=p_meta->>'title',topic=p_meta->>'topic',difficulty=p_meta->>'difficulty',duration_minutes=coalesce((p_meta->>'duration_minutes')::integer,20),license=p_meta->>'license',license_url=p_meta->>'license_url',source_url=p_meta->>'source_url',attribution=p_meta->>'attribution',ai_generated=coalesce((p_meta->>'ai_generated')::boolean,false),practice_type=category where id=e.id;
  end if;
  insert into public.ielts_exam_versions(exam_id,revision,upstream_version,content_hash,content,warnings)
  values(e.id,n,p_upstream,p_hash,p_content,p_warnings) returning id into v;
  update public.ielts_exams set current_version_id=v,status='needs_review',upstream_missing=false,updated_at=now() where id=e.id;
  return case when n=1 then 'inserted' else 'updated' end;
end;
$$;
