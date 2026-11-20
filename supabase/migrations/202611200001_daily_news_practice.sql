-- Keep the daily article pipeline aligned with its quiz capacity.
update public.news_articles a set interest_topics = array(
  select distinct unnest(a.interest_topics || array_remove(array[
    case when a.title ~* '\m(student|school|university|college|education|scholarship|exam|campus)\M' or a.category = 'Education' then 'study' end,
    case when a.title ~* '\m(career|job|workplace|internship|startup|entrepreneur|employment)\M' then 'career' end,
    case when a.title ~* '\m(technology|digital|app|gaming|game|esports|artificial intelligence|ai)\M' or a.category = 'Technology' then 'technology' end,
    case when a.title ~* '\m(travel|tourism|tourist|festival|food|restaurant|destination)\M' then 'lifestyle' end,
    case when a.title ~* '\m(sport|football|soccer|basketball|athlete|olympic|match)\M' then 'sports' end
  ]::text[], null))
);

create function public.news_quiz_backlog() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.news_articles a
  join public.news_article_bodies b on b.article_id = a.id
  left join public.news_auto_quiz_sets q on q.article_id = a.id
  where a.external_id like 'press-discovery:%'
    and a.publication_status = 'published' and not a.sensitive
    and q.article_id is null;
$$;
revoke all on function public.news_quiz_backlog() from public;
grant execute on function public.news_quiz_backlog() to service_role;

create function public.news_ready_article_ids() returns table(article_id uuid)
language sql stable security definer set search_path = '' as $$
  select q.article_id from public.news_auto_quiz_sets q
  join public.news_articles a on a.id = q.article_id
  join public.news_article_bodies b on b.article_id = a.id
  where a.publication_status = 'published' and not a.sensitive;
$$;
revoke all on function public.news_ready_article_ids() from public;
grant execute on function public.news_ready_article_ids() to authenticated;

create function public.news_admin_quality_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'recentArticles', (select count(*) from public.news_articles a where a.external_id like 'press-discovery:%'
      and a.publication_status = 'published' and a.published_at > now() - interval '24 hours'),
    'quizBacklog', public.news_quiz_backlog(),
    'averageWords', (select round(avg(array_length(regexp_split_to_array(trim(b.body_text), '[[:space:]]+'), 1)))
      from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
      where a.external_id like 'press-discovery:%' and a.published_at > now() - interval '24 hours'),
    'averageQuestions', (select round(avg(q.question_count)::numeric, 1)
      from public.news_articles a join public.news_auto_quiz_sets q on q.article_id = a.id
      where a.external_id like 'press-discovery:%' and a.published_at > now() - interval '24 hours'),
    'quizErrors', (select count(*) from public.news_enrichment_attempts t where t.kind = 'quiz'
      and t.status = 'error' and t.attempted_at > now() - interval '24 hours')
  );
end;
$$;
revoke all on function public.news_admin_quality_stats() from public;
grant execute on function public.news_admin_quality_stats() to authenticated;

-- The timed mode grades all questions when time runs out; an empty value is
-- explicitly an unanswered item and is always incorrect.
create function public.news_submit_auto_exam(p_article_id uuid, p_answers jsonb, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_total integer; v_score integer; v_review jsonb; v_breakdown jsonb;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Quiz unavailable'; end if;
  select count(*) into v_total from public.news_auto_questions where article_id = p_article_id;
  if v_total = 0 or jsonb_typeof(p_answers) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answers)) <> v_total then raise exception 'Answer every question or leave it blank'; end if;
  if exists (select 1 from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id and (
      not (p_answers ? q.id::text)
      or jsonb_typeof(p_answers->q.id::text) not in ('string','number')
      or length(p_answers->>q.id::text) > 120
      or k.correct_index is not null and (p_answers->>q.id::text) !~ '^([0-3])?$'
      or k.correct_index is null and (p_answers->>q.id::text) <> '' and public.news_normalize_answer(p_answers->>q.id::text) = ''
    )) then raise exception 'Invalid exam answers'; end if;
  select count(*) filter (where g.correct), coalesce(jsonb_agg(g.review order by g.ord), '[]'::jsonb)
    into v_score, v_review from (select r.*, row_number() over () as ord from public.news_grade_auto_answers(p_article_id, p_answers) r) g;
  v_breakdown := public.news_auto_breakdown(p_article_id, p_answers);
  insert into public.news_auto_attempts(user_id, article_id, answers, score, total, partial, breakdown, duration_seconds)
  values (v_user, p_article_id, p_answers, v_score, v_total, false, v_breakdown,
    case when p_seconds between 0 and 1200 then p_seconds end);
  return jsonb_build_object('score', v_score, 'total', v_total, 'review', v_review, 'breakdown', v_breakdown, 'partial', false);
end;
$$;
revoke all on function public.news_submit_auto_exam(uuid,jsonb,integer) from public;
grant execute on function public.news_submit_auto_exam(uuid,jsonb,integer) to authenticated;
