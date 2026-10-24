-- Daily News: discovery metadata is deliberately separate from authored reading content.
create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 100),
  provider text not null check (provider in ('gdelt', 'rss')),
  feed_url text,
  category text not null default 'Science' check (category in ('Technology','Science','Education','Health','Environment','Business','Culture','World News')),
  policy_status text not null default 'MANUAL_PERMISSION_REQUIRED' check (policy_status in ('METADATA_ONLY','FULL_REUSE_ALLOWED','MANUAL_PERMISSION_REQUIRED','DISABLED')),
  reviewed_basis text not null default '',
  attribution_text text not null default '',
  enabled boolean not null default false,
  auto_publish boolean not null default false,
  min_interval_minutes integer not null default 30 check (min_interval_minutes between 30 and 1440),
  etag text, last_modified text, last_checked_at timestamptz, last_success_at timestamptz, last_error text,
  created_at timestamptz not null default now(),
  check (not enabled or (policy_status in ('METADATA_ONLY','FULL_REUSE_ALLOWED') and length(trim(reviewed_basis)) >= 12)),
  check (not auto_publish or (enabled and policy_status in ('METADATA_ONLY','FULL_REUSE_ALLOWED') and length(trim(reviewed_basis)) >= 12)),
  check (provider <> 'rss' or feed_url ~ '^https://')
);
create unique index news_sources_feed_unique on public.news_sources(feed_url) where feed_url is not null;

create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id),
  provider text not null,
  external_id text,
  canonical_hash text not null unique,
  title text not null check (length(title) between 5 and 400),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  publisher text not null check (length(publisher) between 1 and 150),
  language text not null default 'English',
  category text not null check (category in ('Technology','Science','Education','Health','Environment','Business','Culture','World News')),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  publication_status text not null default 'review' check (publication_status in ('review','published','hidden','archived')),
  sensitive boolean not null default false,
  attribution_text text not null default '',
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048)
);
create index news_articles_feed_idx on public.news_articles(publication_status, published_at desc, id);
create index news_articles_category_idx on public.news_articles(category, publication_status, published_at desc);
create index news_articles_source_idx on public.news_articles(source_id, fetched_at desc);
create index news_articles_provider_external_idx on public.news_articles(provider, external_id) where external_id is not null;

create table public.news_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','not_modified','error')),
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  error_message text
);
create index news_sync_runs_source_idx on public.news_sync_runs(source_id, started_at desc);

create function public.news_claim_source(p_source_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean;
begin
  update public.news_sources set last_checked_at=now()
  where id=p_source_id and enabled and policy_status in ('METADATA_ONLY','FULL_REUSE_ALLOWED')
    and length(trim(reviewed_basis)) >= 12
    and (last_checked_at is null or last_checked_at <= now() - make_interval(mins=>min_interval_minutes))
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end;
$$;
revoke all on function public.news_claim_source(uuid) from public;
grant execute on function public.news_claim_source(uuid) to service_role;

create function public.news_freshness() returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(last_success_at) from public.news_sources where enabled and last_success_at is not null;
$$;
revoke all on function public.news_freshness() from public;
grant execute on function public.news_freshness() to authenticated;

create table public.news_learning_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (length(title) between 5 and 200),
  summary text not null default '',
  category text not null check (category in ('Technology','Science','Education','Health','Environment','Business','Culture','World News')),
  stage_id text not null references public.learning_stages(id),
  passage text not null check (length(passage) between 100 and 20000),
  rights_status text not null check (rights_status in ('ORIGINAL','LICENSED','AUTHORIZED_ADAPTATION')),
  rights_basis text not null check (length(trim(rights_basis)) >= 12),
  source_url text,
  audio_url text,
  audio_rights_basis text,
  related_news_id uuid references public.news_articles(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audio_url is null or (audio_url ~ '^https://' and length(trim(coalesce(audio_rights_basis,''))) >= 12)),
  check (rights_status = 'ORIGINAL' or (source_url ~ '^https?://' and length(trim(rights_basis)) >= 12))
);
create index news_learning_stage_idx on public.news_learning_articles(stage_id, published, created_at desc);
create index news_learning_category_idx on public.news_learning_articles(category, published, created_at desc);

create table public.news_vocabulary (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_learning_articles(id) on delete cascade,
  word text not null check (length(word) between 1 and 80),
  part_of_speech text not null default '',
  meaning_vi text not null,
  definition text not null default '',
  phonetic text not null default '',
  example text not null default '',
  sort_order integer not null default 0,
  unique(article_id, word)
);
create table public.news_questions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_learning_articles(id) on delete cascade,
  kind text not null check (kind in ('multiple_choice','true_false_not_given','matching','vocabulary','main_idea','short_answer')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 8),
  supporting_sentence text not null default '',
  sort_order integer not null default 0
);
create table public.news_answer_keys (
  question_id uuid primary key references public.news_questions(id) on delete cascade,
  correct_answer text not null,
  explanation text not null default ''
);
create function public.news_validate_publish() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.published and (tg_op = 'INSERT' or old.published is false) then
    if not exists(select 1 from public.news_vocabulary where article_id=new.id)
      or not exists(select 1 from public.news_questions q join public.news_answer_keys k on k.question_id=q.id where q.article_id=new.id)
    then raise exception 'Add vocabulary and at least one graded question before publishing'; end if;
  end if;
  return new;
end;
$$;
create trigger news_publish_guard before insert or update of published on public.news_learning_articles
for each row execute function public.news_validate_publish();
create table public.user_saved_news (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key(user_id, article_id)
);
create table public.user_news_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_learning_articles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  completed_at timestamptz,
  best_score integer,
  best_total integer,
  xp_awarded integer not null default 0,
  primary key(user_id, article_id)
);
create table public.news_reading_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_learning_articles(id) on delete cascade,
  answers jsonb not null,
  score integer not null,
  total integer not null,
  submitted_at timestamptz not null default now()
);
create index news_attempts_user_idx on public.news_reading_attempts(user_id, submitted_at desc);

alter table public.news_sources enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_sync_runs enable row level security;
alter table public.news_learning_articles enable row level security;
alter table public.news_vocabulary enable row level security;
alter table public.news_questions enable row level security;
alter table public.news_answer_keys enable row level security;
alter table public.user_saved_news enable row level security;
alter table public.user_news_progress enable row level security;
alter table public.news_reading_attempts enable row level security;

create policy news_sources_admin on public.news_sources for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_articles_read on public.news_articles for select to authenticated using ((publication_status = 'published' and not sensitive) or public.is_admin());
create policy news_articles_admin_write on public.news_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_runs_admin on public.news_sync_runs for select to authenticated using (public.is_admin());
create policy news_learning_read on public.news_learning_articles for select to authenticated using (published or public.is_admin());
create policy news_learning_admin on public.news_learning_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_vocab_read on public.news_vocabulary for select to authenticated using (exists(select 1 from public.news_learning_articles a where a.id = article_id and (a.published or public.is_admin())));
create policy news_vocab_admin on public.news_vocabulary for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_questions_read on public.news_questions for select to authenticated using (exists(select 1 from public.news_learning_articles a where a.id = article_id and (a.published or public.is_admin())));
create policy news_questions_admin on public.news_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_keys_admin on public.news_answer_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy saved_self on public.user_saved_news for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_self_read on public.user_news_progress for select to authenticated using (user_id = auth.uid());
create policy attempts_self_read on public.news_reading_attempts for select to authenticated using (user_id = auth.uid());

revoke all on public.news_sources, public.news_articles, public.news_sync_runs, public.news_learning_articles, public.news_vocabulary, public.news_questions, public.news_answer_keys, public.user_saved_news, public.user_news_progress, public.news_reading_attempts from anon, authenticated;
grant select, insert, update, delete on public.news_sources, public.news_articles, public.news_learning_articles, public.news_vocabulary, public.news_questions, public.news_answer_keys to authenticated;
grant select on public.news_sync_runs, public.user_news_progress, public.news_reading_attempts to authenticated;
grant select, insert, delete on public.user_saved_news to authenticated;

create function public.news_mark_read(p_slug text) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select id into v_id from public.news_learning_articles where slug = p_slug and published;
  if v_id is null then raise exception 'Reading unavailable'; end if;
  insert into public.user_news_progress(user_id,article_id) values(v_user,v_id)
    on conflict(user_id,article_id) do update set last_read_at=now();
end;
$$;
revoke all on function public.news_mark_read(text) from public;
grant execute on function public.news_mark_read(text) to authenticated;

create function public.news_submit_quiz(p_slug text, p_answers jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_article public.news_learning_articles%rowtype; v_total integer; v_score integer; v_review jsonb; v_awarded integer := 0;
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
    values(v_user,v_article.id,now(),v_score,v_total,20)
    on conflict(user_id,article_id) do update set last_read_at=now(), completed_at=coalesce(public.user_news_progress.completed_at,now()),
      best_score=greatest(coalesce(public.user_news_progress.best_score,0),excluded.best_score), best_total=excluded.best_total,
      xp_awarded=greatest(public.user_news_progress.xp_awarded,excluded.xp_awarded)
    returning case when xp_awarded = 20 and completed_at is not null then 20 else 0 end into v_awarded;
  update public.study_tasks set completed=true where id=(select id from public.study_tasks
    where user_id=v_user and lesson_slug='news:'||p_slug and not completed order by due_date,created_at limit 1);
  select jsonb_agg(jsonb_build_object('id',q.id,'correctAnswer',k.correct_answer,'explanation',k.explanation,'yourAnswer',p_answers ->> q.id::text) order by q.sort_order)
    into v_review from public.news_questions q join public.news_answer_keys k on k.question_id=q.id where q.article_id=v_article.id;
  return jsonb_build_object('score',v_score,'total',v_total,'review',v_review);
end;
$$;
revoke all on function public.news_submit_quiz(text,jsonb) from public;
grant execute on function public.news_submit_quiz(text,jsonb) to authenticated;

create function public.admin_save_news_question(p_id uuid,p_article_id uuid,p_kind text,p_prompt text,p_options jsonb,p_answer text,p_explanation text,p_support text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin required'; end if;
  if p_kind not in ('multiple_choice','true_false_not_given','matching','vocabulary','main_idea','short_answer') or length(trim(p_prompt)) < 5 or length(trim(p_answer)) < 1 or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options)>8 then raise exception 'Invalid question'; end if;
  if p_id is null then
    insert into public.news_questions(article_id,kind,prompt,options,supporting_sentence,sort_order)
      values(p_article_id,p_kind,p_prompt,p_options,p_support,coalesce((select max(sort_order)+1 from public.news_questions where article_id=p_article_id),0)) returning id into v_id;
  else
    update public.news_questions set kind=p_kind,prompt=p_prompt,options=p_options,supporting_sentence=p_support where id=p_id and article_id=p_article_id returning id into v_id;
    if v_id is null then raise exception 'Question unavailable'; end if;
  end if;
  insert into public.news_answer_keys(question_id,correct_answer,explanation) values(v_id,p_answer,p_explanation)
    on conflict(question_id) do update set correct_answer=excluded.correct_answer,explanation=excluded.explanation;
  return v_id;
end;
$$;
revoke all on function public.admin_save_news_question(uuid,uuid,text,text,jsonb,text,text,text) from public;
grant execute on function public.admin_save_news_question(uuid,uuid,text,text,jsonb,text,text,text) to authenticated;

insert into public.news_sources(name,provider,category,policy_status,reviewed_basis,attribution_text,enabled,auto_publish)
values('GDELT English discovery','gdelt','World News','METADATA_ONLY','GDELT Terms of Use allow data redistribution with citation; linked publisher text remains external. Reviewed 2026-10-24.','Data discovery: The GDELT Project',true,false);
insert into public.news_sources(name,provider,feed_url,category,policy_status,reviewed_basis,attribution_text,enabled,auto_publish)
values('NASA News Releases','rss','https://www.nasa.gov/news-release/feed/','Science','METADATA_ONLY',
  'NASA official RSS Feeds page lists this News Releases feed; display title, link, date and publisher only. Reviewed 2026-10-24.',
  'NASA News Releases',true,true);
