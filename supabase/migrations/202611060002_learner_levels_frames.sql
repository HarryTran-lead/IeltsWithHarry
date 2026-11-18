-- A single XP total for saved learning work. Repeated attempts on the same
-- content do not award another full completion reward.
create table public.youtube_dictation_attempts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.youtube_listening_lessons(id) on delete cascade,
  cue_index integer not null check (cue_index between 0 and 999),
  checked_at timestamptz not null default now(),
  primary key (user_id, lesson_id, cue_index)
);
create index youtube_dictation_attempts_user on public.youtube_dictation_attempts(user_id);
alter table public.youtube_dictation_attempts enable row level security;
create policy youtube_dictation_attempts_self on public.youtube_dictation_attempts
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.youtube_dictation_attempts from public, anon, authenticated;
grant select on public.youtube_dictation_attempts to authenticated;

create function public.save_youtube_dictation_attempt(p_lesson uuid, p_cue integer, p_answer text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_cue jsonb; v_expected text; v_inserted integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_cue is null or p_cue not between 0 and 999 or p_answer is null or length(p_answer) > 1000 then
    raise exception 'Invalid dictation attempt';
  end if;
  select transcript -> p_cue into v_cue from public.youtube_listening_lessons
    where id = p_lesson and published and rights_source <> '' and rights_license <> '';
  v_expected := v_cue ->> 'text';
  if v_expected is null
     or length(btrim(p_answer)) < greatest(3, least(8, length(v_expected) * 0.35))
     or length(btrim(p_answer)) > greatest(100, length(v_expected) * 2) then
    raise exception 'Finish the sentence before checking';
  end if;
  insert into public.youtube_dictation_attempts(user_id, lesson_id, cue_index)
    values (v_user, p_lesson, p_cue) on conflict do nothing
    returning 1 into v_inserted;
  return case when v_inserted = 1 and p_cue < 10 then 3 else 0 end;
end;
$$;
revoke all on function public.save_youtube_dictation_attempt(uuid,integer,text) from public;
grant execute on function public.save_youtube_dictation_attempt(uuid,integer,text) to authenticated;

-- The first successful sign-in on each local calendar day earns five XP.
-- A retained session or token refresh cannot claim a later day unless Auth
-- recorded a sign-in on that day.
create table public.learner_daily_login_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_day date not null,
  xp integer not null default 5 check (xp = 5),
  claimed_at timestamptz not null default now(),
  primary key (user_id, local_day)
);
alter table public.learner_daily_login_rewards enable row level security;
create policy learner_daily_login_rewards_self on public.learner_daily_login_rewards
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.learner_daily_login_rewards from public, anon, authenticated;
grant select on public.learner_daily_login_rewards to authenticated;

create function public.claim_daily_login_xp() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_timezone text; v_signed_in timestamptz;
  v_today date; v_awarded integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  select coalesce(z.name, 'Asia/Ho_Chi_Minh'), u.last_sign_in_at
    into v_timezone, v_signed_in
    from public.profiles p join auth.users u on u.id = p.id
    left join pg_catalog.pg_timezone_names z on z.name = p.timezone
    where p.id = v_user;
  if v_timezone is null or v_signed_in is null then return 0; end if;
  v_today := (now() at time zone v_timezone)::date;
  if (v_signed_in at time zone v_timezone)::date <> v_today then return 0; end if;
  insert into public.learner_daily_login_rewards(user_id, local_day)
    values (v_user, v_today) on conflict do nothing returning 5 into v_awarded;
  return coalesce(v_awarded, 0);
end;
$$;
revoke all on function public.claim_daily_login_xp() from public;
grant execute on function public.claim_daily_login_xp() to authenticated;

create function public.learner_total_xp(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select least(2147483647::bigint,
    coalesce((select sum(least(xp_awarded, 25)) from public.user_news_progress where user_id = p_user), 0)
    + 5 * (select count(*) from public.user_news_article_reads where user_id = p_user)
    + 20 * (select count(distinct article_id) from public.news_auto_attempts where user_id = p_user)
    + 20 * (select count(distinct lesson_slug) from public.exercise_attempts where user_id = p_user)
    + 20 * (select count(distinct exam_id) from public.ielts_attempts where user_id = p_user and state = 'submitted')
    + 20 * (select count(distinct date(completed_at at time zone 'UTC')) from public.speaking_mock_sessions
        where user_id = p_user and speaking_seconds >= 30 and jsonb_array_length(answers) > 0)
    + 2 * coalesce((select sum(least(n, 10)) from (
        select count(*) n from public.vocabulary_review_events where user_id = p_user
        group by date(reviewed_at at time zone 'UTC')) daily), 0)
    + 10 * coalesce((select sum(least(n, 2)) from (
        select count(*) n from public.vocabulary_practice_attempts where user_id = p_user
        group by date(submitted_at at time zone 'UTC')) daily), 0)
    + 3 * (select count(*) from public.youtube_dictation_attempts where user_id = p_user and cue_index < 10)
    + coalesce((select sum(xp) from public.learner_daily_login_rewards where user_id = p_user), 0)
  )::integer;
$$;
revoke all on function public.learner_total_xp(uuid) from public;

create function public.learner_level_from_xp(p_xp integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare v_level integer := 1; v_remaining integer := greatest(0, coalesce(p_xp, 0));
begin
  while v_remaining >= 80 + 10 * (v_level - 1) loop
    v_remaining := v_remaining - (80 + 10 * (v_level - 1));
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;
revoke all on function public.learner_level_from_xp(integer) from public;

alter table public.profiles add column avatar_frame text not null default 'classic'
  check (avatar_frame in ('classic','leaf','compass','flame','book','mountain','crown'));
grant update(avatar_frame) on public.profiles to authenticated;

create function public.validate_avatar_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_required integer;
begin
  if new.avatar_frame is not distinct from old.avatar_frame then return new; end if;
  v_required := case new.avatar_frame
    when 'leaf' then 3 when 'compass' then 6 when 'flame' then 11
    when 'book' then 16 when 'mountain' then 21 when 'crown' then 26 else 1 end;
  if public.learner_level_from_xp(public.learner_total_xp(new.id)) < v_required then
    raise exception 'Avatar frame is still locked';
  end if;
  return new;
end;
$$;
create trigger validate_avatar_frame before update of avatar_frame on public.profiles
  for each row execute function public.validate_avatar_frame();

create function public.learner_xp_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_xp integer; v_level integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  v_xp := public.learner_total_xp(auth.uid());
  v_level := public.learner_level_from_xp(v_xp);
  return jsonb_build_object('xp', v_xp, 'level', v_level);
end;
$$;
revoke all on function public.learner_xp_summary() from public;
grant execute on function public.learner_xp_summary() to authenticated;

-- Only expose avatar cosmetics and level for authors visible in the community.
create function public.community_author_cards(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 50 then raise exception 'Too many authors'; end if;
  return coalesce((select jsonb_object_agg(p.id::text, jsonb_build_object(
    'avatar', p.avatar, 'frame', p.avatar_frame,
    'level', public.learner_level_from_xp(public.learner_total_xp(p.id))))
    from public.profiles p where p.id = any(p_ids)
      and not exists (select 1 from public.community_blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
      and (p.id = auth.uid() or exists (select 1 from public.community_posts post where post.author_id = p.id and post.status = 'published')
        or exists (select 1 from public.community_comments c join public.community_posts post on post.id = c.post_id
          where c.author_id = p.id and c.status = 'published' and post.status = 'published'))), '{}'::jsonb);
end;
$$;
revoke all on function public.community_author_cards(uuid[]) from public;
grant execute on function public.community_author_cards(uuid[]) to authenticated;
