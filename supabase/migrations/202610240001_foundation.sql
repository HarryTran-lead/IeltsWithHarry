-- Apply with Supabase CLI or the SQL editor. All learner records are scoped by RLS.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner' check (char_length(display_name) <= 80),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  daily_goal integer not null default 5 check (daily_goal between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create function public.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create function public.create_profile() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''), 'Learner'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile();

create table public.learning_stages (
  id text primary key,
  title text not null,
  band_label text not null,
  sort_order integer not null unique,
  description text not null default ''
);
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  stage_id text not null references public.learning_stages(id),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  slug text not null,
  title text not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  unique(course_id, slug)
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  skill text not null check (skill in ('Reading','Listening','Writing','Speaking','Vocabulary','Grammar')),
  summary text not null default '',
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  sort_order integer not null default 0,
  kind text not null check (kind in ('paragraph','heading','tip','prompt','audio')),
  body text not null,
  unique(lesson_id, sort_order)
);
create table public.exercise_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slug text not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  sort_order integer not null default 0,
  unique(lesson_id, slug)
);
create table public.exercise_answer_keys (
  question_id uuid primary key references public.exercise_questions(id) on delete cascade,
  correct_index integer not null check (correct_index between 0 and 5),
  explanation text not null default ''
);
create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  word text not null,
  phonetic text not null default '',
  meaning_vi text not null,
  definition text not null default '',
  example text not null default '',
  sort_order integer not null default 0,
  unique(lesson_id, word)
);

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  skill text not null check (skill in ('Reading','Listening','Writing','Speaking','Vocabulary','Grammar','Review','Personal')),
  due_date date not null,
  due_time time,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  completed boolean not null default false,
  sort_order integer not null default 0,
  lesson_slug text,
  created_at timestamptz not null default now()
);
create index study_tasks_user_due_idx on public.study_tasks(user_id, due_date, sort_order);
create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_slug text not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);
create index exercise_attempts_user_date_idx on public.exercise_attempts(user_id, submitted_at desc);
create table public.writing_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_slug text not null,
  body text not null check (char_length(body) <= 20000),
  updated_at timestamptz not null default now(),
  primary key(user_id, lesson_slug)
);

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.learning_stages enable row level security;
alter table public.courses enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_blocks enable row level security;
alter table public.exercise_questions enable row level security;
alter table public.exercise_answer_keys enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.study_tasks enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.writing_drafts enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy tasks_self on public.study_tasks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy attempts_self_read on public.exercise_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy drafts_self on public.writing_drafts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy stages_public_read on public.learning_stages for select to anon, authenticated using (true);
create policy stages_admin_write on public.learning_stages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_public_read on public.courses for select to anon, authenticated using (published or public.is_admin());
create policy courses_admin_write on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy units_public_read on public.units for select to anon, authenticated using (public.is_admin() or (published and exists(select 1 from public.courses c where c.id = course_id and c.published)));
create policy units_admin_write on public.units for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lessons_public_read on public.lessons for select to anon, authenticated using (public.is_admin() or (published and exists(select 1 from public.units u join public.courses c on c.id = u.course_id where u.id = unit_id and u.published and c.published)));
create policy lessons_admin_write on public.lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy blocks_public_read on public.lesson_blocks for select to anon, authenticated using (exists(select 1 from public.lessons l where l.id = lesson_id));
create policy blocks_admin_write on public.lesson_blocks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy questions_public_read on public.exercise_questions for select to anon, authenticated using (exists(select 1 from public.lessons l where l.id = lesson_id));
create policy questions_admin_write on public.exercise_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy answer_keys_admin on public.exercise_answer_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vocabulary_public_read on public.vocabulary_entries for select to anon, authenticated using (exists(select 1 from public.lessons l where l.id = lesson_id));
create policy vocabulary_admin_write on public.vocabulary_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.learning_stages, public.courses, public.units, public.lessons, public.lesson_blocks, public.exercise_questions, public.vocabulary_entries to anon, authenticated;
grant insert, update, delete on public.learning_stages, public.courses, public.units, public.lessons, public.lesson_blocks, public.exercise_questions, public.vocabulary_entries to authenticated;
grant select on public.profiles, public.study_tasks, public.exercise_attempts, public.writing_drafts to authenticated;
grant update(display_name, timezone, daily_goal) on public.profiles to authenticated;
grant insert(title, skill, due_date, due_time, priority, completed, sort_order, lesson_slug) on public.study_tasks to authenticated;
grant update(title, skill, due_date, due_time, priority, completed, sort_order, lesson_slug) on public.study_tasks to authenticated;
grant delete on public.study_tasks to authenticated;
grant insert(user_id, lesson_slug, body) on public.writing_drafts to authenticated;
grant update(user_id, lesson_slug, body, updated_at) on public.writing_drafts to authenticated;
grant delete on public.writing_drafts to authenticated;
grant select, insert, update, delete on public.exercise_answer_keys to authenticated;

create function public.submit_exercise(p_lesson_slug text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_lesson public.lessons%rowtype;
  v_total integer;
  v_score integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 8192 then
    raise exception 'Invalid answers';
  end if;
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
  select jsonb_agg(jsonb_build_object('slug', q.slug, 'correctIndex', k.correct_index, 'explanation', k.explanation) order by q.sort_order)
  into v_result from public.exercise_questions q join public.exercise_answer_keys k on k.question_id = q.id
  where q.lesson_id = v_lesson.id;
  return jsonb_build_object('score', v_score, 'total', v_total, 'review', v_result);
end;
$$;
revoke all on function public.submit_exercise(text, jsonb) from public;
grant execute on function public.submit_exercise(text, jsonb) to authenticated;

create function public.admin_save_question(
  p_question_id uuid, p_lesson_id uuid, p_slug text, p_prompt text,
  p_options jsonb, p_correct_index integer, p_explanation text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_slug !~ '^[a-z0-9-]+$' or char_length(p_prompt) < 3 or
     jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 6 or
     p_correct_index not between 0 and jsonb_array_length(p_options) - 1 then
    raise exception 'Invalid question';
  end if;
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
  insert into public.exercise_answer_keys(question_id,correct_index,explanation)
  values(v_id,p_correct_index,p_explanation)
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;
  return v_id;
end;
$$;
revoke all on function public.admin_save_question(uuid, uuid, text, text, jsonb, integer, text) from public;
grant execute on function public.admin_save_question(uuid, uuid, text, text, jsonb, integer, text) to authenticated;
