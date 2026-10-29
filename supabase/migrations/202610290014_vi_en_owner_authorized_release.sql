-- Owner-requested bulk publication of the exact VI -> EN archive imported earlier.
-- Keep this provenance separate from individual editorial review.
alter table public.vi_en_translation_exercises
  add column review_origin text not null default 'individual_editor'
    check (review_origin in ('individual_editor','owner_authorized_bulk'));

do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.vi_en_translation_exercises'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%reviewed_by IS NOT NULL%'
  limit 1;
  if v_constraint is null then raise exception 'Existing editorial approval constraint not found'; end if;
  execute format('alter table public.vi_en_translation_exercises drop constraint %I', v_constraint);
end $$;

alter table public.vi_en_translation_exercises
  add constraint vi_en_translation_review_provenance_check
    check (status not in ('approved','published') or
      (length(trim(meaning_vi)) > 0 and reviewed_at is not null and
       (reviewed_by is not null or review_origin = 'owner_authorized_bulk')));

create or replace function public.vi_en_translation_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and old.status not in ('approved','published')
      and new.review_origin <> 'owner_authorized_bulk' then
    raise exception 'Translation exercise must be approved before publishing';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;

create table public.vi_en_translation_bulk_releases (
  archive_sha256 text primary key check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  expected_exercises integer not null,
  filled_meanings integer not null,
  published_exercises integer not null,
  release_origin text not null check (release_origin = 'owner_authorized_bulk'),
  release_note text not null,
  released_at timestamptz not null default now()
);
alter table public.vi_en_translation_bulk_releases enable row level security;
revoke all on public.vi_en_translation_bulk_releases from anon, authenticated;
grant select on public.vi_en_translation_bulk_releases to service_role;

do $$
declare
  v_archive constant text := 'e65755b317a8c3532fbcef82cdfc0df3f985af181b8b028f1c7d8d61ed6bccb6';
  v_count integer;
  v_filled integer;
  v_published integer;
begin
  select count(*) into v_count from public.vi_en_translation_exercises
  where source_archive_sha256 = v_archive;
  if v_count <> 13300 then
    raise exception 'Expected 13,300 exercises from the exact archive, found %', v_count;
  end if;
  if (select count(distinct topic) from public.vi_en_translation_exercises
      where source_archive_sha256 = v_archive) <> 40 then
    raise exception 'Expected 40 source topics';
  end if;
  if exists (select 1 from public.vi_en_translation_exercises
    where source_archive_sha256 <> v_archive or status <> 'draft' or canonical_source_key is null
      or length(trim(prompt_vi)) = 0 or length(trim(reference_en)) = 0) then
    raise exception 'Unexpected source, status, canonical mapping, or missing sentence';
  end if;
  if (select count(*) from public.vi_en_translation_exercises where length(trim(meaning_vi)) = 0) <> 100 then
    raise exception 'Expected exactly 100 exercise rows (50 items) missing meaning';
  end if;

  update public.vi_en_translation_exercises e
  set meaning_vi = c.definition_vi
  from public.ielts_vocabulary_entries c
  where e.source_archive_sha256 = v_archive
    and e.canonical_source_key = c.source_key
    and length(trim(e.meaning_vi)) = 0
    and length(trim(c.definition_vi)) > 0;
  get diagnostics v_filled = row_count;
  if v_filled <> 100 then raise exception 'Filled % meanings; expected 100', v_filled; end if;
  if exists (select 1 from public.vi_en_translation_exercises where length(trim(meaning_vi)) = 0) then
    raise exception 'Some Vietnamese meanings are still blank';
  end if;

  update public.vi_en_translation_exercises
  set status = 'published', review_origin = 'owner_authorized_bulk', reviewed_at = now(), reviewed_by = null
  where source_archive_sha256 = v_archive and status = 'draft';
  get diagnostics v_published = row_count;
  if v_published <> 13300 then raise exception 'Published % exercises; expected 13,300', v_published; end if;

  insert into public.vi_en_translation_bulk_releases
    (archive_sha256,expected_exercises,filled_meanings,published_exercises,release_origin,release_note)
  values (v_archive,13300,v_filled,v_published,'owner_authorized_bulk',
    'Published on explicit owner instruction. Source sentences were structurally checked but not individually edited; retain QA metadata for correction.');
end $$;
