-- M10-L15: S5 eligibility + non-certifying study progress.
-- Run ONLY after 202611170003_speaking_s6_staging_l14.sql on a disposable staging project.
alter table public.speaking_s6_attempts
 add column if not exists preview boolean not null default false;
create index if not exists speaking_s6_attempt_preview_idx
 on public.speaking_s6_attempts(user_id,preview,created_at desc);

create table public.speaking_s6_s5_eligibility (
 user_id uuid primary key references auth.users(id) on delete cascade,
 s5_verified boolean not null default false,
 evidence_reference text,
 verified_at timestamptz,
 verified_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 check (s5_verified = false or (verified_at is not null and verified_by is not null and length(trim(evidence_reference))>0))
);
alter table public.speaking_s6_s5_eligibility enable row level security;
revoke all on public.speaking_s6_s5_eligibility from anon,authenticated;
-- No learner can set their own S5 eligibility. This table starts empty.

create table public.speaking_s6_study_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 lesson_code text not null,
 revision text not null,
 preview boolean not null default false,
 completed_steps integer[] not null default '{}',
 current_step integer not null default 1 check (current_step between 1 and 10),
 review_anchor timestamptz,
 completed_reviews integer[] not null default '{}',
 updated_at timestamptz not null default now(),
 primary key(user_id,lesson_code,revision,preview),
 foreign key(lesson_code,revision) references public.speaking_s6_lesson_revisions(lesson_code,revision),
 check (completed_steps <@ array[1,2,3,4,5,6,7,8,9,10]::integer[]),
 check (completed_reviews <@ array[2,7,21]::integer[])
);
alter table public.speaking_s6_study_progress enable row level security;
create policy s6_study_progress_owner_read on public.speaking_s6_study_progress
 for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.speaking_s6_study_progress from anon,authenticated;
grant select on public.speaking_s6_study_progress to authenticated;
-- Writes are performed only by server-side API after checking authentication,
-- global release gates and S5 eligibility (or admin-only preview).

comment on table public.speaking_s6_study_progress
 is 'Self-study completion only, never official IELTS scoring or S7 progression authorization.';
