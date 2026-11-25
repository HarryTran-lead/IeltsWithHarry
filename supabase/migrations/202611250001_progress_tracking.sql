-- Progress tracking: one definition of a study day.
-- A day counts when learner_activity_days has real events (events > 0). This adds the two
-- sources that were missing: submitted IELTS tests with at least one answer, and five minutes
-- of real on-page activity (visible tab, recent input or playing audio).

-- 1. Submitted question-bank tests count, but only when the learner answered something:
--    an attempt that expired untouched or was submitted blank is not studying.
create function public.ielts_attempt_has_answer(p_answers jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists(select 1 from jsonb_each_text(coalesce(p_answers, '{}'::jsonb)) a where left(a.key, 2) <> '__' and btrim(a.value) <> '')
    or length(btrim(coalesce(p_answers->>'__response', ''))) > 0;
$$;

create function public.track_ielts_attempt_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state <> 'in_progress' and old.state = 'in_progress' and new.submitted_at is not null
    and public.ielts_attempt_has_answer(new.answers) then
    perform public.record_learning_activity(new.user_id, 'ielts_test', new.submitted_at);
  end if;
  return new;
end;
$$;
revoke all on function public.track_ielts_attempt_activity() from public;
create trigger track_activity after update of state on public.ielts_attempts
  for each row execute function public.track_ielts_attempt_activity();

-- Backfill tests submitted before this trigger existed.
insert into public.learner_activity_days as d (user_id, day, kinds, events, first_at, last_at)
select a.user_id, public.learner_local_day(a.user_id, a.submitted_at), array['ielts_test'], count(*)::integer, min(a.submitted_at), max(a.submitted_at)
  from public.ielts_attempts a
 where a.state <> 'in_progress' and a.submitted_at is not null and public.ielts_attempt_has_answer(a.answers)
 group by a.user_id, public.learner_local_day(a.user_id, a.submitted_at)
on conflict (user_id, day) do update set
  kinds = case when 'ielts_test' = any(d.kinds) then d.kinds else d.kinds || 'ielts_test' end,
  events = d.events + excluded.events,
  first_at = least(d.first_at, excluded.first_at),
  last_at = greatest(d.last_at, excluded.last_at);

-- 2. Real study time per local day, reported by the app in small chunks.
create table public.learner_active_time (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  seconds integer not null default 0 check (seconds between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.learner_active_time enable row level security;
create policy learner_active_time_read on public.learner_active_time for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.learner_active_time from anon, authenticated;
grant select on public.learner_active_time to authenticated;

-- One call per minute at most is expected; each call adds at most 90 seconds and a day at most 16 hours.
-- Crossing five minutes records one 'active_time' event, so the day counts like any other study day.
create function public.record_active_seconds(p_seconds integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date;
  v_add integer := least(greatest(coalesce(p_seconds, 0), 0), 90);
  v_before integer;
  v_after integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if v_add = 0 then return 0; end if;
  v_day := public.learner_local_day(v_user, now());
  select seconds into v_before from public.learner_active_time where user_id = v_user and day = v_day for update;
  v_before := coalesce(v_before, 0);
  if v_before >= 57600 then return v_before; end if;
  insert into public.learner_active_time as t (user_id, day, seconds, updated_at)
    values (v_user, v_day, least(v_add, 57600), now())
    on conflict (user_id, day) do update set seconds = least(t.seconds + v_add, 57600), updated_at = now()
    returning seconds into v_after;
  if v_before < 300 and v_after >= 300 then
    perform public.record_learning_activity(v_user, 'active_time', now());
  end if;
  return v_after;
end;
$$;
revoke all on function public.record_active_seconds(integer) from public;
grant execute on function public.record_active_seconds(integer) to authenticated;
