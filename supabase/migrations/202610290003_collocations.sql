-- Owner-authorized collocation collection, separate from IELTS and CEFR vocabulary.
create table public.collocation_entries (
  id text primary key,
  source_order integer not null unique,
  duplicate_source_orders integer[] not null default '{}',
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  phrase text not null,
  normalized_key text not null unique,
  meaning_vi text not null,
  example_en text not null,
  example_vi text not null,
  note text not null default '',
  qa_flags text[] not null default '{}',
  source_archive_sha256 text not null,
  content_status text not null default 'source_unreviewed',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index collocation_entries_level_order_idx on public.collocation_entries (level, source_order) where published;
alter table public.collocation_entries enable row level security;
create policy collocation_entries_read on public.collocation_entries for select to authenticated using (published or (select public.is_admin()));
grant select on public.collocation_entries to authenticated;

create table public.user_collocation_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collocation_id text not null references public.collocation_entries(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  repetitions integer not null default 0 check (repetitions >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  last_grade text not null default 'again' check (last_grade in ('again','hard','good','easy')),
  primary key (user_id, collocation_id)
);
create index user_collocation_progress_due_idx on public.user_collocation_progress (user_id, due_at);
alter table public.user_collocation_progress enable row level security;
create policy user_collocation_progress_self on public.user_collocation_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_collocation_progress to authenticated;
