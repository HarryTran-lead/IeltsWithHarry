-- Server-owned deadlines and recoverable, idempotent timed attempts.
create table public.news_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '20 minutes',
  answers jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  question_version text not null,
  is_test boolean not null default false,
  submitted_at timestamptz,
  result jsonb,
  constraint news_exam_answers_object check (jsonb_typeof(answers) = 'object')
);
create unique index news_exam_one_open on public.news_exam_sessions(user_id, article_id, is_test) where submitted_at is null;
alter table public.news_exam_sessions enable row level security;
create policy news_exam_self on public.news_exam_sessions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.news_exam_sessions from public, anon, authenticated;
grant select on public.news_exam_sessions to authenticated;

alter table public.news_auto_attempts add column exam_session_id uuid unique references public.news_exam_sessions(id),
  add column mode text not null default 'practice' check(mode in ('practice','timed'));
create function public.news_tag_timed_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=nullif(current_setting('app.news_exam_session',true),'')::uuid;
begin
  if v_id is not null then
    if not exists(select 1 from public.news_exam_sessions where id=v_id and user_id=auth.uid() and user_id=new.user_id and article_id=new.article_id and submitted_at is null and not is_test) then raise exception 'Invalid timed session';end if;
    new.exam_session_id:=v_id;new.mode:='timed';
  end if;
  return new;
end;
$$;
revoke all on function public.news_tag_timed_attempt() from public,anon,authenticated;
create trigger news_tag_timed_attempt before insert on public.news_auto_attempts for each row execute function public.news_tag_timed_attempt();

create function public.news_exam_question_version(p_article_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select md5(coalesce(string_agg(q.id::text || q.prompt || q.options::text || k::text, '|' order by q.sort_order, q.id), '')
    || coalesce((select b.body_text from public.news_article_bodies b where b.article_id=p_article_id),''))
  from public.news_auto_questions q join public.news_auto_answer_keys k on k.question_id = q.id where q.article_id = p_article_id;
$$;
revoke all on function public.news_exam_question_version(uuid) from public, anon, authenticated;

create function public.news_open_auto_exam(p_article_id uuid, p_create boolean default false, p_test boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_session public.news_exam_sessions; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  select * into v_session from public.news_exam_sessions where user_id = v_user and article_id = p_article_id and is_test = p_test and submitted_at is null;
  if v_session.id is null and p_create then
    if not exists (select 1 from public.news_articles a join public.news_article_bodies b on b.article_id = a.id
      where a.id = p_article_id and a.publication_status = 'published' and not a.sensitive)
      or not exists (select 1 from public.news_auto_questions where article_id = p_article_id) then raise exception 'Quiz unavailable'; end if;
    insert into public.news_exam_sessions(user_id,article_id,question_version,is_test)
      values (v_user,p_article_id,public.news_exam_question_version(p_article_id),p_test)
      on conflict (user_id,article_id,is_test) where submitted_at is null do nothing;
    select * into v_session from public.news_exam_sessions where user_id = v_user and article_id = p_article_id and is_test = p_test and submitted_at is null;
  end if;
  if v_session.id is null then return null; end if;
  return to_jsonb(v_session) || jsonb_build_object('server_now',clock_timestamp(), 'stale',v_session.question_version <> public.news_exam_question_version(p_article_id));
end;
$$;

create function public.news_save_auto_exam(p_session_id uuid, p_answers jsonb, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_session public.news_exam_sessions;
begin
  select * into v_session from public.news_exam_sessions where id = p_session_id and user_id = auth.uid() for update;
  if v_session.id is null then raise exception 'Session unavailable'; end if;
  if v_session.submitted_at is not null or clock_timestamp() >= v_session.expires_at then raise exception 'Session expired or submitted'; end if;
  if v_session.question_version <> public.news_exam_question_version(v_session.article_id) then raise exception 'Questions changed; start a new attempt'; end if;
  if p_revision is distinct from v_session.revision then raise exception 'Another tab changed this attempt. Reload to recover its answers'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 16000
    or exists (select 1 from jsonb_each(p_answers) a where jsonb_typeof(a.value) not in ('string','number') or length(a.value #>> '{}') > 120
      or not exists (select 1 from public.news_auto_questions q where q.article_id = v_session.article_id and q.id::text = a.key)) then raise exception 'Invalid answers'; end if;
  update public.news_exam_sessions set answers = p_answers, revision = revision + 1 where id = p_session_id returning * into v_session;
  return to_jsonb(v_session) || jsonb_build_object('server_now',clock_timestamp());
end;
$$;

create function public.news_finish_auto_exam(p_session_id uuid, p_answers jsonb, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_session public.news_exam_sessions; v_answers jsonb; v_result jsonb; v_seconds integer;
begin
  select * into v_session from public.news_exam_sessions where id = p_session_id and user_id = auth.uid() for update;
  if v_session.id is null then raise exception 'Session unavailable'; end if;
  if v_session.result is not null then return v_session.result; end if;
  if v_session.question_version <> public.news_exam_question_version(v_session.article_id) then raise exception 'Questions changed; this attempt cannot be graded'; end if;
  if clock_timestamp() < v_session.expires_at then
    perform public.news_save_auto_exam(p_session_id,p_answers,p_revision);
    v_answers := p_answers;
  else
    -- Late requests can only submit the last draft accepted before the deadline.
    v_answers := v_session.answers;
  end if;
  select jsonb_object_agg(q.id::text,coalesce(v_answers->q.id::text,'""'::jsonb)) into v_answers
    from public.news_auto_questions q where q.article_id = v_session.article_id;
  v_seconds := least(1200,greatest(0,floor(extract(epoch from clock_timestamp() - v_session.started_at))::integer));
  if v_session.is_test then
    select jsonb_build_object('review',jsonb_agg(g.review),'score',count(*) filter(where g.correct),'total',count(*),
      'breakdown',public.news_auto_breakdown(v_session.article_id,v_answers),'test',true) into v_result
      from public.news_grade_auto_answers(v_session.article_id,v_answers) g;
  else
    perform set_config('app.news_exam_session',v_session.id::text,true);
    v_result := public.news_submit_auto_exam(v_session.article_id,v_answers,v_seconds);
    perform set_config('app.news_exam_session','',true);
  end if;
  v_result := v_result || jsonb_build_object('durationSeconds',v_seconds,'answers',v_answers);
  update public.news_exam_sessions set answers = v_answers, submitted_at = clock_timestamp(), result = v_result where id = p_session_id;
  return v_result;
end;
$$;

-- Abandoning is explicit; exiting the reader or reloading never grants more time.
create function public.news_close_stale_auto_exam(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.news_exam_sessions set submitted_at = clock_timestamp()
  where id = p_session_id and user_id = auth.uid() and submitted_at is null
    and question_version <> public.news_exam_question_version(article_id);
end;
$$;
revoke all on function public.news_open_auto_exam(uuid,boolean,boolean), public.news_save_auto_exam(uuid,jsonb,integer), public.news_finish_auto_exam(uuid,jsonb,integer), public.news_close_stale_auto_exam(uuid) from public, anon;
grant execute on function public.news_open_auto_exam(uuid,boolean,boolean), public.news_save_auto_exam(uuid,jsonb,integer), public.news_finish_auto_exam(uuid,jsonb,integer), public.news_close_stale_auto_exam(uuid) to authenticated;
