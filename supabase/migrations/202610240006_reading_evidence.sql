alter table public.exercise_answer_keys add column evidence text not null default '';

create function public.admin_save_question_with_evidence(
  p_question_id uuid, p_lesson_id uuid, p_slug text, p_prompt text,
  p_options jsonb, p_correct_index integer, p_explanation text, p_evidence text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_slug !~ '^[a-z0-9-]+$' or char_length(p_prompt) < 3 or
     jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 6 or
     p_correct_index not between 0 and jsonb_array_length(p_options) - 1 or
     char_length(p_evidence) > 2000 then raise exception 'Invalid question'; end if;
  if exists(select 1 from jsonb_array_elements(p_options) as x(value)
    where jsonb_typeof(x.value) <> 'string' or length(trim(x.value #>> '{}')) = 0) then
    raise exception 'Invalid options';
  end if;
  if p_question_id is null then
    insert into public.exercise_questions(lesson_id, slug, prompt, options, sort_order)
    values(p_lesson_id, p_slug, p_prompt, p_options,
      coalesce((select max(sort_order) + 1 from public.exercise_questions where lesson_id = p_lesson_id), 0))
    returning id into v_id;
  else
    update public.exercise_questions set slug=p_slug, prompt=p_prompt, options=p_options
    where id=p_question_id and lesson_id=p_lesson_id returning id into v_id;
    if v_id is null then raise exception 'Question unavailable'; end if;
  end if;
  insert into public.exercise_answer_keys(question_id,correct_index,explanation,evidence)
  values(v_id,p_correct_index,p_explanation,p_evidence)
  on conflict(question_id) do update set correct_index=excluded.correct_index,
    explanation=excluded.explanation,evidence=excluded.evidence;
  return v_id;
end;
$$;
revoke all on function public.admin_save_question_with_evidence(uuid, uuid, text, text, jsonb, integer, text, text) from public;
grant execute on function public.admin_save_question_with_evidence(uuid, uuid, text, text, jsonb, integer, text, text) to authenticated;

create or replace function public.submit_exercise(p_lesson_slug text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_lesson public.lessons%rowtype;
  v_total integer;
  v_score integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 8192 then raise exception 'Invalid answers'; end if;
  select l.* into v_lesson from public.lessons l
  join public.units u on u.id = l.unit_id
  join public.courses c on c.id = u.course_id
  where l.slug = p_lesson_slug and l.published and u.published and c.published;
  if not found then raise exception 'Lesson unavailable'; end if;
  select count(*), count(*) filter (where (p_answers ->> q.slug) ~ '^[0-5]$' and (p_answers ->> q.slug)::integer = k.correct_index)
  into v_total, v_score from public.exercise_questions q
  join public.exercise_answer_keys k on k.question_id = q.id where q.lesson_id = v_lesson.id;
  if v_total = 0 or v_total > 50 then raise exception 'Exercise unavailable'; end if;
  insert into public.exercise_attempts(user_id, lesson_slug, score, total, answers)
  values (v_user, p_lesson_slug, v_score, v_total, p_answers);
  update public.study_tasks set completed = true
  where id = (select id from public.study_tasks
    where user_id = v_user and lesson_slug = p_lesson_slug and completed = false
    order by due_date, sort_order, created_at limit 1);
  select jsonb_agg(jsonb_build_object('slug', q.slug, 'correctIndex', k.correct_index,
    'explanation', k.explanation, 'evidence', k.evidence) order by q.sort_order)
  into v_result from public.exercise_questions q join public.exercise_answer_keys k on k.question_id = q.id
  where q.lesson_id = v_lesson.id;
  return jsonb_build_object('score', v_score, 'total', v_total, 'review', v_result);
end;
$$;

update public.exercise_answer_keys set evidence = case q.slug
  when 'q1' then 'Maya and her neighbours turned an empty space beside their apartment building into a community garden.'
  when 'q2' then 'Every Saturday morning, families water the plants together.'
  when 'q3' then 'Maya says the best part is seeing children learn where vegetables come from.'
  else '' end
from public.exercise_questions q join public.lessons l on l.id = q.lesson_id
where q.id = question_id and l.slug = 'reading-city-gardens' and evidence = '';
