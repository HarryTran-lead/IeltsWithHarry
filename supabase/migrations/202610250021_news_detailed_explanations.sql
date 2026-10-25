-- Detailed Vietnamese feedback for Daily News AI questions: a longer explanation of
-- why the answer is right and, for choice questions, a note per option on why it is
-- right or wrong. Like the answer itself, the notes stay private until submission.

alter table public.news_auto_answer_keys drop constraint news_auto_answer_keys_explanation_check;
alter table public.news_auto_answer_keys add constraint news_auto_answer_keys_explanation_check check (length(explanation) between 10 and 2000);
alter table public.news_auto_answer_keys add column option_notes jsonb check (
  option_notes is null or jsonb_typeof(option_notes) = 'array' and jsonb_array_length(option_notes) between 3 and 4
);

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
    insert into public.news_auto_answer_keys(question_id, correct_index, accepted_answers, explanation, option_notes)
    values (v_question_id, (v_question->>'correct_index')::integer,
      case when jsonb_typeof(v_question->'accepted_answers') = 'array' then v_question->'accepted_answers' end,
      v_question->>'explanation',
      case when jsonb_typeof(v_question->'option_notes') = 'array' then v_question->'option_notes' end);
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
  for v_question in select q.id, q.question_type, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation, k.option_notes
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
      'explanation', v_question.explanation, 'optionNotes', v_question.option_notes, 'supportingSentence', v_question.supporting_sentence));
  end loop;
  if v_count <> v_total then raise exception 'Quiz unavailable'; end if;
  insert into public.news_auto_attempts(user_id, article_id, answers, score, total) values (v_user, p_article_id, p_answers, v_score, v_total);
  return jsonb_build_object('score', v_score, 'total', v_total, 'review', v_review);
end;
$$;

-- Earlier sets have short English explanations; regenerate them with Vietnamese feedback.
-- Learners' past scores stay in news_auto_attempts.
delete from public.news_auto_quiz_sets;
delete from public.news_enrichment_attempts where kind = 'quiz';
