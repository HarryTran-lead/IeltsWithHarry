-- Learner work for Grammar Garden. There is intentionally no
-- mastery score or automatic lesson unlock until approved objective items exist.
create table if not exists public.grammar_study_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_code text not null check (lesson_code ~ '^(A1|A2|B1|B2|C1|C2)-[0-9]{2}$'),
  theory_seen boolean not null default false,
  responses jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_code)
);

alter table public.grammar_study_progress enable row level security;
create policy grammar_study_progress_self on public.grammar_study_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.grammar_study_progress from anon, authenticated;
grant select, insert, update on public.grammar_study_progress to authenticated;
