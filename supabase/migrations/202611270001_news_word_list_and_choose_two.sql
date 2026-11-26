-- Two Cambridge Reading forms the Daily News paper lacked:
--  * summary_word_list: a summary whose gaps are filled from one list of words, A–J (5–10 options per item);
--  * mcq_multiple: "Choose TWO letters, A–E". One question is two rows with the same prompt and the same five
--    options, each keyed to one of the two correct letters. The pair is graded as a set, so the order the two
--    letters are given in never matters, and each correct letter scores one mark.
-- Only limits are widened; no existing row changes. Written answers keep the grading live in production
-- (normalised exact match); 202611260003 (news_answer_matches) is not applied yet, and whoever applies it must keep
-- the mcq_multiple branch and the 0–9 letters below in its news_grade_auto_answers.

alter table public.news_auto_questions drop constraint news_auto_questions_type_check;
alter table public.news_auto_questions add constraint news_auto_questions_type_check check (question_type = any (array[
  'mcq', 'tfng', 'ynng', 'matching_headings', 'matching_information', 'matching_features', 'matching_sentence_endings',
  'sentence_completion', 'summary_completion', 'note_completion', 'table_completion', 'flow_chart_completion',
  'diagram_label_completion', 'short_answer', 'summary_word_list', 'mcq_multiple']));

alter table public.news_auto_questions drop constraint news_auto_questions_options_check;
alter table public.news_auto_questions add constraint news_auto_questions_options_check check (jsonb_typeof(options) = 'array' and (
  (question_type = 'tfng' and options = '["True", "False", "Not Given"]'::jsonb)
  or (question_type = 'ynng' and options = '["Yes", "No", "Not Given"]'::jsonb)
  or (question_type = any (array['mcq', 'matching_headings', 'matching_information', 'matching_features', 'matching_sentence_endings'])
    and jsonb_array_length(options) between 3 and 4)
  or (question_type = 'summary_word_list' and jsonb_array_length(options) between 5 and 10)
  or (question_type = 'mcq_multiple' and jsonb_array_length(options) between 5 and 6)
  or (question_type = any (array['sentence_completion', 'summary_completion', 'note_completion', 'table_completion',
    'flow_chart_completion', 'diagram_label_completion', 'short_answer']) and jsonb_array_length(options) = 0)));

alter table public.news_auto_answer_keys drop constraint news_auto_answer_keys_correct_index_check;
alter table public.news_auto_answer_keys add constraint news_auto_answer_keys_correct_index_check check (correct_index between 0 and 9);
alter table public.news_auto_answer_keys drop constraint news_auto_answer_keys_option_notes_check;
alter table public.news_auto_answer_keys add constraint news_auto_answer_keys_option_notes_check check (option_notes is null
  or (jsonb_typeof(option_notes) = 'array' and jsonb_array_length(option_notes) between 3 and 10));

create or replace function public.news_grade_auto_answers(p_article_id uuid, p_answers jsonb)
returns table(question_id uuid, question_type text, correct boolean, review jsonb)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_question record; v_choice text;
begin
  for v_question in select q.id, q.question_type, q.prompt, q.sort_order, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation, k.option_notes
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id and p_answers ? q.id::text order by q.sort_order loop
    v_choice := p_answers->>v_question.id::text;
    question_id := v_question.id;
    question_type := v_question.question_type;
    if v_question.question_type = 'mcq_multiple' then
      -- A letter scores when it is one of the question's keys and an earlier row of the same question did not give it.
      correct := case when v_choice ~ '^[0-9]$' then
        exists (select 1 from public.news_auto_questions s join public.news_auto_answer_keys sk on sk.question_id = s.id
          where s.article_id = p_article_id and s.question_type = 'mcq_multiple' and s.prompt = v_question.prompt
            and sk.correct_index = v_choice::integer)
        and not exists (select 1 from public.news_auto_questions s
          where s.article_id = p_article_id and s.question_type = 'mcq_multiple' and s.prompt = v_question.prompt
            and s.sort_order < v_question.sort_order and p_answers->>s.id::text = v_choice)
        else false end;
    elsif v_question.correct_index is not null then
      correct := case when v_choice ~ '^[0-9]$' then v_choice::integer = v_question.correct_index else false end;
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
$function$;

-- Choice answers may now be any letter up to J (index 9).
create or replace function public.news_submit_auto_practice(p_article_id uuid, p_answers jsonb, p_seconds integer default null)
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
  -- Every key is a question of this quiz and every answer has the right form.
  if (select count(*) from public.news_auto_questions q where q.article_id = p_article_id and p_answers ? q.id::text) <> v_count
    or exists (select 1 from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
      where q.article_id = p_article_id and p_answers ? q.id::text and (
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

create or replace function public.news_submit_auto_exam(p_article_id uuid, p_answers jsonb, p_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      or k.correct_index is not null and (p_answers->>q.id::text) !~ '^([0-9])?$'
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
$function$;
