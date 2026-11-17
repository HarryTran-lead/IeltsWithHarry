-- M10-L27: private audio integrity evidence for *optional consented* recordings.
-- Disposable Supabase staging only. Do NOT run against production.
alter table public.speaking_s6_attempts
  add column audio_evidence_state text not null default 'not_stored'
    check (audio_evidence_state in ('not_stored','stored_hash_recorded')),
  add column audio_evidence_sha256 char(64),
  add column audio_evidence_bytes integer,
  add column audio_evidence_mime text,
  add column audio_evidence_at timestamptz;

alter table public.speaking_s6_attempts add constraint speaking_s6_audio_evidence_consistency
check (
  (
    audio_evidence_state = 'not_stored' and
    audio_evidence_sha256 is null and audio_evidence_bytes is null and
    audio_evidence_mime is null and audio_evidence_at is null
  ) or (
    audio_evidence_state = 'stored_hash_recorded' and
    audio_storage_consent = true and
    audio_evidence_sha256 is not null and
    audio_evidence_sha256 ~ '^[a-f0-9]{64}
  )
);

-- A learner can insert one new audio object while an attempt is started
-- and consented, but cannot delete/replace one directly. All deletions go
-- through the authenticated owner-scoped session DELETE route (service-role).
-- Restrictive policies defend even if unrelated permissive policies exist.
drop policy if exists speaking_s6_storage_delete on storage.objects;
create policy speaking_s6_audio_no_client_delete
  on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'speaking-s6-recordings');
create policy speaking_s6_audio_no_client_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'speaking-s6-recordings')
  with check (bucket_id <> 'speaking-s6-recordings');

-- No student-facing release gates or S7 permission are changed.
 and
    audio_evidence_bytes is not null and
    audio_evidence_bytes between 256 and 10485760 and
    audio_evidence_mime is not null and
    audio_evidence_mime in ('audio/webm','audio/mp4','audio/ogg') and
    audio_evidence_at is not null
  )
);

-- A learner can insert one new audio object while an attempt is started
-- and consented, but cannot delete/replace one directly. All deletions go
-- through the authenticated owner-scoped session DELETE route (service-role).
-- Restrictive policies defend even if unrelated permissive policies exist.
drop policy if exists speaking_s6_storage_delete on storage.objects;
create policy speaking_s6_audio_no_client_delete
  on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'speaking-s6-recordings');
create policy speaking_s6_audio_no_client_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'speaking-s6-recordings')
  with check (bucket_id <> 'speaking-s6-recordings');

-- No student-facing release gates or S7 permission are changed.
