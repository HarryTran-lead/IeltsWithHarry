-- Card details for the question-bank library (question types, counts, a short preview,
-- the Writing visual and how many attempts an exam has had) without sending full passages.
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
    v.content->>'imageUrl',
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
