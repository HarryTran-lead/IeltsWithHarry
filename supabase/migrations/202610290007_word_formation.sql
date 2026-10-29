-- Owner-provided 300 Word Families. Source forms and warnings are retained for audit.
create table public.word_formation_families (
  id integer primary key check (id between 1 and 300),
  noun text not null,
  verb text,
  adjective text not null,
  adverb text,
  meaning_vi text not null,
  example_pos text not null check (example_pos in ('noun','verb','adj','adv')),
  example_blank_en text not null check (example_blank_en like '%____%'),
  example_vi text not null,
  source_warning text,
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  content_status text not null default 'source_unreviewed',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.word_formation_families enable row level security;
create policy word_formation_families_read on public.word_formation_families
  for select to authenticated using (published or (select public.is_admin()));
grant select on public.word_formation_families to authenticated;

create table public.user_word_formation_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  family_id integer not null references public.word_formation_families(id) on delete cascade,
  mode text not null check (mode in ('family','blank','choice','error','rewrite','context','translation')),
  guidance text not null check (guidance in ('basic','intermediate','advanced')),
  attempts integer not null default 0 check (attempts >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  self_checked_count integer not null default 0 check (self_checked_count >= 0),
  last_result text not null check (last_result in ('correct','wrong','self_checked')),
  due_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  primary key (user_id,family_id,mode,guidance)
);
create index user_word_formation_due_idx on public.user_word_formation_progress (user_id,mode,guidance,due_at);
alter table public.user_word_formation_progress enable row level security;
create policy user_word_formation_progress_self on public.user_word_formation_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_word_formation_progress to authenticated;
