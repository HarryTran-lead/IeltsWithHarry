-- Daily News practice history: every graded round is saved, including rounds
-- made of some question types. Each attempt keeps its score per question type
-- and the time spent, so learners can see their history and weak spots.

alter table public.news_auto_attempts
  add column partial boolean not null default false,
  add column breakdown jsonb not null default '{}'::jsonb constraint news_auto_attempts_breakdown_check check (jsonb_typeof(breakdown) = 'object'),
  add column duration_seconds integer constraint news_auto_attempts_duration_check check (duration_seconds between 0 and 36000);

-- Grades the answered questions of an article's quiz, in quiz order. Internal: it reveals answer keys.
create function public.news_grade_auto_answers(p_article_id uuid, p_answers jsonb)
returns table(question_id uuid, question_type text, correct boolean, review jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_question record; v_choice text;
begin
  for v_question in select q.id, q.question_type, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation, k.option_notes
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id and p_answers ? q.id::text order by q.sort_order loop
    v_choice := p_answers->>v_question.id::text;
    question_id := v_question.id;
    question_type := v_question.question_type;
    if v_question.correct_index is not null then
      correct := case when v_choice ~ '^[0-3]$' then v_choice::integer = v_question.correct_index else false end;
    else
      correct := exists (select 1 from jsonb_array_elements_text(v_question.accepted_answers) a(value)
        where public.news_normalize_answer(a.value) = public.news_normalize_answer(coalesce(v_choice, '')));
    end if;
    review := jsonb_build_object('id', v_question.id, 'type', v_question.question_type, 'correct', correct,
      'correctIndex', v_question.correct_index, 'acceptedAnswers', v_question.accepted_answers, 'explanation', v_question.explanation,
      'optionNotes', v_question.option_notes, 'supportingSentence', v_question.supporting_sentence);
    return next;
  end loop;
end;
$$;
revoke all on function public.news_grade_auto_answers(uuid, jsonb) from public, anon, authenticated;

-- { "tfng": { "correct": 4, "total": 6 }, ... } for the answered questions.
create function public.news_auto_breakdown(p_article_id uuid, p_answers jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.question_type, jsonb_build_object('correct', t.right_count, 'total', t.question_count)), '{}'::jsonb)
  from (select g.question_type, count(*) filter (where g.correct) as right_count, count(*) as question_count
    from public.news_grade_auto_answers(p_article_id, p_answers) g group by g.question_type) t;
$$;
revoke all on function public.news_auto_breakdown(uuid, jsonb) from public, anon, authenticated;

-- Grades and saves a full quiz or a round of chosen questions.
create function public.news_submit_auto_practice(p_article_id uuid, p_answers jsonb, p_seconds integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  -- Every key is a question of this quiz and every answer has the right form.
  if (select count(*) from public.news_auto_questions q where q.article_id = p_article_id and p_answers ? q.id::text) <> v_count
    or exists (select 1 from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
      where q.article_id = p_article_id and p_answers ? q.id::text and (
        length(p_answers->>q.id::text) > 120
        or k.correct_index is not null and (p_answers->>q.id::text) !~ '^[0-3]$'
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
$$;
revoke all on function public.news_submit_auto_practice(uuid, jsonb, integer) from public;
grant execute on function public.news_submit_auto_practice(uuid, jsonb, integer) to authenticated;

-- The full-quiz entry point keeps its rule that every question is answered.
create or replace function public.news_submit_auto_quiz(p_article_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers))
    <> (select count(*) from public.news_auto_questions where article_id = p_article_id) then raise exception 'Answer every question'; end if;
  return public.news_submit_auto_practice(p_article_id, p_answers, null);
end;
$$;

-- A finished full quiz reopens with its review; rounds of chosen types do not replace it.
create or replace function public.news_auto_quiz_last_result(p_article_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_attempt public.news_auto_attempts; v_review jsonb; v_total integer; v_attempts integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_attempt from public.news_auto_attempts where user_id = auth.uid() and article_id = p_article_id and not partial
    order by submitted_at desc limit 1;
  if v_attempt.id is null then return null; end if;
  select count(*) into v_total from public.news_auto_questions where article_id = p_article_id;
  -- A regenerated quiz no longer matches the saved answers.
  if v_total = 0 or (select count(*) from public.news_auto_questions q where q.article_id = p_article_id and v_attempt.answers ? q.id::text) <> v_total then return null; end if;
  select count(*) into v_attempts from public.news_auto_attempts where user_id = auth.uid() and article_id = p_article_id and not partial;
  select coalesce(jsonb_agg(g.review order by g.ord), '[]'::jsonb) into v_review
    from (select r.*, row_number() over () as ord from public.news_grade_auto_answers(p_article_id, v_attempt.answers) r) g;
  return jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'review', v_review, 'answers', v_attempt.answers,
    'submittedAt', v_attempt.submitted_at, 'attempts', v_attempts, 'durationSeconds', v_attempt.duration_seconds);
end;
$$;
revoke all on function public.news_auto_quiz_last_result(uuid) from public;
grant execute on function public.news_auto_quiz_last_result(uuid) to authenticated;

-- Past attempts get their per-type scores where the quiz they answered still exists.
update public.news_auto_attempts a set breakdown = public.news_auto_breakdown(a.article_id, a.answers);
