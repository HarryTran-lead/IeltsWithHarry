-- AI-generated cover illustrations for Reading, Listening and Writing (Task 2 / General
-- Training Task 1) cards in the IELTS question bank. Task 1 Academic figures remain in
-- ielts_exam_versions.content->>'imageUrl' and take precedence when present.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'ielts-images';

alter table public.ielts_exams
  add column if not exists cover_image_url text
  check (
    cover_image_url is null
    or cover_image_url ~ '^https://[a-z0-9.-]+/storage/v1/object/public/ielts-images/covers/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );

create or replace function public.ielts_catalog_summary(p_skill text default null)
returns table (
  exam_id uuid,
  question_types text[],
  question_count integer,
  task_type text,
  visual_kind text,
  visual jsonb,
  image_url text,
  prompt_preview text,
  question_preview text[],
  attempt_count integer
)
language sql stable security definer set search_path = '' as $$
  select
    e.id,
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
    -- Small visuals only: enough to draw a thumbnail of the chart, table or map.
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
  where e.status = 'published' and (p_skill is null or e.skill = p_skill);
$$;

revoke all on function public.ielts_catalog_summary(text) from public, anon, authenticated;
grant execute on function public.ielts_catalog_summary(text) to service_role;
