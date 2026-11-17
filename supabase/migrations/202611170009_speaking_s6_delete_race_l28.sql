-- M10-L28: recoverable deletion marker prevents submitting an attempt
-- concurrently with owner-requested audio removal. Disposable staging ONLY.
alter table public.speaking_s6_attempts
  add column deletion_requested_at timestamptz;

create index speaking_s6_pending_deletion_l28
  on public.speaking_s6_attempts (deletion_requested_at)
  where deletion_requested_at is not null;

-- The existing Storage INSERT policy from L14 must reject any new file
-- once a deletion is requested, even if phase remains 'started'.
drop policy if exists speaking_s6_storage_insert on storage.objects;
create policy speaking_s6_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'speaking-s6-recordings'
    and array_length(storage.foldername(name),1)=1
    and (storage.foldername(name))[1]=(select auth.uid()::text)
    and storage.filename(name) ~ '^[0-9a-f-]{36}\.(webm|mp4|ogg)$'
    and exists (
      select 1 from public.speaking_s6_attempts a
      where a.id::text=split_part(storage.filename(name),'.',1)
        and a.user_id=(select auth.uid())
        and a.audio_storage_consent=true
        and a.phase='started'
        and a.deletion_requested_at is null
        and a.created_at>now()-interval '1 day'
    )
  );

-- No new client privileges; the owner-authenticated Next.js API uses
-- service_role for the mark-delete-storage-delete sequence.
-- The SQL update predicate on submit also requires deletion_requested_at IS NULL.
-- Release gates, private answers and S7 stay unchanged.
