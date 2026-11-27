-- Count Band Translation ("Luyện diễn đạt") progress toward learner XP and level.
-- Each unique exercise (`translation-item:<key>` in package_practice_results) earns
-- 3 XP when attempted and 5 XP once mastered (`correct >= 1`), using the existing
-- (user_id, lesson_slug) primary key so repeated reviews cannot farm unbounded XP.

create or replace function public.learner_total_xp(p_user uuid) returns integer
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
    + coalesce((select sum(case when correct >= 1 then 5 else 3 end)
        from public.package_practice_results
        where user_id = p_user and lesson_slug like 'translation-item:%' and checked >= 1), 0)
    + coalesce((select sum(xp) from public.learner_daily_login_rewards where user_id = p_user), 0)
  )::integer;
$$;

revoke all on function public.learner_total_xp(uuid) from public;
