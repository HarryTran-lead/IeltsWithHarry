-- Extend the existing saved-word review rows. Historical due dates and events remain intact.
alter table public.user_word_reviews add column fsrs_state jsonb;
alter table public.user_word_reviews drop constraint user_word_reviews_interval_days_check;
alter table public.user_word_reviews add constraint user_word_reviews_interval_days_check check (interval_days between 0 and 36600);
alter table public.user_word_reviews drop constraint user_word_reviews_repetitions_check;
alter table public.user_word_reviews add constraint user_word_reviews_repetitions_check check (repetitions between 0 and 100000);
alter table public.vocabulary_review_events drop constraint vocabulary_review_events_grade_check;
alter table public.vocabulary_review_events add constraint vocabulary_review_events_grade_check check (grade in ('again', 'hard', 'good', 'easy'));
alter table public.vocabulary_review_events add column request_id uuid not null default gen_random_uuid();
create unique index vocabulary_review_events_request_id on public.vocabulary_review_events(user_id, request_id);

-- One transaction for the schedule and its history. Duplicate client submissions are harmless.
create function public.save_word_fsrs_review(p_entry uuid, p_grade text, p_state jsonb, p_request uuid, p_previous_reviewed_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_due timestamptz; v_interval integer; v_reps integer;
begin
  if v_user is null or p_grade not in ('again','hard','good','easy') or p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception 'Invalid review'; end if;
  if not exists (select 1 from public.notebook_entries where id = p_entry and user_id = v_user and kind = 'word') then raise exception 'Word not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || p_entry::text, 0));
  if exists (select 1 from public.vocabulary_review_events where user_id = v_user and request_id = p_request) then return false; end if;
  if (select last_reviewed_at from public.user_word_reviews where user_id = v_user and notebook_entry_id = p_entry) is distinct from p_previous_reviewed_at then return false; end if;
  v_due := (p_state->>'due')::timestamptz;
  v_interval := (p_state->>'scheduled_days')::integer;
  v_reps := (p_state->>'reps')::integer;
  if v_due is null or v_due < now() - interval '1 hour' or v_due > now() + interval '36601 days'
     or v_interval not between 0 and 36600 or v_reps not between 0 and 100000 then raise exception 'Invalid FSRS schedule'; end if;
  insert into public.user_word_reviews(user_id, notebook_entry_id, due_at, interval_days, repetitions, last_reviewed_at, fsrs_state)
  values (v_user, p_entry, v_due, v_interval, v_reps, now(), p_state)
  on conflict (user_id, notebook_entry_id) do update set due_at = excluded.due_at, interval_days = excluded.interval_days,
    repetitions = excluded.repetitions, last_reviewed_at = excluded.last_reviewed_at, fsrs_state = excluded.fsrs_state;
  insert into public.vocabulary_review_events(user_id, notebook_entry_id, grade, request_id) values (v_user, p_entry, p_grade, p_request);
  return true;
end;
$$;
revoke all on function public.save_word_fsrs_review(uuid,text,jsonb,uuid,timestamptz) from public;
grant execute on function public.save_word_fsrs_review(uuid,text,jsonb,uuid,timestamptz) to authenticated;
revoke insert, update on public.user_word_reviews from authenticated;
revoke insert on public.vocabulary_review_events from authenticated;
revoke insert(notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at) on public.user_word_reviews from authenticated;
revoke update(due_at,interval_days,repetitions,last_reviewed_at) on public.user_word_reviews from authenticated;
revoke insert(notebook_entry_id,grade) on public.vocabulary_review_events from authenticated;

-- Admin-authored, licensed transcripts only. No YouTube media or scraped captions are stored.
create table public.youtube_listening_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  cefr text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  topic text not null check (char_length(topic) between 1 and 80),
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  rights_source text not null default '' check (char_length(rights_source) <= 500),
  rights_license text not null default '' check (char_length(rights_license) <= 160),
  published boolean not null default false check (not published or jsonb_array_length(transcript) = 0 or (rights_source <> '' and rights_license <> '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index youtube_listening_lessons_published on public.youtube_listening_lessons(published, created_at desc);
alter table public.youtube_listening_lessons enable row level security;
create policy youtube_lessons_read on public.youtube_listening_lessons for select to authenticated using (published or public.is_admin());
create policy youtube_lessons_admin on public.youtube_listening_lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.youtube_listening_lessons from anon, authenticated;
grant select on public.youtube_listening_lessons to authenticated;
grant insert(title,youtube_id,cefr,topic,transcript,questions,rights_source,rights_license,published) on public.youtube_listening_lessons to authenticated;
grant update(title,youtube_id,cefr,topic,transcript,questions,rights_source,rights_license,published,updated_at) on public.youtube_listening_lessons to authenticated;

-- Mock history stores prompts and available transcripts, never private audio blobs or fabricated bands.
create table public.speaking_mock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  duration_seconds integer not null check (duration_seconds between 0 and 3600),
  speaking_seconds integer not null check (speaking_seconds between 0 and 3600),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 50)
);
create index speaking_mock_sessions_user_date on public.speaking_mock_sessions(user_id, completed_at desc);
alter table public.speaking_mock_sessions enable row level security;
create policy speaking_mock_sessions_self on public.speaking_mock_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.speaking_mock_sessions from anon, authenticated;
grant select, delete on public.speaking_mock_sessions to authenticated;
grant insert(id,duration_seconds,speaking_seconds,answers) on public.speaking_mock_sessions to authenticated;

-- User deck metadata and memberships point at the existing notebook words.
create table public.vocabulary_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index vocabulary_decks_user_name on public.vocabulary_decks(user_id, lower(trim(name)));
alter table public.vocabulary_decks enable row level security;
create policy vocabulary_decks_self on public.vocabulary_decks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.vocabulary_decks from anon, authenticated;
grant select, delete on public.vocabulary_decks to authenticated;
grant insert(name) on public.vocabulary_decks to authenticated;
grant update(name) on public.vocabulary_decks to authenticated;

create table public.vocabulary_deck_cards (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id uuid not null,
  notebook_entry_id uuid not null references public.notebook_entries(id) on delete cascade,
  primary key(deck_id, notebook_entry_id),
  foreign key(deck_id, user_id) references public.vocabulary_decks(id, user_id) on delete cascade
);
create index vocabulary_deck_cards_user on public.vocabulary_deck_cards(user_id);
alter table public.vocabulary_deck_cards enable row level security;
create policy vocabulary_deck_cards_self on public.vocabulary_deck_cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.notebook_entries where id = notebook_entry_id and user_id = (select auth.uid()) and kind = 'word'
  ));
revoke all on public.vocabulary_deck_cards from anon, authenticated;
grant select, delete on public.vocabulary_deck_cards to authenticated;
grant insert(deck_id,notebook_entry_id) on public.vocabulary_deck_cards to authenticated;
