-- Short-answer and completion grading accepts what an IELTS examiner would:
--  * a hedge kept in the key is optional ("approximately 300" accepts "300");
--  * one or two words repeated from the question are ignored ("44 brands" for "How many brands…?").
-- Spelling, singular/plural and extra content words still count as wrong.

create or replace function public.news_answer_matches(p_answer text, p_accepted text, p_prompt text default '')
returns boolean
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_answer text := public.news_normalize_answer(p_answer);
  v_key text := public.news_normalize_answer(p_accepted);
  v_core text;
  v_prompt text[];
  v_key_words text[];
  v_kept text[] := '{}';
  v_word text;
  v_dropped integer := 0;
  v_trimmed text;
begin
  if v_answer = '' or v_key = '' then return false; end if;
  if v_answer = v_key then return true; end if;
  v_core := regexp_replace(v_key, '^(approximately|about|around|roughly|nearly|almost|some) ', '');
  if v_core <> v_key and v_answer = v_core then return true; end if;

  v_prompt := string_to_array(public.news_normalize_answer(p_prompt), ' ');
  v_key_words := string_to_array(v_key, ' ');
  foreach v_word in array string_to_array(v_answer, ' ') loop
    if not (v_word = any(v_key_words))
      and (v_word = any(v_prompt) or v_word || 's' = any(v_prompt)
        or (length(v_word) > 3 and right(v_word, 1) = 's' and left(v_word, -1) = any(v_prompt))) then
      v_dropped := v_dropped + 1;
    else
      v_kept := v_kept || v_word;
    end if;
  end loop;
  if v_dropped between 1 and 2 and cardinality(v_kept) > 0 then
    v_trimmed := array_to_string(v_kept, ' ');
    return v_trimmed = v_key or v_trimmed = v_core;
  end if;
  return false;
end;
$$;

create or replace function public.news_grade_auto_answers(p_article_id uuid, p_answers jsonb)
returns table(question_id uuid, question_type text, correct boolean, review jsonb)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_question record; v_choice text;
begin
  for v_question in select q.id, q.question_type, q.prompt, q.supporting_sentence, k.correct_index, k.accepted_answers, k.explanation, k.option_notes
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id and p_answers ? q.id::text order by q.sort_order loop
    v_choice := p_answers->>v_question.id::text;
    question_id := v_question.id;
    question_type := v_question.question_type;
    if v_question.correct_index is not null then
      correct := case when v_choice ~ '^[0-3]$' then v_choice::integer = v_question.correct_index else false end;
    else
      correct := exists (select 1 from jsonb_array_elements_text(v_question.accepted_answers) a(value)
        where public.news_answer_matches(coalesce(v_choice, ''), a.value, v_question.prompt));
    end if;
    review := jsonb_build_object('id', v_question.id, 'type', v_question.question_type, 'correct', correct,
      'correctIndex', v_question.correct_index, 'acceptedAnswers', v_question.accepted_answers, 'explanation', v_question.explanation,
      'optionNotes', v_question.option_notes, 'supportingSentence', v_question.supporting_sentence);
    return next;
  end loop;
end;
$function$;
