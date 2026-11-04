-- A passing, server-graded placement test opens each subsequent Grammar level.
-- Learners may read their unlocks; only the server (service role) may write them.
create table if not exists public.grammar_level_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in ('A2','B1','B2','C1','C2')),
  score_percent integer not null check (score_percent between 80 and 100),
  correct_count integer not null check (correct_count between 16 and 20),
  passed_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.grammar_level_unlocks enable row level security;
revoke insert, update, delete on public.grammar_level_unlocks from anon, authenticated;
grant select on public.grammar_level_unlocks to authenticated;
create policy grammar_level_unlocks_read_self on public.grammar_level_unlocks
  for select to authenticated using (user_id = (select auth.uid()));
