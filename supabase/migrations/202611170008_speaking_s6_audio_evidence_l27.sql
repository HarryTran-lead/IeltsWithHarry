-- M10-L27: optional retained audio fingerprint and immutable client storage.
-- Migration remains STAGING ONLY; never run on production from this workflow.
alter table public.speaking_s6_attempts
  add column audio_evidence_state text not null default 'not_stored'
    check (audio_evidence_state in ('not_stored','stored_hash_recorded')),
  add column audio_evidence_sha256 char(64),
  add column audio_evidence_bytes integer,
  add column audio_evidence_mime text,
  add column audio_evidence_at timestamptz;

alter table public.speaking_s6_attempts
  add constraint speaking_s6_audio_evidence_consistency
  check (
    (
      audio_evidence_state = 'not_stored'
      and audio_evidence_sha256 is null
      and audio_evidence_bytes is null
      and audio_evidence_mime is null
      and audio_evidence_at is null
    ) or (
      audio_evidence_state = 'stored_hash_recorded'
      and phase = 'submitted'
      and audio_storage_consent = true
      and audio_evidence_sha256 is not null
      and audio_evidence_sha256 ~ '^[a-f0-9]{64}$'
      and audio_evidence_bytes is not null
      and audio_evidence_bytes between 256 and 10485760
      and audio_evidence_mime is not null
      and audio_evidence_mime in ('audio/webm','audio/mp4','audio/ogg')
      and audio_evidence_at is not null
    )
  );

-- A learner can insert a consented audio object while the attempt is started,
-- but may not use the Storage client to DELETE or UPDATE an existing object.
-- The authenticated owner-only session DELETE endpoint uses a service role.
drop policy if exists speaking_s6_storage_delete on storage.objects;
create policy speaking_s6_audio_no_client_delete
  on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'speaking-s6-recordings');
create policy speaking_s6_audio_no_client_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'speaking-s6-recordings')
  with check (bucket_id <> 'speaking-s6-recordings');

-- No public release-gate or S7 changes.
