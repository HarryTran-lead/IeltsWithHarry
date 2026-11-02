-- Source-paired audio clips. Each clip is one complete dictation item, never a synthetic lesson.
create table public.dictation_clips (
  id uuid primary key default gen_random_uuid(),
  bank text not null check (bank in ('quick', 'numbers')),
  source_id text not null unique,
  title text not null check (length(title) between 1 and 240),
  source_url text not null check (source_url ~ '^https://'),
  source_dataset text not null,
  license_url text not null check (license_url ~ '^https://'),
  attribution text not null,
  audio_object_key text not null unique check (audio_object_key ~ '^dictation/clips/(quick|numbers)/[0-9a-f]{64}[.](flac|wav)$'),
  audio_sha256 text not null check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  audio_bytes bigint not null check (audio_bytes > 100),
  duration_ms integer not null check (duration_ms between 100 and 30000),
  status text not null default 'preview' check (status in ('preview', 'published', 'blocked')),
  qa_note text not null default '',
  created_at timestamptz not null default now(),
  check (audio_object_key ~ ('/' || audio_sha256 || '[.](flac|wav)$'))
);
create index dictation_clips_bank_catalog on public.dictation_clips(bank, status, source_id);

create table public.dictation_clip_answers (
  clip_id uuid primary key references public.dictation_clips(id) on delete cascade,
  reference_text text not null check (length(reference_text) between 1 and 800)
);

create table public.dictation_clip_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clip_id uuid not null references public.dictation_clips(id) on delete cascade,
  answer text not null check (length(answer) between 1 and 2000),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  created_at timestamptz not null default now()
);
create index dictation_clip_attempts_user on public.dictation_clip_attempts(user_id, clip_id, created_at desc);

alter table public.dictation_clips enable row level security;
alter table public.dictation_clip_answers enable row level security;
alter table public.dictation_clip_attempts enable row level security;
create policy dictation_clips_learner_read on public.dictation_clips for select to authenticated
  using (status in ('preview', 'published') or public.is_admin());
create policy dictation_clips_admin_write on public.dictation_clips for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy dictation_clip_answers_admin on public.dictation_clip_answers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy dictation_clip_attempts_own on public.dictation_clip_attempts for select to authenticated
  using (user_id = auth.uid());
grant select on public.dictation_clips, public.dictation_clip_answers, public.dictation_clip_attempts to authenticated;

create function public.submit_dictation_clip(p_clip_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reference text;
  v_accuracy numeric;
begin
  if auth.uid() is null or length(trim(coalesce(p_answer, ''))) not between 1 and 2000 then
    raise exception 'Sign in and enter an answer';
  end if;
  select a.reference_text into v_reference
    from public.dictation_clip_answers a join public.dictation_clips c on c.id = a.clip_id
    where c.id = p_clip_id and c.status in ('preview', 'published');
  if v_reference is null then raise exception 'Clip unavailable'; end if;
  v_accuracy := public.voa_dictation_accuracy(v_reference, p_answer);
  insert into public.dictation_clip_attempts(user_id, clip_id, answer, accuracy)
    values (auth.uid(), p_clip_id, trim(p_answer), v_accuracy);
  return jsonb_build_object('accuracy', v_accuracy, 'reference_text', v_reference);
end $$;
revoke all on function public.submit_dictation_clip(uuid,text) from public;
grant execute on function public.submit_dictation_clip(uuid,text) to authenticated;

create function public.reveal_dictation_clip(p_clip_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reference text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select a.reference_text into v_reference
    from public.dictation_clip_answers a join public.dictation_clips c on c.id = a.clip_id
    where c.id = p_clip_id and c.status in ('preview', 'published');
  if v_reference is null then raise exception 'Clip unavailable'; end if;
  return v_reference;
end $$;
revoke all on function public.reveal_dictation_clip(uuid) from public;
grant execute on function public.reveal_dictation_clip(uuid) to authenticated;
