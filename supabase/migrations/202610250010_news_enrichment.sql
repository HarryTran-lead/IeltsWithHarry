-- AI practice is attached only to articles whose full text is already permitted on site.
-- Keep answer keys private and publish all ten questions atomically.
create table public.news_auto_quiz_sets (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  model text not null,
  generated_at timestamptz not null default now()
);
create table public.news_auto_questions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_auto_quiz_sets(article_id) on delete cascade,
  sort_order integer not null check (sort_order between 0 and 9),
  prompt text not null check (length(prompt) between 10 and 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  supporting_sentence text not null check (length(supporting_sentence) between 15 and 500),
  unique(article_id, sort_order)
);
create table public.news_auto_answer_keys (
  question_id uuid primary key references public.news_auto_questions(id) on delete cascade,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null check (length(explanation) between 10 and 1000)
);
create table public.news_auto_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  answers jsonb not null,
  score integer not null check (score between 0 and 10),
  submitted_at timestamptz not null default now()
);
create index news_auto_attempts_user_date on public.news_auto_attempts(user_id, submitted_at desc);
alter table public.news_auto_questions enable row level security;
alter table public.news_auto_answer_keys enable row level security;
alter table public.news_auto_attempts enable row level security;
create policy news_auto_questions_read on public.news_auto_questions for select to authenticated using (
  exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = article_id and a.publication_status = 'published' and not a.sensitive)
);
create policy news_auto_attempts_self on public.news_auto_attempts for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.news_auto_quiz_sets, public.news_auto_questions, public.news_auto_answer_keys, public.news_auto_attempts from public, anon, authenticated;
grant select on public.news_auto_questions, public.news_auto_attempts to authenticated;

create function public.news_publish_auto_quiz(p_article_id uuid, p_model text, p_questions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_question jsonb; v_question_id uuid; v_index integer := 0;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) <> 10 then raise exception 'Exactly ten questions required'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Full article unavailable'; end if;
  insert into public.news_auto_quiz_sets(article_id, model) values (p_article_id, left(p_model, 80)) on conflict do nothing;
  if not found then return false; end if;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    insert into public.news_auto_questions(article_id, sort_order, prompt, options, supporting_sentence)
    values (p_article_id, v_index, v_question->>'prompt', v_question->'options', v_question->>'supporting_sentence')
    returning id into v_question_id;
    insert into public.news_auto_answer_keys(question_id, correct_index, explanation)
    values (v_question_id, (v_question->>'correct_index')::integer, v_question->>'explanation');
    v_index := v_index + 1;
  end loop;
  return true;
end;
$$;
revoke all on function public.news_publish_auto_quiz(uuid,text,jsonb) from public;
grant execute on function public.news_publish_auto_quiz(uuid,text,jsonb) to service_role;

create function public.news_submit_auto_quiz(p_article_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_question record; v_choice text; v_score integer := 0; v_count integer := 0; v_review jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers)) <> 10 then raise exception 'Answer all ten questions'; end if;
  if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
    where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive) then raise exception 'Quiz unavailable'; end if;
  for v_question in select q.id, q.supporting_sentence, k.correct_index, k.explanation
    from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id
    where q.article_id = p_article_id order by q.sort_order loop
    v_count := v_count + 1;
    v_choice := p_answers->>v_question.id::text;
    if v_choice is null or v_choice !~ '^[0-3]$' then raise exception 'Answer all ten questions'; end if;
    if v_choice::integer = v_question.correct_index then v_score := v_score + 1; end if;
    v_review := v_review || jsonb_build_array(jsonb_build_object('id',v_question.id,'correctIndex',v_question.correct_index,
      'explanation',v_question.explanation,'supportingSentence',v_question.supporting_sentence));
  end loop;
  if v_count <> 10 then raise exception 'Quiz unavailable'; end if;
  insert into public.news_auto_attempts(user_id, article_id, answers, score) values (v_user, p_article_id, p_answers, v_score);
  return jsonb_build_object('score',v_score,'total',10,'review',v_review);
end;
$$;
revoke all on function public.news_submit_auto_quiz(uuid,jsonb) from public;
grant execute on function public.news_submit_auto_quiz(uuid,jsonb) to authenticated;

-- Illustrations are clearly separate from publisher photography. Only files with
-- explicit Commons public-domain or CC0 metadata are stored by the worker.
create table public.news_auto_illustrations (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  image_url text not null check (image_url ~ '^https://(upload|thumb)\.wikimedia\.org/'),
  image_alt text not null check (length(image_alt) between 5 and 300),
  image_credit text not null check (length(image_credit) between 3 and 200),
  image_source_url text not null check (image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:'),
  license_name text not null check (license_name in ('Public domain','CC0')),
  created_at timestamptz not null default now()
);
alter table public.news_auto_illustrations enable row level security;
create policy news_auto_illustrations_read on public.news_auto_illustrations for select to authenticated using (
  exists (select 1 from public.news_articles a where a.id = article_id and a.publication_status = 'published' and not a.sensitive)
);
revoke all on public.news_auto_illustrations from public, anon, authenticated;
grant select on public.news_auto_illustrations to authenticated;

create table public.news_enrichment_attempts (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  kind text not null check (kind in ('quiz','image')),
  attempted_at timestamptz not null default now(),
  retry_after timestamptz not null default now() + interval '1 day',
  status text not null default 'running' check (status in ('running','success','none','error')),
  error_message text,
  primary key(article_id, kind)
);
revoke all on public.news_enrichment_attempts from public, anon, authenticated;

create function public.news_claim_enrichment(p_kind text, p_limit integer)
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
        or (p_kind = 'quiz' and b.article_id is not null and length(b.body_text) >= 700 and q.article_id is null))
    order by a.published_at desc limit 100
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind) values (v_row.id, p_kind)
    on conflict (article_id, kind) do update set attempted_at = now(), retry_after = now() + interval '1 day', status = 'running', error_message = null
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
revoke all on function public.news_claim_enrichment(text,integer) from public;
grant execute on function public.news_claim_enrichment(text,integer) to service_role;

create or replace view public.news_archive_catalog with (security_invoker = true) as
select a.id, a.source_id, a.title, a.publisher, a.canonical_url, a.category,
  a.published_at, a.fetched_at, a.attribution_text, a.sensitive, a.publication_status,
  (b.article_id is not null) as readable,
  coalesce(b.image_url, i.image_url, f.image_url) as image_url,
  coalesce(b.image_alt, i.image_alt, f.image_alt) as image_alt,
  coalesce(b.image_credit, i.image_credit, f.image_credit) as image_credit,
  f.image_source_url as illustration_source_url, f.license_name as illustration_license
from public.news_articles a
left join public.news_article_bodies b on b.article_id = a.id
left join public.news_article_images i on i.article_id = a.id
left join public.news_auto_illustrations f on f.article_id = a.id;

-- The existing sync secret also authenticates bounded enrichment work. A
-- separate schedule prevents slow AI calls from delaying news ingestion.
select cron.schedule('ieltswithharry-news-enrich-10m', '5,15,25,35,45,55 * * * *', $cron$
  select net.http_post(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name='news_sync_url'), '/api/news/sync', '/api/news/enrich'),
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='news_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 45000
  );
$cron$);
