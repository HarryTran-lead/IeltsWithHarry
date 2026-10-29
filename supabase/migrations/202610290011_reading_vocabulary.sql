-- Owner-provided IELTS Reading vocabulary and the nine practice modes.
create table public.reading_vocabulary_entries (
  id text primary key check (id ~ '^RV[0-9]{4}$'),
  source_order integer not null unique check (source_order between 1 and 607),
  headword text not null,
  pos text not null,
  meaning_vi text not null,
  example_en text not null,
  example_vi text not null,
  related_expression_en text not null default '',
  context_chunk text not null default '',
  topic text not null,
  difficulty text not null check (difficulty in ('foundation','intermediate','advanced')),
  content jsonb not null,
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  content_status text not null default 'source_unreviewed',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index reading_vocabulary_topic_idx on public.reading_vocabulary_entries (topic, source_order) where published;
create index reading_vocabulary_headword_idx on public.reading_vocabulary_entries (headword, id) where published;
alter table public.reading_vocabulary_entries enable row level security;
create policy reading_vocabulary_entries_read on public.reading_vocabulary_entries
  for select to authenticated using (published or (select public.is_admin()));
grant select on public.reading_vocabulary_entries to authenticated;

create table public.reading_vocabulary_plan_days (
  day_number smallint primary key check (day_number between 1 and 84),
  week_number smallint not null check (week_number between 1 and 12),
  activity_type text not null,
  phase text not null,
  new_vocabulary_ids text[] not null,
  daily_tasks jsonb not null,
  notes_vi text not null default ''
);
alter table public.reading_vocabulary_plan_days enable row level security;
create policy reading_vocabulary_plan_read on public.reading_vocabulary_plan_days
  for select to authenticated using (true);
grant select on public.reading_vocabulary_plan_days to authenticated;

create table public.user_reading_vocabulary_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id text not null references public.reading_vocabulary_entries(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  repetitions integer not null default 0 check (repetitions >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  last_grade text not null check (last_grade in ('again','hard','good','easy')),
  success_days date[] not null default '{}',
  success_types text[] not null default '{}',
  mistake_open boolean not null default false,
  last_mistake_at timestamptz,
  recovery_days date[] not null default '{}',
  mastered_at timestamptz,
  primary key (user_id,entry_id)
);
create index user_reading_vocab_due_idx on public.user_reading_vocabulary_progress (user_id,due_at);
alter table public.user_reading_vocabulary_progress enable row level security;
create policy user_reading_vocab_progress_self on public.user_reading_vocabulary_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_reading_vocabulary_progress to authenticated;

create table public.user_reading_vocabulary_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id text not null references public.reading_vocabulary_entries(id) on delete cascade,
  exercise_id text not null,
  exercise_type text not null check (exercise_type in ('context','flashcard','recall','srs','translation')),
  direction text not null default '',
  submitted_answer text not null default '',
  result text not null check (result in ('correct','incorrect','self_reviewed')),
  self_rating text not null check (self_rating in ('again','hard','good','easy')),
  created_at timestamptz not null default now()
);
create index user_reading_vocab_attempts_recent_idx on public.user_reading_vocabulary_attempts (user_id,created_at desc);
alter table public.user_reading_vocabulary_attempts enable row level security;
create policy user_reading_vocab_attempts_self on public.user_reading_vocabulary_attempts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert on public.user_reading_vocabulary_attempts to authenticated;
grant usage, select on sequence public.user_reading_vocabulary_attempts_id_seq to authenticated;

create table public.user_reading_vocabulary_plan_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number smallint not null references public.reading_vocabulary_plan_days(day_number),
  completed_at timestamptz not null default now(),
  primary key (user_id,day_number)
);
alter table public.user_reading_vocabulary_plan_days enable row level security;
create policy user_reading_vocab_plan_self on public.user_reading_vocabulary_plan_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.user_reading_vocabulary_plan_days to authenticated;
