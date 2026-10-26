-- Learner results for the self-checked practice in course-package lessons,
-- so the course book can show a score per lesson and suggest what to review.
create table public.package_practice_results (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_slug text not null check (char_length(lesson_slug) between 1 and 160),
  correct integer not null check (correct >= 0),
  checked integer not null check (checked >= correct),
  total integer not null check (total >= checked and total <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_slug)
);

alter table public.package_practice_results enable row level security;

create policy package_practice_results_self on public.package_practice_results for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.package_practice_results from anon, authenticated;
grant select on public.package_practice_results to authenticated;
grant insert (user_id, lesson_slug, correct, checked, total, updated_at) on public.package_practice_results to authenticated;
-- Upserts set every column they send, keys included; the policy keeps user_id pinned to the caller.
grant update (user_id, lesson_slug, correct, checked, total, updated_at) on public.package_practice_results to authenticated;
