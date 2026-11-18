-- Expand the existing VI→EN exercise bank without changing learner-owned IDs.
alter table public.vi_en_translation_exercises
  add column milestone text check (milestone ~ '^M[0-9]{3}$'),
  add column difficulty text not null default 'easy' check (difficulty in ('easy','hard')),
  add column source_exercise_id text;

alter table public.vi_en_translation_exercises
  drop constraint vi_en_translation_exercises_source_item_id_mode_key;
alter table public.vi_en_translation_exercises
  add constraint vi_en_translation_item_mode_difficulty_key unique (source_item_id, mode, difficulty),
  add constraint vi_en_translation_source_exercise_key unique (source_exercise_id);
create index vi_en_translation_milestone_idx
  on public.vi_en_translation_exercises (topic, milestone, difficulty, mode, id)
  where status = 'published';

-- Private staging keeps the exact package IDs and QA provenance for an atomic release.
create table public.vi_en_translation_import_rows (
  source_exercise_id text primary key,
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  source_item_id text not null,
  milestone text not null check (milestone ~ '^M[0-9]{3}$'),
  topic text not null,
  term text not null,
  mode text not null check (mode in ('speaking','writing')),
  difficulty text not null check (difficulty in ('easy','hard')),
  prompt_vi text not null check (length(trim(prompt_vi)) > 0),
  reference_en text not null check (length(trim(reference_en)) > 0),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_archive_sha256, source_item_id, mode, difficulty)
);
create index vi_en_translation_import_archive_idx
  on public.vi_en_translation_import_rows (source_archive_sha256, milestone);
alter table public.vi_en_translation_import_rows enable row level security;
grant select, insert, update on public.vi_en_translation_import_rows to service_role;

create function public.release_vi_en_translation_26600(p_archive text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old constant text := 'e65755b317a8c3532fbcef82cdfc0df3f985af181b8b028f1c7d8d61ed6bccb6';
  v_new constant text := '39236784c010a73629ba466a05af4f366fd5fe96a32f00a73f3abc91ac97f151';
  v_updated integer;
  v_inserted integer;
begin
  if p_archive <> v_new then raise exception 'Unexpected translation archive'; end if;
  perform pg_catalog.pg_advisory_xact_lock(26600, 145);
  if exists (select 1 from public.vi_en_translation_bulk_releases where archive_sha256 = p_archive) then
    if (select count(*) from public.vi_en_translation_exercises where source_archive_sha256 = p_archive and status = 'published') <> 26600 then
      raise exception 'Recorded translation release is incomplete';
    end if;
    return pg_catalog.jsonb_build_object('already_released', true, 'published', 26600);
  end if;
  if (select count(*) from public.vi_en_translation_import_rows where source_archive_sha256 = p_archive) <> 26600
    or (select count(distinct source_item_id) from public.vi_en_translation_import_rows where source_archive_sha256 = p_archive) <> 6650
    or (select count(distinct milestone) from public.vi_en_translation_import_rows where source_archive_sha256 = p_archive) <> 145
    or (select count(distinct topic) from public.vi_en_translation_import_rows where source_archive_sha256 = p_archive) <> 40 then
    raise exception 'Translation staging coverage is incomplete';
  end if;
  if exists (select 1 from public.vi_en_translation_import_rows
    where source_archive_sha256 = p_archive
    group by source_item_id having count(*) <> 4) then
    raise exception 'Translation staging has incomplete four-slot items';
  end if;
  if (select count(*) from public.vi_en_translation_exercises) <> 13300
    or exists (select 1 from public.vi_en_translation_exercises
      where status <> 'published' or review_origin <> 'owner_authorized_bulk'
        or source_archive_sha256 <> v_old or canonical_source_key is null
        or length(trim(meaning_vi)) = 0 or source_exercise_id is not null) then
    raise exception 'Existing translation bank changed; re-audit before release';
  end if;
  if exists (select 1 from public.vi_en_translation_exercises e
    left join public.vi_en_translation_import_rows s
      on s.source_archive_sha256 = p_archive and s.source_item_id = e.source_item_id
        and s.mode = e.mode and s.difficulty = 'easy'
    where s.source_exercise_id is null or s.topic <> e.topic or s.term <> e.term) then
    raise exception 'Existing item ID, topic, or term mapping differs from source';
  end if;
  if exists (select 1 from public.vi_en_translation_import_rows s
    join public.vi_en_translation_exercises e on e.id = s.source_exercise_id
    where s.source_archive_sha256 = p_archive and s.difficulty = 'hard') then
    raise exception 'New hard exercise ID conflicts with an existing ID';
  end if;

  update public.vi_en_translation_exercises e
  set milestone = s.milestone,
      difficulty = 'easy',
      source_exercise_id = s.source_exercise_id,
      prompt_vi = s.prompt_vi,
      reference_en = s.reference_en,
      source_hash = s.source_hash,
      source_archive_sha256 = p_archive,
      metadata = e.metadata || s.metadata
  from public.vi_en_translation_import_rows s
  where s.source_archive_sha256 = p_archive and s.source_item_id = e.source_item_id
    and s.mode = e.mode and s.difficulty = 'easy';
  get diagnostics v_updated = row_count;
  if v_updated <> 13300 then raise exception 'Updated % easy exercises; expected 13,300', v_updated; end if;

  insert into public.vi_en_translation_exercises
    (id,source_item_id,exercise_set_id,mode,topic,term,canonical_source_key,
     meaning_vi,pos,pattern,collocations,prompt_vi,reference_en,source_ref,source_hash,
     source_archive_sha256,metadata,status,review_origin,reviewed_at,milestone,difficulty,source_exercise_id)
  select s.source_exercise_id,e.source_item_id,e.exercise_set_id,e.mode,e.topic,e.term,e.canonical_source_key,
    e.meaning_vi,e.pos,e.pattern,e.collocations,s.prompt_vi,s.reference_en,e.source_ref,s.source_hash,
    p_archive,e.metadata || s.metadata,'published','owner_authorized_bulk',pg_catalog.now(),
    s.milestone,'hard',s.source_exercise_id
  from public.vi_en_translation_import_rows s
  join public.vi_en_translation_exercises e on e.source_item_id = s.source_item_id
    and e.mode = s.mode and e.difficulty = 'easy'
  where s.source_archive_sha256 = p_archive and s.difficulty = 'hard';
  get diagnostics v_inserted = row_count;
  if v_inserted <> 13300 then raise exception 'Inserted % hard exercises; expected 13,300', v_inserted; end if;
  if (select count(*) from public.vi_en_translation_exercises where source_archive_sha256 = p_archive and status = 'published') <> 26600 then
    raise exception 'Final translation coverage is incomplete';
  end if;
  insert into public.vi_en_translation_bulk_releases
    (archive_sha256,expected_exercises,filled_meanings,published_exercises,release_origin,release_note)
  values (p_archive,26600,0,26600,'owner_authorized_bulk',
    'Owner-requested replacement and expansion to 145 milestones. Source is structurally validated; independent editorial review remains pending. Existing easy exercise IDs and learner progress are preserved.');
  return pg_catalog.jsonb_build_object('updated_easy', v_updated, 'inserted_hard', v_inserted, 'published', 26600);
end $$;
revoke all on function public.release_vi_en_translation_26600(text) from public, anon, authenticated;
grant execute on function public.release_vi_en_translation_26600(text) to service_role;
