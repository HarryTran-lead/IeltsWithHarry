-- Untimed practice can be submitted with blanks (the learner confirms first).
-- A blank is sent as an empty string and graded as wrong, so it still counts in the total.

create or replace function public.news_submit_auto_practice(p_article_id uuid, p_answers jsonb, p_seconds integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_user uuid := (select auth.uid()); v_total integer; v_count integer; v_score integer; v_review jsonb; v_breakdown jsonb; v_partial boolean;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Quiz unavailable'; end if;
  select count(*) into v_total from public.news_auto_questions where article_id = p_article_id;
  if v_total = 0 then raise exception 'Quiz unavailable'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Answer every question'; end if;
  select count(*) into v_count from jsonb_object_keys(p_answers);
  if v_count = 0 or v_count > v_total then raise exception 'Answer every question'; end if;
  -- At least one real answer; every key is a question of this quiz; a non-blank answer has the right form.
  if not exists (select 1 from jsonb_each_text(p_answers) e where btrim(e.value) <> '') then raise exception 'Answer every question'; end if;
  if (select count(*) from public.news_auto_questions q where q.article_id = p_article_id and p_answers ? q.id::text) <> v_count
    or exists (select 1 from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
      where q.article_id = p_article_id and p_answers ? q.id::text and btrim(p_answers->>q.id::text) <> '' and (
        length(p_answers->>q.id::text) > 120
        or k.correct_index is not null and (p_answers->>q.id::text) !~ '^[0-9]$'
        or k.correct_index is null and public.news_normalize_answer(p_answers->>q.id::text) = '')) then
    raise exception 'Answer every question';
  end if;
  select count(*) filter (where g.correct), coalesce(jsonb_agg(g.review order by g.ord), '[]'::jsonb)
    into v_score, v_review
    from (select r.*, row_number() over () as ord from public.news_grade_auto_answers(p_article_id, p_answers) r) g;
  v_breakdown := public.news_auto_breakdown(p_article_id, p_answers);
  v_partial := v_count < v_total;
  insert into public.news_auto_attempts(user_id, article_id, answers, score, total, partial, breakdown, duration_seconds)
  values (v_user, p_article_id, p_answers, v_score, v_count, v_partial, v_breakdown,
    case when p_seconds between 0 and 36000 then p_seconds end);
  return jsonb_build_object('score', v_score, 'total', v_count, 'review', v_review, 'breakdown', v_breakdown, 'partial', v_partial);
end;
$function$;
