-- Keep archive ingestion within the capacity of the quiz worker.
create or replace function public.news_pending_quiz_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.news_articles a
  join public.news_article_bodies b on b.article_id = a.id
  where a.publication_status = 'published'
    and not a.sensitive
    and not exists (
      select 1 from public.news_auto_quiz_sets q where q.article_id = a.id
    );
$$;

revoke all on function public.news_pending_quiz_count() from public, anon, authenticated;
grant execute on function public.news_pending_quiz_count() to service_role;

-- Short but readable articles also need a passage-grounded question set.
alter table public.news_auto_quiz_sets drop constraint news_auto_quiz_sets_question_count_check;
alter table public.news_auto_quiz_sets add constraint news_auto_quiz_sets_question_count_check check (question_count between 1 and 30);

create or replace function public.news_publish_auto_quiz(p_article_id uuid, p_model text, p_questions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_question jsonb; v_question_id uuid; v_index integer := 0; v_count integer;
begin
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'Question list required'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count not between 1 and 30 then raise exception 'Between 1 and 30 questions required'; end if;
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
      and ((p_kind = 'image' and b.article_id is not null and b.image_url is null and i.article_id is null and f.article_id is null)
        or (p_kind = 'quiz' and b.article_id is not null and q.article_id is null))
    order by a.published_at desc, a.fetched_at desc, a.id desc limit 100
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
