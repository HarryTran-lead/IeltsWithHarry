-- Preserve superseded question sets and answer keys for audit. Historical
-- attempts remain in news_auto_attempts, including their score and breakdown.
create table public.news_auto_quiz_archives (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  model text not null,
  generated_at timestamptz not null,
  question_count integer not null,
  questions jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.news_auto_quiz_archives enable row level security;
revoke all on public.news_auto_quiz_archives from public, anon, authenticated;

insert into public.news_auto_quiz_archives (article_id, model, generated_at, question_count, questions)
select s.article_id, s.model, s.generated_at, s.question_count,
  coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('answer_key', to_jsonb(k)) order by q.sort_order)
    from public.news_auto_questions q
    join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = s.article_id), '[]'::jsonb)
from public.news_auto_quiz_sets s
where s.question_count not between 6 and 13
on conflict (article_id) do nothing;

-- Regeneration gives eligible articles a new set; short articles stay readable
-- without an artificially padded quiz. Attempt summaries are independent of
-- quiz sets and remain available in the learner's history.
delete from public.news_auto_quiz_sets where question_count not between 6 and 13;
alter table public.news_auto_quiz_sets drop constraint news_auto_quiz_sets_question_count_check;
alter table public.news_auto_quiz_sets add constraint news_auto_quiz_sets_question_count_check
  check (question_count between 6 and 13);

create or replace function public.news_publish_auto_quiz(p_article_id uuid, p_model text, p_questions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_question jsonb; v_question_id uuid; v_index integer := 0; v_count integer;
begin
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'Question list required'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count not between 6 and 13 then raise exception 'Between 6 and 13 questions required'; end if;
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

create or replace function public.news_pending_quiz_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.news_articles a
  join public.news_article_bodies b on b.article_id = a.id
  where a.publication_status = 'published' and not a.sensitive
    and array_length(regexp_split_to_array(trim(b.body_text), '[[:space:]]+'), 1) >= 400
    and not exists (select 1 from public.news_auto_quiz_sets q where q.article_id = a.id);
$$;

create or replace function public.news_quiz_backlog()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.news_articles a
  join public.news_article_bodies b on b.article_id = a.id
  where a.external_id like 'press-discovery:%'
    and a.publication_status = 'published' and not a.sensitive
    and array_length(regexp_split_to_array(trim(b.body_text), '[[:space:]]+'), 1) >= 400
    and not exists (select 1 from public.news_auto_quiz_sets q where q.article_id = a.id);
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
        or (p_kind = 'quiz' and b.article_id is not null
          and array_length(regexp_split_to_array(trim(b.body_text), '[[:space:]]+'), 1) >= 400
          and q.article_id is null))
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

-- Previous failed or successful attempts must not keep a removed set out of the queue.
delete from public.news_enrichment_attempts t where t.kind = 'quiz'
  and exists (select 1 from public.news_auto_quiz_archives a where a.article_id = t.article_id)
  and not exists (select 1 from public.news_auto_quiz_sets s where s.article_id = t.article_id);
