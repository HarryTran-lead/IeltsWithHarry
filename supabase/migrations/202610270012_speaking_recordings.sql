-- Private, optional mock audio. Recordings belong to an existing user-owned session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaking-recordings', 'speaking-recordings', false, 10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/ogg'];

create table public.speaking_mock_recordings (
  session_id uuid not null references public.speaking_mock_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  answer_index integer not null check (answer_index between 0 and 49),
  storage_path text not null unique,
  primary key (session_id, answer_index),
  constraint speaking_recording_path_check check (
    storage_path = user_id::text || '/' || session_id::text || '/' || answer_index::text || '.webm'
    or storage_path = user_id::text || '/' || session_id::text || '/' || answer_index::text || '.mp4'
    or storage_path = user_id::text || '/' || session_id::text || '/' || answer_index::text || '.ogg'
  )
);
create index speaking_mock_recordings_user_session on public.speaking_mock_recordings(user_id, session_id);
alter table public.speaking_mock_recordings enable row level security;
create policy speaking_mock_recordings_self on public.speaking_mock_recordings for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.speaking_mock_sessions s where s.id = session_id and s.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.speaking_mock_sessions s where s.id = session_id and s.user_id = (select auth.uid())
  ));
revoke all on public.speaking_mock_recordings from anon, authenticated;
grant select, delete on public.speaking_mock_recordings to authenticated;
grant insert(session_id, answer_index, storage_path) on public.speaking_mock_recordings to authenticated;

create policy speaking_recordings_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'speaking-recordings'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1 from public.speaking_mock_sessions s
    where s.id::text = (storage.foldername(name))[2] and s.user_id = (select auth.uid())
  )
);
create policy speaking_recordings_select on storage.objects for select to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy speaking_recordings_update on storage.objects for update to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (
  bucket_id = 'speaking-recordings'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1 from public.speaking_mock_sessions s
    where s.id::text = (storage.foldername(name))[2] and s.user_id = (select auth.uid())
  )
);
create policy speaking_recordings_delete on storage.objects for delete to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid()::text));
