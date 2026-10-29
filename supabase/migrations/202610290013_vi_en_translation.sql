-- VI -> EN translation practice. Source imports remain drafts until edited and published.
create table public.vi_en_translation_exercises (
  id text primary key,
  source_item_id text not null,
  exercise_set_id text not null,
  mode text not null check (mode in ('speaking','writing')),
  topic text not null,
  term text not null,
  canonical_source_key text references public.ielts_vocabulary_entries(source_key),
  meaning_vi text not null default '',
  pos text not null default '',
  pattern text not null default '',
  collocations text not null default '',
  prompt_vi text not null check (length(trim(prompt_vi)) > 0),
  reference_en text not null check (length(trim(reference_en)) > 0),
  alternatives text[] not null default '{}',
  editor_note text not null default '',
  source_ref text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','published','rejected')),
  revision integer not null default 1 check (revision > 0),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_item_id, mode),
  check (status not in ('approved','published') or (length(trim(meaning_vi)) > 0 and reviewed_by is not null and reviewed_at is not null))
);
create index vi_en_translation_learner_idx on public.vi_en_translation_exercises (topic,mode,id) where status = 'published';
create index vi_en_translation_review_idx on public.vi_en_translation_exercises (status,topic,id);
create index vi_en_translation_source_idx on public.vi_en_translation_exercises (source_ref,mode);
alter table public.vi_en_translation_exercises enable row level security;
create policy vi_en_translation_select on public.vi_en_translation_exercises for select to authenticated
  using (status = 'published' or (select public.is_admin()));
create policy vi_en_translation_admin_write on public.vi_en_translation_exercises for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select,insert,update,delete on public.vi_en_translation_exercises to authenticated;

create table public.vi_en_translation_review_events (
  id bigint generated always as identity primary key,
  exercise_id text not null references public.vi_en_translation_exercises(id),
  editor_id uuid,
  old_status text,
  new_status text not null,
  old_revision integer,
  new_revision integer not null,
  changed_at timestamptz not null default now(),
  old_content jsonb,
  new_content jsonb not null
);
alter table public.vi_en_translation_review_events enable row level security;
create policy vi_en_translation_review_admin on public.vi_en_translation_review_events for select to authenticated
  using ((select public.is_admin()));
grant select on public.vi_en_translation_review_events to authenticated;

create function public.vi_en_translation_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and old.status not in ('approved','published') then
    raise exception 'Translation exercise must be approved before publishing';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger vi_en_translation_revision_trigger before update on public.vi_en_translation_exercises
  for each row execute function public.vi_en_translation_revision();

create function public.vi_en_translation_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vi_en_translation_review_events
      (exercise_id,editor_id,new_status,new_revision,new_content)
    values (new.id,auth.uid(),new.status,new.revision,to_jsonb(new));
  elsif row(new.prompt_vi,new.reference_en,new.meaning_vi,new.alternatives,new.editor_note,new.status)
      is distinct from row(old.prompt_vi,old.reference_en,old.meaning_vi,old.alternatives,old.editor_note,old.status) then
    insert into public.vi_en_translation_review_events
      (exercise_id,editor_id,old_status,new_status,old_revision,new_revision,old_content,new_content)
    values (new.id,auth.uid(),old.status,new.status,old.revision,new.revision,to_jsonb(old),to_jsonb(new));
  end if;
  return null;
end $$;
create trigger vi_en_translation_audit_trigger after insert or update on public.vi_en_translation_exercises
  for each row execute function public.vi_en_translation_audit();

create table public.user_vi_en_translation_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id text not null references public.vi_en_translation_exercises(id),
  first_seen_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  repetitions integer not null default 0 check (repetitions >= 0),
  last_rating text not null check (last_rating in ('again','hard','good','easy')),
  attempts_count integer not null default 1 check (attempts_count > 0),
  primary key (user_id,exercise_id)
);
create index user_vi_en_translation_due_idx on public.user_vi_en_translation_progress (user_id,due_at);
alter table public.user_vi_en_translation_progress enable row level security;
create policy user_vi_en_translation_progress_self on public.user_vi_en_translation_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (
    select 1 from public.vi_en_translation_exercises e where e.id = exercise_id and e.status = 'published'));
grant select,insert,update on public.user_vi_en_translation_progress to authenticated;

create table public.user_vi_en_translation_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id text not null references public.vi_en_translation_exercises(id),
  submitted_en text not null,
  viewed_answer boolean not null default true check (viewed_answer),
  self_rating text not null check (self_rating in ('again','hard','good','easy')),
  source_revision integer not null check (source_revision > 0),
  created_at timestamptz not null default now()
);
create index user_vi_en_translation_attempt_recent_idx on public.user_vi_en_translation_attempts (user_id,created_at desc);
alter table public.user_vi_en_translation_attempts enable row level security;
create policy user_vi_en_translation_attempt_self on public.user_vi_en_translation_attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_vi_en_translation_attempt_insert on public.user_vi_en_translation_attempts for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.vi_en_translation_exercises e where e.id = exercise_id and e.status = 'published'));
grant select,insert on public.user_vi_en_translation_attempts to authenticated;
grant usage,select on sequence public.user_vi_en_translation_attempts_id_seq to authenticated;
