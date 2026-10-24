-- Separate opening a passage, finishing the reading, and finishing the quiz.
alter table public.user_news_progress add column if not exists read_completed_at timestamptz;
alter table public.news_sources add column if not exists cache_until timestamptz;

create or replace function public.news_claim_source(p_source_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean;
begin
  update public.news_sources set last_checked_at=now()
  where id=p_source_id and enabled and policy_status in ('METADATA_ONLY','FULL_REUSE_ALLOWED')
    and length(trim(reviewed_basis)) >= 12
    and (cache_until is null or cache_until <= now())
    and (last_checked_at is null or last_checked_at <= now() - make_interval(mins=>min_interval_minutes))
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end;
$$;
revoke all on function public.news_claim_source(uuid) from public;
grant execute on function public.news_claim_source(uuid) to service_role;

create or replace function public.news_finish_read(p_slug text) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select id into v_id from public.news_learning_articles where slug=p_slug and published;
  if v_id is null then raise exception 'Reading unavailable'; end if;
  insert into public.user_news_progress(user_id,article_id,read_completed_at,xp_awarded)
    values(v_user,v_id,now(),5)
    on conflict(user_id,article_id) do update set last_read_at=now(),
      read_completed_at=coalesce(public.user_news_progress.read_completed_at,now()),
      xp_awarded=greatest(public.user_news_progress.xp_awarded,5);
end;
$$;
revoke all on function public.news_finish_read(text) from public;
grant execute on function public.news_finish_read(text) to authenticated;

create or replace function public.news_submit_quiz(p_slug text, p_answers jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_article public.news_learning_articles%rowtype; v_total integer; v_score integer; v_review jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 8192 then raise exception 'Invalid answers'; end if;
  select * into v_article from public.news_learning_articles where slug=p_slug and published;
  if not found then raise exception 'Reading unavailable'; end if;
  select count(*), count(*) filter (where lower(trim(coalesce(p_answers ->> q.id::text,''))) = lower(trim(k.correct_answer)))
    into v_total,v_score from public.news_questions q join public.news_answer_keys k on k.question_id=q.id where q.article_id=v_article.id;
  if v_total = 0 or v_total > 30 then raise exception 'Quiz unavailable'; end if;
  insert into public.news_reading_attempts(user_id,article_id,answers,score,total) values(v_user,v_article.id,p_answers,v_score,v_total);
  insert into public.user_news_progress(user_id,article_id,completed_at,best_score,best_total,xp_awarded)
    values(v_user,v_article.id,now(),v_score,v_total,25)
    on conflict(user_id,article_id) do update set last_read_at=now(), completed_at=coalesce(public.user_news_progress.completed_at,now()),
      best_score=greatest(coalesce(public.user_news_progress.best_score,0),excluded.best_score), best_total=excluded.best_total,
      xp_awarded=greatest(public.user_news_progress.xp_awarded,excluded.xp_awarded);
  update public.study_tasks set completed=true where id=(select id from public.study_tasks
    where user_id=v_user and lesson_slug='news:'||p_slug and not completed order by due_date,created_at limit 1);
  select jsonb_agg(jsonb_build_object('id',q.id,'correctAnswer',k.correct_answer,'explanation',k.explanation,'yourAnswer',p_answers ->> q.id::text) order by q.sort_order)
    into v_review from public.news_questions q join public.news_answer_keys k on k.question_id=q.id where q.article_id=v_article.id;
  return jsonb_build_object('score',v_score,'total',v_total,'review',v_review);
end;
$$;
revoke all on function public.news_submit_quiz(text,jsonb) from public;
grant execute on function public.news_submit_quiz(text,jsonb) to authenticated;

-- Shared notebook-word review schedule (also includes words saved from News).
create table if not exists public.user_word_reviews (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notebook_entry_id uuid not null references public.notebook_entries(id) on delete cascade,
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 365),
  repetitions integer not null default 0 check (repetitions between 0 and 1000),
  last_reviewed_at timestamptz,
  primary key(user_id, notebook_entry_id)
);
alter table public.user_word_reviews enable row level security;
create policy reviews_self on public.user_word_reviews for all to authenticated
  using (user_id=auth.uid())
  with check (user_id=auth.uid() and exists(select 1 from public.notebook_entries n where n.id=notebook_entry_id and n.user_id=auth.uid() and n.kind='word'));
revoke all on public.user_word_reviews from anon,authenticated;
grant select,delete on public.user_word_reviews to authenticated;
grant insert(notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at) on public.user_word_reviews to authenticated;
grant update(due_at,interval_days,repetitions,last_reviewed_at) on public.user_word_reviews to authenticated;

create function public.news_check_answer_option() returns trigger language plpgsql set search_path = '' as $$
declare v_options jsonb;
begin
  select options into v_options from public.news_questions where id=new.question_id;
  if jsonb_array_length(v_options)>0 and not exists(
    select 1 from jsonb_array_elements_text(v_options) as x(value) where lower(trim(x.value))=lower(trim(new.correct_answer))
  ) then raise exception 'Correct answer must match an option'; end if;
  return new;
end;
$$;
create trigger news_answer_option_guard before insert or update on public.news_answer_keys
for each row execute function public.news_check_answer_option();

create function public.news_preserve_published_material() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.news_learning_articles where id=old.article_id and published) then
    if tg_table_name='news_vocabulary' and (select count(*) from public.news_vocabulary where article_id=old.article_id) <= 1 then
      raise exception 'Unpublish article before removing its last vocabulary item';
    end if;
    if tg_table_name='news_questions' and (select count(*) from public.news_questions where article_id=old.article_id) <= 1 then
      raise exception 'Unpublish article before removing its last question';
    end if;
  end if;
  return old;
end;
$$;
create trigger news_preserve_last_word before delete on public.news_vocabulary
for each row execute function public.news_preserve_published_material();
create trigger news_preserve_last_question before delete on public.news_questions
for each row execute function public.news_preserve_published_material();
