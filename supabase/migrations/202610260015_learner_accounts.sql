-- Learner accounts: richer profiles, a streak built from real learning activity,
-- admin controls (suspend, mute chat, assign tasks, goals, notifications) and an audit trail.

-- 1. Profile fields the learner edits on the profile page.
alter table public.profiles
  add column bio text not null default '' check (char_length(bio) <= 280),
  add column target_band numeric(2,1) check (target_band is null or (target_band between 1 and 9 and target_band * 2 = floor(target_band * 2))),
  add column exam_date date,
  add column stage_id text references public.learning_stages(id) on delete set null,
  add column avatar text not null default 'harry' check (avatar in ('harry','star','rocket','book','globe','headphones','mic','coffee','bulb','mountain'));

create policy profiles_admin_select on public.profiles for select to authenticated using (public.is_admin());

-- 2. Controls only admins change. Permanent actions use 'infinity'.
create table public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_until timestamptz,
  suspended_reason text not null default '' check (char_length(suspended_reason) <= 300),
  chat_muted_until timestamptz,
  chat_muted_reason text not null default '' check (char_length(chat_muted_reason) <= 300),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.account_controls enable row level security;
create policy account_controls_read on public.account_controls for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.account_controls from anon, authenticated;
grant select on public.account_controls to authenticated;

create function public.account_suspended(p_user uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.account_controls where user_id = p_user and suspended_until > now());
$$;
revoke all on function public.account_suspended(uuid) from public;

-- Muted or suspended learners cannot post in the study room.
create function public.study_room_enforce_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if public.account_suspended(auth.uid()) then raise exception 'Tài khoản đang bị tạm khóa'; end if;
  select chat_muted_until into v_until from public.account_controls where user_id = auth.uid() and chat_muted_until > now();
  if v_until is not null then
    raise exception 'Bạn đang bị tạm cấm chat%', case when v_until = 'infinity' then '' else ' đến ' || to_char(v_until at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') end;
  end if;
  return new;
end;
$$;
create trigger study_room_enforce before insert on public.study_room_messages
for each row execute function public.study_room_enforce_controls();

-- 3. One row per learner per local day with any learning activity. The streak is read from here.
create table public.learner_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kinds text[] not null default '{}',
  events integer not null default 0 check (events >= 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.learner_activity_days enable row level security;
create policy learner_activity_days_read on public.learner_activity_days for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.learner_activity_days from anon, authenticated;
grant select on public.learner_activity_days to authenticated;

create function public.learner_local_day(p_user uuid, p_at timestamptz) returns date language sql stable security definer
set search_path = '' as $$
  select (p_at at time zone coalesce(
    (select p.timezone from public.profiles p where p.id = p_user and exists(select 1 from pg_catalog.pg_timezone_names t where t.name = p.timezone)),
    'Asia/Ho_Chi_Minh'))::date;
$$;
revoke all on function public.learner_local_day(uuid, timestamptz) from public;

create function public.record_learning_activity(p_user uuid, p_kind text, p_at timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare v_day date;
begin
  if p_user is null then return; end if;
  v_day := public.learner_local_day(p_user, p_at);
  insert into public.learner_activity_days as d (user_id, day, kinds, events, first_at, last_at)
  values (p_user, v_day, array[p_kind], 1, p_at, p_at)
  on conflict (user_id, day) do update set
    kinds = case when p_kind = any(d.kinds) then d.kinds else d.kinds || p_kind end,
    events = d.events + 1,
    first_at = least(d.first_at, excluded.first_at),
    last_at = greatest(d.last_at, excluded.last_at);
end;
$$;
revoke all on function public.record_learning_activity(uuid, text, timestamptz) from public;

create function public.track_learning_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'study_tasks' then
    if not new.completed or (tg_op = 'UPDATE' and old.completed) then return new; end if;
  end if;
  perform public.record_learning_activity(new.user_id, tg_argv[0], now());
  return new;
end;
$$;
create trigger track_activity after insert on public.exercise_attempts for each row execute function public.track_learning_activity('lesson');
create trigger track_activity after insert on public.news_auto_attempts for each row execute function public.track_learning_activity('news_quiz');
create trigger track_activity after insert on public.news_reading_attempts for each row execute function public.track_learning_activity('news_quiz');
create trigger track_activity after insert on public.user_news_article_reads for each row execute function public.track_learning_activity('news_read');
create trigger track_activity after insert on public.notebook_entries for each row execute function public.track_learning_activity('notebook');
create trigger track_activity after insert or update of completed on public.study_tasks for each row execute function public.track_learning_activity('task');

-- Time in the study room counts once the client reports a real session (about five minutes).
create function public.record_study_room_activity() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if public.account_suspended(auth.uid()) then return; end if;
  if exists(select 1 from public.learner_activity_days where user_id = auth.uid()
    and day = public.learner_local_day(auth.uid(), now()) and 'study_room' = any(kinds)) then return; end if;
  perform public.record_learning_activity(auth.uid(), 'study_room', now());
end;
$$;
revoke all on function public.record_study_room_activity() from public;
grant execute on function public.record_study_room_activity() to authenticated;

-- Existing history becomes the starting streak.
do $$
declare r record;
begin
  for r in
    select user_id, submitted_at as at, 'lesson' as kind from public.exercise_attempts
    union all select user_id, submitted_at, 'news_quiz' from public.news_auto_attempts
    union all select user_id, submitted_at, 'news_quiz' from public.news_reading_attempts
    union all select user_id, read_at, 'news_read' from public.user_news_article_reads
    union all select user_id, created_at, 'notebook' from public.notebook_entries
  loop
    perform public.record_learning_activity(r.user_id, r.kind, r.at);
  end loop;
end;
$$;

create function public.learner_streak(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_today date; v_cursor date; v_prev date; v_day date;
  v_current integer := 0; v_longest integer := 0; v_run integer := 0;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if v_user is distinct from auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  v_today := public.learner_local_day(v_user, now());
  for v_day in select day from public.learner_activity_days where user_id = v_user order by day loop
    v_run := case when v_prev is not null and v_day = v_prev + 1 then v_run + 1 else 1 end;
    v_longest := greatest(v_longest, v_run);
    v_prev := v_day;
  end loop;
  -- A streak survives until the end of today, so an inactive today still counts yesterday's run.
  v_cursor := case when exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_today) then v_today else v_today - 1 end;
  while exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_cursor) loop
    v_current := v_current + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return jsonb_build_object(
    'current', v_current, 'longest', v_longest, 'today', v_today,
    'activeToday', exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_today),
    'totalDays', (select count(*) from public.learner_activity_days where user_id = v_user),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'events', events, 'kinds', kinds) order by day)
      from public.learner_activity_days where user_id = v_user and day > v_today - 126), '[]'::jsonb));
end;
$$;
revoke all on function public.learner_streak(uuid) from public;
grant execute on function public.learner_streak(uuid) to authenticated;

-- 4. Tasks an admin assigns land in the learner's planner.
alter table public.study_tasks add column assigned_by uuid references auth.users(id) on delete set null;

-- 5. Notifications for one learner, or for everyone when user_id is null.
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null default 'announcement' check (kind in ('announcement','task','account')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&#.-]*$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index user_notifications_user_recent on public.user_notifications(user_id, created_at desc);
create table public.user_notification_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.user_notifications enable row level security;
alter table public.user_notification_reads enable row level security;
create policy user_notifications_read on public.user_notifications for select to authenticated
  using (user_id = (select auth.uid()) or user_id is null or public.is_admin());
create policy user_notifications_admin_delete on public.user_notifications for delete to authenticated using (public.is_admin());
create policy user_notification_reads_self on public.user_notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_notifications, public.user_notification_reads from anon, authenticated;
grant select, delete on public.user_notifications to authenticated;
grant select, insert, delete on public.user_notification_reads to authenticated;

-- 6. Every admin action on an account is recorded.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  target_user uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_recent on public.admin_audit_log(created_at desc);
create index admin_audit_log_target on public.admin_audit_log(target_user, created_at desc);
alter table public.admin_audit_log enable row level security;
create policy admin_audit_log_read on public.admin_audit_log for select to authenticated using (public.is_admin());
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create function public.admin_require() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  return auth.uid();
end;
$$;
revoke all on function public.admin_require() from public;

create function public.admin_log(p_target uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit_log(admin_id, target_user, action, details) values (auth.uid(), p_target, p_action, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.admin_log(uuid, text, jsonb) from public;

-- 7. One learner's profile, streak, stats and recent activity, for the learner or an admin.
create function public.learner_overview(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if v_user is distinct from auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'updated_at' from public.profiles p where p.id = v_user),
    'controls', (select jsonb_build_object('suspendedUntil', c.suspended_until, 'suspendedReason', c.suspended_reason,
      'chatMutedUntil', c.chat_muted_until, 'chatMutedReason', c.chat_muted_reason) from public.account_controls c where c.user_id = v_user),
    'streak', public.learner_streak(v_user),
    'stats', jsonb_build_object(
      'lessons', (select count(*) from public.exercise_attempts where user_id = v_user),
      'lessonScore', (select round(100.0 * sum(score) / nullif(sum(total), 0)) from public.exercise_attempts where user_id = v_user),
      'newsQuizzes', (select count(*) from public.news_auto_attempts where user_id = v_user) + (select count(*) from public.news_reading_attempts where user_id = v_user),
      'newsScore', (select round(100.0 * sum(score) / nullif(sum(total), 0)) from (
        select score, total from public.news_auto_attempts where user_id = v_user
        union all select score, total from public.news_reading_attempts where user_id = v_user) s),
      'newsRead', (select count(*) from public.user_news_article_reads where user_id = v_user),
      'words', (select count(*) from public.notebook_entries where user_id = v_user and kind = 'word'),
      'tasksDone', (select count(*) from public.study_tasks where user_id = v_user and completed),
      'tasksOpen', (select count(*) from public.study_tasks where user_id = v_user and not completed),
      'messages', (select count(*) from public.study_room_messages where user_id = v_user)),
    'openTasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'skill', t.skill, 'due', t.due_date, 'assigned', t.assigned_by is not null) order by t.due_date)
      from (select * from public.study_tasks where user_id = v_user and not completed order by due_date limit 12) t), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(x.e order by x.at desc) from (
      select a.submitted_at as at, jsonb_build_object('kind', 'lesson', 'at', a.submitted_at, 'title', coalesce(l.title, a.lesson_slug), 'score', a.score, 'total', a.total, 'link', '/app/lesson/' || a.lesson_slug) as e
        from public.exercise_attempts a left join public.lessons l on l.slug = a.lesson_slug where a.user_id = v_user
      union all select a.submitted_at, jsonb_build_object('kind', 'news_quiz', 'at', a.submitted_at, 'title', n.title, 'score', a.score, 'total', a.total, 'link', '/app/news/' || n.id)
        from public.news_auto_attempts a join public.news_articles n on n.id = a.article_id where a.user_id = v_user
      union all select a.submitted_at, jsonb_build_object('kind', 'news_quiz', 'at', a.submitted_at, 'title', n.title, 'score', a.score, 'total', a.total, 'link', '/app/news/learn/' || n.slug)
        from public.news_reading_attempts a join public.news_learning_articles n on n.id = a.article_id where a.user_id = v_user
      union all select r.read_at, jsonb_build_object('kind', 'news_read', 'at', r.read_at, 'title', n.title, 'link', '/app/news/' || n.id)
        from public.user_news_article_reads r join public.news_articles n on n.id = r.article_id where r.user_id = v_user
      union all select w.created_at, jsonb_build_object('kind', 'word', 'at', w.created_at, 'title', w.title)
        from public.notebook_entries w where w.user_id = v_user and w.kind = 'word'
      order by 1 desc limit 40) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.learner_overview(uuid) from public;
grant execute on function public.learner_overview(uuid) to authenticated;

-- 8. Admin: list, inspect and control learner accounts.
create function public.admin_list_learners(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, email text, display_name text, avatar text, created_at timestamptz, last_sign_in_at timestamptz,
  last_active date, active_days_30 integer, streak integer, attempts integer, is_admin boolean,
  suspended_until timestamptz, chat_muted_until timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_search text := '%' || replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.admin_require();
  return query
  select u.id, u.email::text, p.display_name, p.avatar, u.created_at, u.last_sign_in_at,
    (select max(d.day) from public.learner_activity_days d where d.user_id = u.id),
    (select count(*)::integer from public.learner_activity_days d where d.user_id = u.id and d.day > current_date - 30),
    (public.learner_streak(u.id)->>'current')::integer,
    ((select count(*) from public.exercise_attempts e where e.user_id = u.id)
      + (select count(*) from public.news_auto_attempts n where n.user_id = u.id)
      + (select count(*) from public.news_reading_attempts r where r.user_id = u.id))::integer,
    exists(select 1 from public.admin_users a where a.user_id = u.id),
    c.suspended_until, c.chat_muted_until,
    count(*) over ()
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.account_controls c on c.user_id = u.id
  where u.email ilike v_search or p.display_name ilike v_search
  order by u.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.admin_list_learners(text, integer, integer) from public;
grant execute on function public.admin_list_learners(text, integer, integer) to authenticated;

create function public.admin_learner_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  if not exists(select 1 from auth.users where id = p_user) then raise exception 'Learner not found'; end if;
  return public.learner_overview(p_user) || jsonb_build_object(
    'account', (select jsonb_build_object('email', u.email, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
      'isAdmin', exists(select 1 from public.admin_users a where a.user_id = u.id)) from auth.users u where u.id = p_user),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'details', l.details, 'at', l.created_at,
      'admin', coalesce(p.display_name, 'Admin')) order by l.created_at desc)
      from (select * from public.admin_audit_log where target_user = p_user order by created_at desc limit 30) l
      left join public.profiles p on p.id = l.admin_id), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_learner_detail(uuid) from public;
grant execute on function public.admin_learner_detail(uuid) to authenticated;

create function public.admin_set_account_controls(p_user uuid, p_suspended_until timestamptz, p_suspended_reason text,
  p_chat_muted_until timestamptz, p_chat_muted_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.admin_require(); v_old public.account_controls;
begin
  if p_user = v_admin and p_suspended_until is not null then raise exception 'You cannot suspend your own account'; end if;
  if not exists(select 1 from auth.users where id = p_user) then raise exception 'Learner not found'; end if;
  if p_suspended_until is not null and exists(select 1 from public.admin_users where user_id = p_user) then
    raise exception 'Remove admin access before suspending this account';
  end if;
  select * into v_old from public.account_controls where user_id = p_user;
  insert into public.account_controls(user_id, suspended_until, suspended_reason, chat_muted_until, chat_muted_reason, updated_by, updated_at)
  values (p_user, p_suspended_until, left(coalesce(p_suspended_reason, ''), 300), p_chat_muted_until, left(coalesce(p_chat_muted_reason, ''), 300), v_admin, now())
  on conflict (user_id) do update set suspended_until = excluded.suspended_until, suspended_reason = excluded.suspended_reason,
    chat_muted_until = excluded.chat_muted_until, chat_muted_reason = excluded.chat_muted_reason, updated_by = v_admin, updated_at = now();
  if v_old.suspended_until is distinct from p_suspended_until then
    perform public.admin_log(p_user, case when p_suspended_until is null then 'unsuspend' else 'suspend' end,
      jsonb_build_object('until', p_suspended_until, 'reason', p_suspended_reason));
  end if;
  if v_old.chat_muted_until is distinct from p_chat_muted_until then
    perform public.admin_log(p_user, case when p_chat_muted_until is null then 'unmute_chat' else 'mute_chat' end,
      jsonb_build_object('until', p_chat_muted_until, 'reason', p_chat_muted_reason));
    insert into public.user_notifications(user_id, kind, title, body, created_by) values (p_user, 'account',
      case when p_chat_muted_until is null then 'Bạn đã có thể chat lại trong phòng cùng học' else 'Bạn đang bị tạm cấm chat trong phòng cùng học' end,
      coalesce(nullif(btrim(p_chat_muted_reason), ''), ''), v_admin);
  end if;
end;
$$;
revoke all on function public.admin_set_account_controls(uuid, timestamptz, text, timestamptz, text) from public;
grant execute on function public.admin_set_account_controls(uuid, timestamptz, text, timestamptz, text) to authenticated;

create function public.admin_set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.admin_require();
begin
  if p_user = v_admin and not p_admin then raise exception 'You cannot remove your own admin access'; end if;
  if p_admin and public.account_suspended(p_user) then raise exception 'Unsuspend this account before granting admin access'; end if;
  if p_admin then insert into public.admin_users(user_id) values (p_user) on conflict do nothing;
  else delete from public.admin_users where user_id = p_user; end if;
  perform public.admin_log(p_user, case when p_admin then 'grant_admin' else 'revoke_admin' end, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_set_admin(uuid, boolean) from public;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

-- An empty or null user list means every learner (admins excluded).
create function public.admin_target_users(p_users uuid[]) returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where (coalesce(cardinality(p_users), 0) = 0 and not exists(select 1 from public.admin_users a where a.user_id = u.id))
     or u.id = any(p_users);
$$;
revoke all on function public.admin_target_users(uuid[]) from public;

create function public.admin_send_notification(p_users uuid[], p_title text, p_body text, p_link text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.admin_require(); v_count integer;
begin
  if coalesce(cardinality(p_users), 0) = 0 then
    insert into public.user_notifications(user_id, title, body, link, created_by) values (null, btrim(p_title), coalesce(p_body, ''), nullif(btrim(p_link), ''), v_admin);
    v_count := (select count(*) from public.admin_target_users(null));
    perform public.admin_log(null, 'broadcast', jsonb_build_object('title', p_title));
  else
    insert into public.user_notifications(user_id, title, body, link, created_by)
    select t, btrim(p_title), coalesce(p_body, ''), nullif(btrim(p_link), ''), v_admin from public.admin_target_users(p_users) t;
    get diagnostics v_count = row_count;
    insert into public.admin_audit_log(admin_id, target_user, action, details)
    select v_admin, t, 'notify', jsonb_build_object('title', p_title) from public.admin_target_users(p_users) t;
  end if;
  return v_count;
end;
$$;
revoke all on function public.admin_send_notification(uuid[], text, text, text) from public;
grant execute on function public.admin_send_notification(uuid[], text, text, text) to authenticated;

create function public.admin_assign_task(p_users uuid[], p_title text, p_skill text, p_due date, p_priority text, p_lesson_slug text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.admin_require(); v_count integer;
begin
  insert into public.study_tasks(user_id, title, skill, due_date, priority, lesson_slug, assigned_by)
  select t, btrim(p_title), p_skill, p_due, coalesce(p_priority, 'Medium'), nullif(btrim(p_lesson_slug), ''), v_admin from public.admin_target_users(p_users) t;
  get diagnostics v_count = row_count;
  insert into public.user_notifications(user_id, kind, title, body, link, created_by)
  select t, 'task', 'Nhiệm vụ mới: ' || left(btrim(p_title), 100), 'Hạn: ' || to_char(p_due, 'DD/MM/YYYY'), '/app/planner', v_admin from public.admin_target_users(p_users) t;
  insert into public.admin_audit_log(admin_id, target_user, action, details)
  select v_admin, t, 'assign_task', jsonb_build_object('title', p_title, 'skill', p_skill, 'due', p_due) from public.admin_target_users(p_users) t;
  return v_count;
end;
$$;
revoke all on function public.admin_assign_task(uuid[], text, text, date, text, text) from public;
grant execute on function public.admin_assign_task(uuid[], text, text, date, text, text) to authenticated;

create function public.admin_set_daily_goal(p_users uuid[], p_goal integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.admin_require(); v_count integer;
begin
  update public.profiles set daily_goal = p_goal, updated_at = now() where id in (select public.admin_target_users(p_users));
  get diagnostics v_count = row_count;
  insert into public.user_notifications(user_id, kind, title, body, link, created_by)
  select t, 'task', 'Mục tiêu mỗi ngày mới: ' || p_goal || ' nhiệm vụ', '', '/app/planner', v_admin from public.admin_target_users(p_users) t;
  insert into public.admin_audit_log(admin_id, target_user, action, details)
  select v_admin, t, 'set_goal', jsonb_build_object('goal', p_goal) from public.admin_target_users(p_users) t;
  return v_count;
end;
$$;
revoke all on function public.admin_set_daily_goal(uuid[], integer) from public;
grant execute on function public.admin_set_daily_goal(uuid[], integer) to authenticated;

-- 9. The learner's last Daily News quiz comes back with its review, so a finished quiz stays finished.
create function public.news_auto_quiz_last_result(p_article_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_attempt public.news_auto_attempts; v_question record; v_choice text; v_right boolean;
  v_review jsonb := '[]'::jsonb; v_total integer; v_attempts integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_attempt from public.news_auto_attempts where user_id = auth.uid() and article_id = p_article_id order by submitted_at desc limit 1;
  if v_attempt.id is null then return null; end if;
  select count(*) into v_total from public.news_auto_questions where article_id = p_article_id;
  -- A regenerated quiz no longer matches the saved answers.
  if v_total = 0 or (select count(*) from public.news_auto_questions q where q.article_id = p_article_id and v_attempt.answers ? q.id::text) <> v_total then return null; end if;
  select count(*) into v_attempts from public.news_auto_attempts where user_id = auth.uid() and article_id = p_article_id;
  for v_question in select q.id, q.question_type, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation, k.option_notes
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id order by q.sort_order loop
    v_choice := v_attempt.answers->>v_question.id::text;
    if v_question.correct_index is not null then
      v_right := v_choice ~ '^[0-3]$' and v_choice::integer = v_question.correct_index;
    else
      v_right := exists (select 1 from jsonb_array_elements_text(v_question.accepted_answers) a(value)
        where public.news_normalize_answer(a.value) = public.news_normalize_answer(coalesce(v_choice, '')));
    end if;
    v_review := v_review || jsonb_build_array(jsonb_build_object('id', v_question.id, 'type', v_question.question_type,
      'correct', coalesce(v_right, false), 'correctIndex', v_question.correct_index, 'acceptedAnswers', v_question.accepted_answers,
      'explanation', v_question.explanation, 'optionNotes', v_question.option_notes, 'supportingSentence', v_question.supporting_sentence));
  end loop;
  return jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'review', v_review, 'answers', v_attempt.answers,
    'submittedAt', v_attempt.submitted_at, 'attempts', v_attempts);
end;
$$;
revoke all on function public.news_auto_quiz_last_result(uuid) from public;
grant execute on function public.news_auto_quiz_last_result(uuid) to authenticated;

-- A suspended account must not keep writing through a direct Data API call or
-- a SECURITY DEFINER RPC while its existing JWT is still valid. Keep reads of
-- account_controls available so the portal can show the suspension reason.
create function public.reject_suspended_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.account_suspended(auth.uid()) then
    raise exception 'Tài khoản đang bị tạm khóa';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.reject_suspended_actor() from public;
do $$
declare v_table text;
begin
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('admin_users', 'account_controls', 'learner_activity_days', 'user_notifications')
  loop
    execute format('create trigger reject_suspended_actor before insert or update or delete on public.%I for each row execute function public.reject_suspended_actor()', v_table);
  end loop;
end;
$$;
create trigger reject_suspended_actor before update on public.profiles
for each row execute function public.reject_suspended_actor();
