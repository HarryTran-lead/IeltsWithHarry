-- Minimal discovery metadata is admin-only; unreviewed transcript candidates stay in local SQLite.
alter table public.voa_dictation_lessons
  add column source_group text not null default 'VOA Learning English',
  add column source_audio_url text,
  add column third_party_warning boolean not null default false,
  add column source_published_at timestamptz;

-- Third-party warnings require a documented clearance before publishing.
create or replace function public.voa_dictation_publication_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'published' and new.status = 'published'
      and (new.title, new.topic, new.cefr, new.transcript, new.audio_object_key,
        new.audio_sha256, new.audio_bytes, new.rights_verified, new.transcript_verified,
        new.audio_verified, new.timings_verified, new.cefr_reviewed, new.r2_verified,
        new.rights_basis, new.review_notes, new.reviewer_id, new.reviewed_at,
        new.source_group, new.source_audio_url, new.third_party_warning, new.source_published_at)
      is distinct from
      (old.title, old.topic, old.cefr, old.transcript, old.audio_object_key,
        old.audio_sha256, old.audio_bytes, old.rights_verified, old.transcript_verified,
        old.audio_verified, old.timings_verified, old.cefr_reviewed, old.r2_verified,
        old.rights_basis, old.review_notes, old.reviewer_id, old.reviewed_at,
        old.source_group, old.source_audio_url, old.third_party_warning, old.source_published_at)
    then raise exception 'Revoke publication before editing reviewed VOA content'; end if;
  end if;
  if new.status = 'published' then
    if not (new.rights_verified and new.transcript_verified and new.audio_verified
      and new.timings_verified and new.cefr_reviewed and new.r2_verified)
      or new.audio_object_key is null or new.cefr is null or length(new.rights_basis) < 20
      or length(trim(new.transcript)) < 30
      or new.reviewer_id is null or new.reviewed_at is null
      or (new.third_party_warning and position('third-party-cleared' in lower(new.review_notes)) = 0)
      or not exists (select 1 from public.voa_dictation_segments s where s.lesson_id = new.id)
      or exists (select 1 from public.voa_dictation_segments a join public.voa_dictation_segments b
        on a.lesson_id = b.lesson_id and a.ordinal < b.ordinal
        where a.lesson_id = new.id and a.end_ms > b.start_ms)
    then raise exception 'VOA lesson needs reviewed rights, media, transcript, CEFR and timed segments before publication'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
