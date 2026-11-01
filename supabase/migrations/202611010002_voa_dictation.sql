-- VOA audio lives in Cloudflare R2. This database stores only reviewed metadata and attempts.
create table public.voa_dictation_lessons (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique check (source_url ~ '^https://learningenglish[.]voanews[.]com/'),
  title text not null check (length(title) between 5 and 240),
  topic text not null default 'VOA Learning English',
  cefr text check (cefr in ('A1','A2','B1','B2','C1','C2')),
  transcript text not null default '' check (length(transcript) <= 30000),
  audio_object_key text check (audio_object_key ~ '^dictation/voa/[0-9a-f]{64}[.]mp3$'),
  audio_sha256 text check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  audio_bytes bigint check (audio_bytes > 0),
  status text not null default 'needs_review' check (status in ('discovered','needs_review','approved','uploaded','published','blocked','rejected')),
  rights_verified boolean not null default false,
  transcript_verified boolean not null default false,
  audio_verified boolean not null default false,
  timings_verified boolean not null default false,
  cefr_reviewed boolean not null default false,
  r2_verified boolean not null default false,
  rights_basis text not null default '',
  review_notes text not null default '',
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  attribution text not null default 'VOA Learning English',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audio_object_key is null or (audio_sha256 is not null and audio_bytes is not null)),
  check (audio_object_key is null or audio_object_key = 'dictation/voa/' || audio_sha256 || '.mp3')
);
create index voa_dictation_lessons_catalog on public.voa_dictation_lessons(status, cefr, created_at desc);

create table public.voa_dictation_segments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.voa_dictation_lessons(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 3000),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  reference_text text not null check (length(reference_text) between 1 and 800),
  speaker text not null default '',
  unique (lesson_id, ordinal)
);

create table public.voa_dictation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_id uuid not null references public.voa_dictation_segments(id) on delete cascade,
  answer text not null check (length(answer) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index voa_dictation_attempts_user on public.voa_dictation_attempts(user_id, created_at desc);

-- A status update cannot skip the human review and uploaded-media gates.
create function public.voa_dictation_publication_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    if not (new.rights_verified and new.transcript_verified and new.audio_verified
      and new.timings_verified and new.cefr_reviewed and new.r2_verified)
      or new.audio_object_key is null or new.cefr is null or length(new.rights_basis) < 20
      or length(trim(new.transcript)) < 30
      or new.reviewer_id is null or new.reviewed_at is null
      or not exists (select 1 from public.voa_dictation_segments s where s.lesson_id = new.id)
      or exists (select 1 from public.voa_dictation_segments a join public.voa_dictation_segments b
        on a.lesson_id = b.lesson_id and a.ordinal < b.ordinal
        where a.lesson_id = new.id and a.end_ms > b.start_ms)
    then raise exception 'VOA lesson needs reviewed rights, media, transcript, CEFR and timed segments before publication'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger voa_dictation_publication_guard before insert or update on public.voa_dictation_lessons
  for each row execute function public.voa_dictation_publication_guard();

create function public.voa_dictation_segment_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.voa_dictation_lessons where id = coalesce(new.lesson_id, old.lesson_id) and status = 'published')
    then raise exception 'Revoke publication before editing timed segments'; end if;
  return coalesce(new, old);
end $$;
create trigger voa_dictation_segment_guard before insert or update or delete on public.voa_dictation_segments
  for each row execute function public.voa_dictation_segment_guard();

alter table public.voa_dictation_lessons enable row level security;
alter table public.voa_dictation_segments enable row level security;
alter table public.voa_dictation_attempts enable row level security;
create policy voa_lessons_read on public.voa_dictation_lessons for select to authenticated
  using (status = 'published' or public.is_admin());
create policy voa_lessons_admin on public.voa_dictation_lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy voa_segments_read on public.voa_dictation_segments for select to authenticated
  using (exists (select 1 from public.voa_dictation_lessons l where l.id = lesson_id and (l.status = 'published' or public.is_admin())));
create policy voa_segments_admin on public.voa_dictation_segments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy voa_attempts_own on public.voa_dictation_attempts for select to authenticated
  using (user_id = auth.uid());

-- Attempts are inserted through this function so learners cannot forge another account's progress.
create function public.submit_voa_dictation(p_segment_id uuid, p_answer text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or length(trim(coalesce(p_answer, ''))) not between 1 and 2000 then
    raise exception 'Sign in and enter an answer';
  end if;
  if not exists (select 1 from public.voa_dictation_segments s join public.voa_dictation_lessons l on l.id = s.lesson_id
    where s.id = p_segment_id and l.status = 'published') then raise exception 'Lesson unavailable'; end if;
  insert into public.voa_dictation_attempts(user_id, segment_id, answer)
    values (auth.uid(), p_segment_id, trim(p_answer)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_voa_dictation(uuid,text) from public;
grant execute on function public.submit_voa_dictation(uuid,text) to authenticated;
grant select, insert, update, delete on public.voa_dictation_lessons, public.voa_dictation_segments to authenticated;
grant select on public.voa_dictation_attempts to authenticated;
