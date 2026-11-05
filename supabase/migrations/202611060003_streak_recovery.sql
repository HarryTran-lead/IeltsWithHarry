-- Recover at most three missed local days by reading distinct articles and
-- answering every question of each article's full quiz correctly.
create table public.streak_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  local_day date not null,
  first_missed_day date not null,
  required integer not null check (required between 1 and 3),
  completed integer not null default 0 check (completed between 0 and 3),
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  finished_at timestamptz
);
create unique index streak_recovery_one_active on public.streak_recovery_challenges(user_id) where status = 'active';
create table public.streak_recovery_articles (
  challenge_id uuid not null references public.streak_recovery_challenges(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  attempt_id uuid not null unique references public.news_auto_attempts(id) on delete cascade,
  primary key (challenge_id, article_id)
);
create index streak_recovery_user_history on public.streak_recovery_challenges(user_id, started_at desc);
alter table public.streak_recovery_challenges enable row level security;
alter table public.streak_recovery_articles enable row level security;
create policy streak_recovery_challenges_read on public.streak_recovery_challenges for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy streak_recovery_articles_read on public.streak_recovery_articles for select to authenticated
  using (exists (select 1 from public.streak_recovery_challenges c where c.id = challenge_id and (c.user_id = (select auth.uid()) or public.is_admin())));
revoke all on public.streak_recovery_challenges, public.streak_recovery_articles from anon, authenticated;
grant select on public.streak_recovery_challenges, public.streak_recovery_articles to authenticated;

-- Synthetic bridge days have zero real learning events. They preserve the
-- streak without claiming that the learner studied on those calendar days.
create or replace function public.learner_streak(p_user uuid default null) returns jsonb
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
  v_cursor := case when exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_today) then v_today else v_today - 1 end;
  while exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_cursor) loop
    v_current := v_current + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return jsonb_build_object(
    'current', v_current, 'longest', v_longest, 'today', v_today,
    'activeToday', exists(select 1 from public.learner_activity_days where user_id = v_user and day = v_today and events > 0),
    'totalDays', (select count(*) from public.learner_activity_days where user_id = v_user and events > 0),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'events', events, 'kinds', kinds) order by day)
      from public.learner_activity_days where user_id = v_user and day > v_today - 126), '[]'::jsonb));
end;
$$;

-- Admin activity counts and last active date must ignore recovered bridge days.
create or replace function public.admin_list_learners(p_search text default '', p_limit integer default 50, p_offset integer default 0)
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
    (select max(d.day) from public.learner_activity_days d where d.user_id = u.id and d.events > 0),
    (select count(*)::integer from public.learner_activity_days d where d.user_id = u.id and d.events > 0
      and d.day > public.learner_local_day(u.id, now()) - 30),
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

create function public.streak_recovery_gap(p_user uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.learner_local_day(p_user, now()); v_last date;
begin
  select max(day) into v_last from public.learner_activity_days
    where user_id = p_user and day < v_today;
  if v_last is null then return 0; end if;
  return greatest(0, v_today - v_last - 1);
end;
$$;
revoke all on function public.streak_recovery_gap(uuid) from public, anon, authenticated;

create function public.streak_recovery_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_today date; v_gap integer; v_challenge public.streak_recovery_challenges;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  v_today := public.learner_local_day(v_user, now());
  v_gap := public.streak_recovery_gap(v_user);
  select * into v_challenge from public.streak_recovery_challenges
    where user_id = v_user and status = 'active' and local_day = v_today;
  return jsonb_build_object('missed', v_gap, 'eligible', v_gap between 1 and 3,
    'active', v_challenge.id is not null, 'required', coalesce(v_challenge.required, v_gap),
    'completed', coalesce(v_challenge.completed, 0),
    'restoredToday', exists(select 1 from public.streak_recovery_challenges c
      where c.user_id = v_user and c.status = 'completed' and c.local_day = v_today));
end;
$$;
revoke all on function public.streak_recovery_status() from public;
grant execute on function public.streak_recovery_status() to authenticated;

create function public.streak_recovery_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_today date; v_gap integer; v_challenge public.streak_recovery_challenges;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if public.account_suspended(v_user) then raise exception 'Tài khoản đang bị tạm khóa'; end if;
  v_today := public.learner_local_day(v_user, now());
  update public.streak_recovery_challenges set status = 'expired'
    where user_id = v_user and status = 'active' and local_day <> v_today;
  select * into v_challenge from public.streak_recovery_challenges
    where user_id = v_user and status = 'active' for update;
  if v_challenge.id is not null then return public.streak_recovery_status(); end if;
  v_gap := public.streak_recovery_gap(v_user);
  if v_gap not between 1 and 3 then raise exception 'Chỉ có thể khôi phục khi bỏ lỡ từ 1 đến 3 ngày'; end if;
  insert into public.streak_recovery_challenges(user_id, local_day, first_missed_day, required)
    values (v_user, v_today, v_today - v_gap, v_gap);
  return public.streak_recovery_status();
end;
$$;
revoke all on function public.streak_recovery_start() from public;
grant execute on function public.streak_recovery_start() to authenticated;

create function public.streak_recovery_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_challenge public.streak_recovery_challenges; v_read_at timestamptz; v_day date;
begin
  if new.partial or new.total < 1 or new.score <> new.total then return new; end if;
  select * into v_challenge from public.streak_recovery_challenges
    where user_id = new.user_id and status = 'active' for update;
  if v_challenge.id is null then return new; end if;
  if v_challenge.local_day <> public.learner_local_day(new.user_id, now()) then
    update public.streak_recovery_challenges set status = 'expired' where id = v_challenge.id;
    return new;
  end if;
  select read_at into v_read_at from public.user_news_article_reads
    where user_id = new.user_id and article_id = new.article_id;
  if v_read_at is null or v_read_at < v_challenge.started_at or new.submitted_at < v_read_at then return new; end if;
  insert into public.streak_recovery_articles(challenge_id, article_id, attempt_id)
    values (v_challenge.id, new.article_id, new.id) on conflict (challenge_id, article_id) do nothing;
  if not found then return new; end if;
  update public.streak_recovery_challenges set completed = completed + 1 where id = v_challenge.id;
  if v_challenge.completed + 1 = v_challenge.required then
    for v_day in select generate_series(v_challenge.first_missed_day,
      v_challenge.first_missed_day + v_challenge.required - 1, interval '1 day')::date loop
      insert into public.learner_activity_days(user_id, day, kinds, events)
        values (new.user_id, v_day, array['streak_recovery'], 0)
        on conflict (user_id, day) do nothing;
    end loop;
    update public.streak_recovery_challenges set status = 'completed', finished_at = now() where id = v_challenge.id;
  end if;
  return new;
end;
$$;
revoke all on function public.streak_recovery_credit() from public;
create trigger streak_recovery_credit after insert on public.news_auto_attempts
  for each row execute function public.streak_recovery_credit();

-- Admins can restore a learner's current 1-3 day gap directly, including their own.
create function public.admin_restore_streak(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_gap integer; v_today date; v_day date;
begin
  perform public.admin_require();
  if not exists(select 1 from auth.users where id = p_user) then raise exception 'Learner not found'; end if;
  v_gap := public.streak_recovery_gap(p_user);
  if v_gap not between 1 and 3 then raise exception 'Chỉ có thể khôi phục khi bỏ lỡ từ 1 đến 3 ngày'; end if;
  v_today := public.learner_local_day(p_user, now());
  for v_day in select generate_series(v_today - v_gap, v_today - 1, interval '1 day')::date loop
    insert into public.learner_activity_days(user_id, day, kinds, events)
      values (p_user, v_day, array['streak_recovery'], 0)
      on conflict (user_id, day) do nothing;
  end loop;
  update public.streak_recovery_challenges set status = 'completed', finished_at = now()
    where user_id = p_user and status = 'active';
  perform public.admin_log(p_user, 'restore_streak', jsonb_build_object('days', v_gap));
  return public.learner_streak(p_user);
end;
$$;
revoke all on function public.admin_restore_streak(uuid) from public;
grant execute on function public.admin_restore_streak(uuid) to authenticated;
