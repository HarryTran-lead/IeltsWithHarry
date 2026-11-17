-- M10-L14: isolated, unpublished IELTS Speaking S6 curriculum. Staging code only.
-- Do not store private answer banks in package_lesson_content.
create table public.speaking_s6_release_gates (
  stage text primary key check (stage = 'S6'),
  s5_qa_verified boolean not null default false,
  teacher_qa_verified boolean not null default false,
  audio_qa_verified boolean not null default false,
  privacy_qa_verified boolean not null default false,
  import_qa_verified boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.speaking_s6_release_gates(stage) values ('S6');
alter table public.speaking_s6_release_gates enable row level security;
revoke all on public.speaking_s6_release_gates from anon, authenticated;

create or replace function public.speaking_s6_release_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select g.s5_qa_verified and g.teacher_qa_verified and g.audio_qa_verified
    and g.privacy_qa_verified and g.import_qa_verified
    from public.speaking_s6_release_gates g where g.stage = 'S6'), false);
$$;
revoke all on function public.speaking_s6_release_ready() from public, anon, authenticated;
grant execute on function public.speaking_s6_release_ready() to authenticated;

create table public.speaking_s6_lesson_revisions (
  lesson_code text not null check (lesson_code ~ '^S6-(00[1-9]|0[1-3][0-9]|04[0-4])$'),
  revision text not null check (length(revision) between 3 and 100),
  status text not null default 'staging' check (status in ('staging','published','archived')),
  content_hash char(64) not null check (content_hash ~ '^[a-f0-9]{64}$'),
  student_content jsonb not null check (jsonb_typeof(student_content) = 'object' and pg_column_size(student_content) <= 100000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(lesson_code,revision),
  constraint speaking_s6_content_id check (student_content->>'lesson_id' = lesson_code)
);
alter table public.speaking_s6_lesson_revisions enable row level security;
create policy speaking_s6_published_read on public.speaking_s6_lesson_revisions
  for select to authenticated using (status = 'published' and public.speaking_s6_release_ready());
revoke all on public.speaking_s6_lesson_revisions from anon, authenticated;
grant select on public.speaking_s6_lesson_revisions to authenticated;

create table public.speaking_s6_private_revisions (
  lesson_code text not null,
  revision text not null,
  bank jsonb not null check (jsonb_typeof(bank) = 'object' and pg_column_size(bank) <= 250000),
  bank_hash char(64) not null check (bank_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(lesson_code,revision),
  foreign key(lesson_code,revision) references public.speaking_s6_lesson_revisions(lesson_code,revision)
);
alter table public.speaking_s6_private_revisions enable row level security;
revoke all on public.speaking_s6_private_revisions from anon, authenticated;

create or replace function public.speaking_s6_publish_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and not public.speaking_s6_release_ready() then
    raise exception 'S6_RELEASE_GATES_NOT_CLEARED';
  end if;
  return new;
end $$;
create trigger speaking_s6_release_guard
  before insert or update on public.speaking_s6_lesson_revisions
  for each row execute function public.speaking_s6_publish_guard();

create table public.speaking_s6_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  lesson_code text not null,
  revision text not null,
  activity_id text not null check (activity_id ~ '^S6-[0-9]{3}-[GIM][0-9]{2}$'),
  mode text not null check (mode in ('guided','independent','mastery')),
  phase text not null default 'started' check (phase in ('started','submitted')),
  initial_response text check (length(initial_response) <= 5000),
  duration_seconds integer check (duration_seconds between 0 and 180),
  audio_storage_consent boolean not null default false,
  initial_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(lesson_code,revision) references public.speaking_s6_lesson_revisions(lesson_code,revision)
);
create index speaking_s6_attempts_user_created on public.speaking_s6_attempts(user_id,created_at desc);
alter table public.speaking_s6_attempts enable row level security;
create policy speaking_s6_attempt_read on public.speaking_s6_attempts
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.speaking_s6_attempts from anon, authenticated;
grant select on public.speaking_s6_attempts to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('speaking-s6-recordings','speaking-s6-recordings',false,10485760,
  array['audio/webm','audio/mp4','audio/ogg'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['audio/webm','audio/mp4','audio/ogg'];

create policy speaking_s6_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'speaking-s6-recordings'
  and array_length(storage.foldername(name),1)=1
  and (storage.foldername(name))[1]=(select auth.uid()::text)
  and storage.filename(name) ~ '^[0-9a-f-]{36}\.(webm|mp4|ogg)$'
  and exists (select 1 from public.speaking_s6_attempts a
    where a.id::text=split_part(storage.filename(name),'.',1)
      and a.user_id=(select auth.uid())
      and a.audio_storage_consent=true
      and a.phase='started'
      and a.created_at>now()-interval '1 day')
);
create policy speaking_s6_storage_read on storage.objects for select to authenticated
  using (bucket_id='speaking-s6-recordings'
    and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy speaking_s6_storage_delete on storage.objects for delete to authenticated
  using (bucket_id='speaking-s6-recordings'
    and (storage.foldername(name))[1]=(select auth.uid()::text));

create or replace function public.speaking_s6_import_revision(
  p_lesson_code text,p_revision text,p_hash text,p_student_content jsonb,
  p_private_bank jsonb,p_private_hash text,p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_private_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'S6_HASH_FORMAT_INVALID';
  end if;
  if p_student_content->>'lesson_id' is distinct from p_lesson_code then
    raise exception 'S6_LESSON_ID_MISMATCH';
  end if;
  insert into public.speaking_s6_lesson_revisions
    (lesson_code,revision,status,content_hash,student_content,created_by)
  values (p_lesson_code,p_revision,'staging',p_hash,p_student_content,p_actor);
  insert into public.speaking_s6_private_revisions(lesson_code,revision,bank,bank_hash)
  values (p_lesson_code,p_revision,p_private_bank,p_private_hash);
end $$;
revoke all on function public.speaking_s6_import_revision(text,text,text,jsonb,jsonb,text,uuid)
  from public,anon,authenticated;
grant execute on function public.speaking_s6_import_revision(text,text,text,jsonb,jsonb,text,uuid)
  to service_role;
-- No publication or stage unlock is performed by this migration.
