-- Keep historical entries intact while blocking new duplicate saves, including concurrent requests.
create index notebook_word_lookup_per_user on public.notebook_entries(user_id, lower(trim(title))) where kind = 'word';
create function public.prevent_duplicate_notebook_word() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'word' then
    if tg_op = 'UPDATE' then
      if old.kind = 'word' and lower(trim(old.title)) = lower(trim(new.title)) then
        return new;
      end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text || ':' || lower(trim(new.title)), 0));
    if exists (
      select 1 from public.notebook_entries n
      where n.user_id = new.user_id and n.kind = 'word' and lower(trim(n.title)) = lower(trim(new.title)) and n.id <> new.id
    ) then
      raise unique_violation using message = 'Word is already saved';
    end if;
  end if;
  return new;
end;
$$;
create trigger prevent_duplicate_notebook_word before insert or update of kind, title on public.notebook_entries
for each row execute function public.prevent_duplicate_notebook_word();

alter table public.notebook_entries
  add column phonetic text not null default '' check (char_length(phonetic) <= 100),
  add column part_of_speech text not null default '' check (char_length(part_of_speech) <= 50),
  add column topic text not null default '' check (char_length(topic) <= 100),
  add column definition text not null default '' check (char_length(definition) <= 500),
  add column source_url text not null default '' check (char_length(source_url) <= 500);
grant insert(phonetic, part_of_speech, topic, definition, source_url) on public.notebook_entries to authenticated;

create table public.vocabulary_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notebook_entry_id uuid not null references public.notebook_entries(id) on delete cascade,
  grade text not null check (grade in ('again', 'good', 'easy')),
  reviewed_at timestamptz not null default now()
);
create index vocabulary_review_events_user_date on public.vocabulary_review_events(user_id, reviewed_at desc);
alter table public.vocabulary_review_events enable row level security;
create policy vocabulary_review_events_self on public.vocabulary_review_events for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.notebook_entries n where n.id = notebook_entry_id and n.user_id = (select auth.uid()) and n.kind = 'word'
  ));
revoke all on public.vocabulary_review_events from anon, authenticated;
grant select on public.vocabulary_review_events to authenticated;
grant insert(notebook_entry_id, grade) on public.vocabulary_review_events to authenticated;

create table public.vocabulary_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 80),
  score integer not null check (score >= 0),
  total integer not null check (total between 1 and 10 and score <= total),
  wrong_words text[] not null default '{}',
  submitted_at timestamptz not null default now()
);
create index vocabulary_practice_attempts_user_date on public.vocabulary_practice_attempts(user_id, submitted_at desc);
alter table public.vocabulary_practice_attempts enable row level security;
create policy vocabulary_practice_attempts_self on public.vocabulary_practice_attempts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.vocabulary_practice_attempts from anon, authenticated;
grant select on public.vocabulary_practice_attempts to authenticated;
grant insert(scope, score, total, wrong_words) on public.vocabulary_practice_attempts to authenticated;

-- Protect the shared dictionary provider from unlimited authenticated lookups.
create table public.vocabulary_lookup_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  calls integer not null default 0 check (calls between 0 and 100),
  primary key (user_id, usage_day)
);
alter table public.vocabulary_lookup_usage enable row level security;
revoke all on public.vocabulary_lookup_usage from anon, authenticated;

create function public.vocabulary_claim_lookup_quota() returns boolean
language plpgsql security definer set search_path = '' as $$
declare accepted integer;
begin
  if (select auth.uid()) is null then return false; end if;
  insert into public.vocabulary_lookup_usage(user_id, usage_day, calls)
  values ((select auth.uid()), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_day) do update
    set calls = public.vocabulary_lookup_usage.calls + 1
    where public.vocabulary_lookup_usage.calls < 100
  returning calls into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.vocabulary_claim_lookup_quota() from public;
grant execute on function public.vocabulary_claim_lookup_quota() to authenticated;
