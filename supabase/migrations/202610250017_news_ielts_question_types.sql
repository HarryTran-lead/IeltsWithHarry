-- Daily News AI practice in IELTS Reading format: 20 questions grouped as
-- True/False/Not Given, multiple choice, sentence completion and short answer.

alter table public.news_auto_quiz_sets add column question_count integer not null default 10
  check (question_count between 10 and 30);

alter table public.news_auto_questions add column question_type text not null default 'mcq'
  constraint news_auto_questions_type_check
  check (question_type in ('tfng', 'mcq', 'sentence_completion', 'short_answer'));
alter table public.news_auto_questions drop constraint news_auto_questions_sort_order_check;
alter table public.news_auto_questions add constraint news_auto_questions_sort_order_check check (sort_order between 0 and 29);
alter table public.news_auto_questions drop constraint news_auto_questions_options_check;
alter table public.news_auto_questions add constraint news_auto_questions_options_check check (
  jsonb_typeof(options) = 'array' and (
    question_type = 'mcq' and jsonb_array_length(options) = 4
    or question_type = 'tfng' and options = '["True","False","Not Given"]'::jsonb
    or question_type in ('sentence_completion', 'short_answer') and jsonb_array_length(options) = 0
  )
);

-- Choice questions keep an index; written answers keep the accepted wordings.
alter table public.news_auto_answer_keys alter column correct_index drop not null;
alter table public.news_auto_answer_keys add column accepted_answers jsonb;
alter table public.news_auto_answer_keys add constraint news_auto_answer_keys_kind_check check (
  correct_index is not null and accepted_answers is null
  or correct_index is null and jsonb_typeof(accepted_answers) = 'array' and jsonb_array_length(accepted_answers) between 1 and 5
);

alter table public.news_auto_attempts drop constraint news_auto_attempts_score_check;
alter table public.news_auto_attempts add column total integer not null default 10 check (total between 1 and 30);
alter table public.news_auto_attempts add constraint news_auto_attempts_score_check check (score between 0 and total);

-- Case, punctuation, digit separators and a leading article do not change a written answer.
create function public.news_normalize_answer(p_value text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    btrim(regexp_replace(regexp_replace(lower(coalesce(p_value, '')), '([0-9]),([0-9])', '\1\2', 'g'), '[^a-z0-9]+', ' ', 'g')),
    '^(the|a|an) ', ''))
$$;

create or replace function public.news_publish_auto_quiz(p_article_id uuid, p_model text, p_questions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_question jsonb; v_question_id uuid; v_index integer := 0; v_count integer;
begin
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'Question list required'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count not between 10 and 30 then raise exception 'Between 10 and 30 questions required'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Full article unavailable'; end if;
  insert into public.news_auto_quiz_sets(article_id, model, question_count) values (p_article_id, left(p_model, 80), v_count) on conflict do nothing;
  if not found then return false; end if;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    insert into public.news_auto_questions(article_id, sort_order, question_type, prompt, options, supporting_sentence)
    values (p_article_id, v_index, coalesce(v_question->>'type', 'mcq'), v_question->>'prompt',
      coalesce(v_question->'options', '[]'::jsonb), v_question->>'supporting_sentence')
    returning id into v_question_id;
    insert into public.news_auto_answer_keys(question_id, correct_index, accepted_answers, explanation)
    values (v_question_id, (v_question->>'correct_index')::integer,
      case when jsonb_typeof(v_question->'accepted_answers') = 'array' then v_question->'accepted_answers' end,
      v_question->>'explanation');
    v_index := v_index + 1;
  end loop;
  return true;
end;
$$;

create or replace function public.news_submit_auto_quiz(p_article_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_question record; v_choice text; v_right boolean;
  v_score integer := 0; v_count integer := 0; v_total integer; v_review jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Quiz unavailable'; end if;
  select count(*) into v_total from public.news_auto_questions where article_id = p_article_id;
  if v_total = 0 then raise exception 'Quiz unavailable'; end if;
  if jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers)) <> v_total then raise exception 'Answer every question'; end if;
  for v_question in select q.id, q.question_type, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id order by q.sort_order loop
    v_count := v_count + 1;
    v_choice := p_answers->>v_question.id::text;
    if v_choice is null or length(v_choice) > 120 then raise exception 'Answer every question'; end if;
    if v_question.correct_index is not null then
      if v_choice !~ '^[0-3]$' then raise exception 'Answer every question'; end if;
      v_right := v_choice::integer = v_question.correct_index;
    else
      if public.news_normalize_answer(v_choice) = '' then raise exception 'Answer every question'; end if;
      v_right := exists (select 1 from jsonb_array_elements_text(v_question.accepted_answers) a(value)
        where public.news_normalize_answer(a.value) = public.news_normalize_answer(v_choice));
    end if;
    if v_right then v_score := v_score + 1; end if;
    v_review := v_review || jsonb_build_array(jsonb_build_object('id', v_question.id, 'type', v_question.question_type,
      'correct', v_right, 'correctIndex', v_question.correct_index, 'acceptedAnswers', v_question.accepted_answers,
      'explanation', v_question.explanation, 'supportingSentence', v_question.supporting_sentence));
  end loop;
  if v_count <> v_total then raise exception 'Quiz unavailable'; end if;
  insert into public.news_auto_attempts(user_id, article_id, answers, score, total) values (v_user, p_article_id, p_answers, v_score, v_total);
  return jsonb_build_object('score', v_score, 'total', v_total, 'review', v_review);
end;
$$;

-- Twenty questions need a passage of reasonable length (about 330 words or more).
create or replace function public.news_claim_enrichment(p_kind text, p_limit integer)
returns table(article_id uuid, title text, body_text text)
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_claimed uuid; v_count integer := 0;
begin
  if p_kind not in ('quiz','image') or p_limit not between 1 and 8 then raise exception 'Invalid enrichment request'; end if;
  for v_row in
    select a.id, a.title, b.body_text from public.news_articles a
    left join public.news_article_bodies b on b.article_id = a.id
    left join public.news_article_images i on i.article_id = a.id
    left join public.news_auto_illustrations f on f.article_id = a.id
    left join public.news_auto_quiz_sets q on q.article_id = a.id
    left join public.news_enrichment_attempts t on t.article_id = a.id and t.kind = p_kind
    where a.publication_status = 'published' and not a.sensitive
      and (t.article_id is null or t.retry_after <= now())
      and ((p_kind = 'image' and b.image_url is null and i.article_id is null and f.article_id is null)
        or (p_kind = 'quiz' and b.article_id is not null and length(b.body_text) >= 2000 and q.article_id is null))
    order by a.published_at desc limit 100
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind) values (v_row.id, p_kind)
    on conflict on constraint news_enrichment_attempts_pkey do update
      set attempted_at = now(), retry_after = now() + interval '1 day', status = 'running', error_message = null
      where public.news_enrichment_attempts.retry_after <= now()
    returning public.news_enrichment_attempts.article_id into v_claimed;
    if v_claimed is not null then
      article_id := v_row.id; title := v_row.title; body_text := v_row.body_text; return next;
      v_count := v_count + 1;
      if v_count >= p_limit then exit; end if;
    end if;
  end loop;
end;
$$;

-- Earlier AI sets were ten multiple-choice questions; regenerate them in the new format.
-- Learners' past scores stay in news_auto_attempts.
delete from public.news_auto_quiz_sets;
delete from public.news_enrichment_attempts where kind = 'quiz';
