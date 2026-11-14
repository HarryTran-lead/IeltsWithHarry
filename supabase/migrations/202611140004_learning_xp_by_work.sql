-- Rebalance future rewards without taking away XP earned before this migration.
create temporary table learner_xp_before as
  select id as user_id, public.learner_total_xp(id) as xp from auth.users;

create table public.learner_xp_legacy_adjustments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null check (xp >= 0)
);
revoke all on public.learner_xp_legacy_adjustments from public, anon, authenticated;

create table public.learner_dictation_topic_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('youtube', 'voa')),
  topic_id uuid not null,
  xp integer not null default 10 check (xp = 10),
  awarded_at timestamptz not null default now(),
  primary key (user_id, source, topic_id)
);
alter table public.learner_dictation_topic_rewards enable row level security;
create policy learner_dictation_topic_rewards_self on public.learner_dictation_topic_rewards
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.learner_dictation_topic_rewards from public, anon, authenticated;
grant select on public.learner_dictation_topic_rewards to authenticated;

create function public.award_youtube_dictation_topic() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  select least(10, jsonb_array_length(transcript)) into v_count
    from public.youtube_listening_lessons where id = new.lesson_id;
  if v_count > 0 and not exists (
    select 1 from generate_series(0, v_count - 1) as cue(index)
    where not exists (select 1 from public.youtube_dictation_attempts a
      where a.user_id = new.user_id and a.lesson_id = new.lesson_id and a.cue_index = cue.index)
  ) then
    insert into public.learner_dictation_topic_rewards(user_id, source, topic_id)
      values (new.user_id, 'youtube', new.lesson_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger award_youtube_dictation_topic after insert on public.youtube_dictation_attempts
  for each row execute function public.award_youtube_dictation_topic();

create function public.award_voa_dictation_topic() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_lesson uuid;
begin
  if new.accuracy < 80 then return new; end if;
  select lesson_id into v_lesson from public.voa_dictation_segments where id = new.segment_id;
  if v_lesson is not null and not exists (
    select 1 from public.voa_dictation_segments s where s.lesson_id = v_lesson
      and not exists (select 1 from public.voa_dictation_attempts a
        where a.user_id = new.user_id and a.segment_id = s.id and a.accuracy >= 80)
  ) then
    insert into public.learner_dictation_topic_rewards(user_id, source, topic_id)
      values (new.user_id, 'voa', v_lesson) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger award_voa_dictation_topic after insert on public.voa_dictation_attempts
  for each row execute function public.award_voa_dictation_topic();

-- Recognise topics already finished before the new reward rule.
insert into public.learner_dictation_topic_rewards(user_id, source, topic_id)
select a.user_id, 'youtube', a.lesson_id
from public.youtube_dictation_attempts a
join public.youtube_listening_lessons l on l.id = a.lesson_id
group by a.user_id, a.lesson_id, l.transcript
having count(distinct a.cue_index) filter (where a.cue_index < least(10, jsonb_array_length(l.transcript)))
  >= least(10, jsonb_array_length(l.transcript))
  and jsonb_array_length(l.transcript) > 0
on conflict do nothing;

insert into public.learner_dictation_topic_rewards(user_id, source, topic_id)
select a.user_id, 'voa', s.lesson_id
from public.voa_dictation_attempts a
join public.voa_dictation_segments s on s.id = a.segment_id
where a.accuracy >= 80
group by a.user_id, s.lesson_id
having count(distinct a.segment_id) = (select count(*) from public.voa_dictation_segments all_segments where all_segments.lesson_id = s.lesson_id)
on conflict do nothing;

-- Keep the five XP reading reward, then add two XP per correct answer.
update public.user_news_progress
set xp_awarded = (case when read_completed_at is null then 0 else 5 end)
  + (case when completed_at is null then 0 else least(60, greatest(0, coalesce(best_score, 0) * 2)) end);

create function public.news_question_xp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.xp_awarded := (case when new.read_completed_at is null then 0 else 5 end)
    + (case when new.completed_at is null then 0 else least(60, greatest(0, coalesce(new.best_score, 0) * 2)) end);
  return new;
end;
$$;
create trigger news_question_xp before insert or update on public.user_news_progress
  for each row execute function public.news_question_xp();

create or replace function public.save_youtube_dictation_attempt(p_lesson uuid, p_cue integer, p_answer text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_cue jsonb; v_expected text; v_had_reward boolean;
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
  select exists(select 1 from public.learner_dictation_topic_rewards
    where user_id = v_user and source = 'youtube' and topic_id = p_lesson) into v_had_reward;
  insert into public.youtube_dictation_attempts(user_id, lesson_id, cue_index)
    values (v_user, p_lesson, p_cue) on conflict do nothing;
  return case when not v_had_reward and exists(select 1 from public.learner_dictation_topic_rewards
    where user_id = v_user and source = 'youtube' and topic_id = p_lesson) then 10 else 0 end;
end;
$$;

create or replace function public.learner_total_xp(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select least(2147483647::bigint,
    coalesce((select sum(xp_awarded) from public.user_news_progress where user_id = p_user), 0)
    + 5 * (select count(*) from public.user_news_article_reads where user_id = p_user)
    + coalesce((select sum(least(60, best_score * 2)) from (
        select max(score) as best_score from public.news_auto_attempts
        where user_id = p_user and not partial group by article_id
      ) completed), 0)
    + 20 * (select count(distinct lesson_slug) from public.exercise_attempts where user_id = p_user)
    + coalesce((select sum(reward) from (
        select a.exam_id, coalesce(a.notes->>'__section', '') as scope,
          max(case when e.skill in ('Reading', 'Listening') then
            case when e.practice_type = 'full_test' and coalesce(a.notes->>'__section', '') = ''
              then greatest(20, least(40, coalesce(a.score, 0)))
              else greatest(10, least(20, coalesce(a.score, 0))) end
            else 20 end) as reward
        from public.ielts_attempts a join public.ielts_exams e on e.id = a.exam_id
        where a.user_id = p_user and a.state = 'submitted'
        group by a.exam_id, coalesce(a.notes->>'__section', '')
      ) completed), 0)
    + 20 * (select count(distinct date(completed_at at time zone 'UTC')) from public.speaking_mock_sessions
        where user_id = p_user and speaking_seconds >= 30 and jsonb_array_length(answers) > 0)
    + 2 * coalesce((select sum(least(n, 10)) from (
        select count(*) n from public.vocabulary_review_events where user_id = p_user
        group by date(reviewed_at at time zone 'UTC')) daily), 0)
    + 10 * coalesce((select sum(least(n, 2)) from (
        select count(*) n from public.vocabulary_practice_attempts where user_id = p_user
        group by date(submitted_at at time zone 'UTC')) daily), 0)
    + coalesce((select sum(xp) from public.learner_dictation_topic_rewards where user_id = p_user), 0)
    + coalesce((select sum(xp) from public.learner_daily_login_rewards where user_id = p_user), 0)
    + coalesce((select xp from public.learner_xp_legacy_adjustments where user_id = p_user), 0)
  )::integer;
$$;

insert into public.learner_xp_legacy_adjustments(user_id, xp)
select old.user_id, greatest(0, old.xp - public.learner_total_xp(old.user_id))
from learner_xp_before old
where old.xp > public.learner_total_xp(old.user_id);
drop table learner_xp_before;
