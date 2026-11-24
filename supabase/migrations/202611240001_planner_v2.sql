-- Planner 2.0: tasks remember how long they take, where they came from and when they were finished,
-- recurring tasks share a series id, a whole day can be reordered in one call, and finishing the linked
-- work anywhere in the app ticks the matching planner task. Additive only: existing rows keep working.

alter table public.study_tasks
  add column if not exists duration_minutes smallint check (duration_minutes between 5 and 240),
  add column if not exists source text not null default 'manual'
    check (source in ('manual','exam','dictation','vocabulary','grammar','news','lab','practice','suggestion','plan','teacher')),
  add column if not exists series_id uuid,
  add column if not exists completed_at timestamptz;

-- Rows finished before this migration get their creation time, so "done" lists can still be ordered.
update public.study_tasks set completed_at = created_at where completed and completed_at is null;
-- Tasks the admin handed out already carry assigned_by; name their source too.
update public.study_tasks set source = 'teacher' where assigned_by is not null and source = 'manual';

create index if not exists study_tasks_user_lesson_idx on public.study_tasks(user_id, lesson_slug) where not completed;
create index if not exists study_tasks_series_idx on public.study_tasks(user_id, series_id) where series_id is not null;

grant insert(duration_minutes, source, series_id) on public.study_tasks to authenticated;
grant update(duration_minutes, series_id) on public.study_tasks to authenticated;

-- completed_at follows completed; the client never writes it.
create or replace function public.study_tasks_stamp_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_completion on public.study_tasks;
create trigger stamp_completion before insert or update of completed on public.study_tasks
  for each row execute function public.study_tasks_stamp_completion();

-- One call orders a day's tasks: sort_order = position in p_ids. RLS keeps it to the caller's own rows.
create or replace function public.reorder_study_tasks(p_ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.study_tasks t set sort_order = x.ord::integer
  from unnest(p_ids) with ordinality as x(id, ord)
  where t.id = x.id and t.user_id = (select auth.uid());
$$;
revoke all on function public.reorder_study_tasks(uuid[]) from public, anon;
grant execute on function public.reorder_study_tasks(uuid[]) to authenticated;

-- Ticks open tasks whose lesson_slug is one of p_slugs or starts with one of p_prefixes.
-- Only tasks due today or earlier (in the learner's own day), unless p_any_date: work done early
-- on a specific item still counts for that item's later task.
create or replace function public.planner_complete(p_user uuid, p_slugs text[], p_prefixes text[] default '{}', p_any_date boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  update public.study_tasks t set completed = true
  where t.user_id = p_user and not t.completed and t.lesson_slug is not null
    and (t.lesson_slug = any(p_slugs) or exists (select 1 from unnest(p_prefixes) p where t.lesson_slug like p || '%'))
    and (p_any_date or t.due_date <= public.learner_local_day(p_user, now()));
end;
$$;
-- Supabase grants EXECUTE to anon/authenticated by default; only the triggers below may call this.
revoke all on function public.planner_complete(uuid, text[], text[], boolean) from public, anon, authenticated;

-- Maps each kind of finished work to the planner tasks it satisfies.
create or replace function public.planner_autocomplete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref text;
  v_skill text;
begin
  if tg_table_name = 'news_reading_attempts' then
    select a.slug into v_ref from public.news_learning_articles a where a.id = new.article_id;
    perform public.planner_complete(new.user_id, array['news']);
    if v_ref is not null then perform public.planner_complete(new.user_id, array['news:' || v_ref], '{}', true); end if;
  elsif tg_table_name = 'news_auto_attempts' then
    perform public.planner_complete(new.user_id, array['news']);
  elsif tg_table_name in ('voa_dictation_attempts', 'dictation_clip_attempts') then
    perform public.planner_complete(new.user_id, array['dictation']);
  elsif tg_table_name = 'package_practice_results' then
    if new.lesson_slug like 'skill-lab-dictation:v2:%' or new.lesson_slug like 'skill-lab:%' then
      v_ref := regexp_replace(new.lesson_slug, '^(skill-lab-dictation:v2:|skill-lab:)', '');
      perform public.planner_complete(new.user_id, array['dictation']);
      if new.total > 0 and new.checked >= new.total then
        perform public.planner_complete(new.user_id, array['dictation:' || v_ref], '{}', true);
      end if;
    end if;
  elsif tg_table_name = 'user_word_reviews' then
    if tg_op = 'INSERT' then perform public.planner_complete(new.user_id, array['vocabulary-study']); end if;
    if not exists (select 1 from public.user_word_reviews r where r.user_id = new.user_id and r.due_at <= now()) then
      perform public.planner_complete(new.user_id, array['vocabulary-review']);
    end if;
  elsif tg_table_name = 'grammar_study_progress' then
    perform public.planner_complete(new.user_id, array['grammar', 'grammar-review', 'grammar:' || new.lesson_code]);
  elsif tg_table_name = 'ielts_attempts' then
    if new.state <> 'in_progress' and (tg_op = 'INSERT' or old.state = 'in_progress') then
      select lower(e.skill) into v_skill from public.ielts_exams e where e.id = new.exam_id;
      perform public.planner_complete(new.user_id, array['ielts:' || new.exam_id::text], '{}', true);
      if v_skill is not null then perform public.planner_complete(new.user_id, array[v_skill], array[v_skill || ':']); end if;
    end if;
  end if;
  return new;
exception when others then
  -- Ticking the planner is a convenience: it must never stop the learner's own work from being saved.
  raise warning 'planner_autocomplete skipped on %: %', tg_table_name, sqlerrm;
  return new;
end;
$$;
revoke all on function public.planner_autocomplete() from public, anon, authenticated;

drop trigger if exists planner_autocomplete on public.news_reading_attempts;
create trigger planner_autocomplete after insert on public.news_reading_attempts
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.news_auto_attempts;
create trigger planner_autocomplete after insert on public.news_auto_attempts
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.voa_dictation_attempts;
create trigger planner_autocomplete after insert on public.voa_dictation_attempts
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.dictation_clip_attempts;
create trigger planner_autocomplete after insert on public.dictation_clip_attempts
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.package_practice_results;
create trigger planner_autocomplete after insert or update of checked on public.package_practice_results
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.user_word_reviews;
create trigger planner_autocomplete after insert or update of due_at on public.user_word_reviews
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.grammar_study_progress;
create trigger planner_autocomplete after insert or update of responses on public.grammar_study_progress
  for each row execute function public.planner_autocomplete();
drop trigger if exists planner_autocomplete on public.ielts_attempts;
create trigger planner_autocomplete after insert or update of state on public.ielts_attempts
  for each row execute function public.planner_autocomplete();
