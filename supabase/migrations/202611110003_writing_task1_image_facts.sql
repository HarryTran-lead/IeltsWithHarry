-- Facts transcribed from the published chart image and checked against the
-- upstream dataset description. This is an agent image review, not a teacher
-- or account-admin approval. Keep the provenance explicit.
alter table public.writing_grading_source_facts
  alter column verified_by drop not null,
  add column if not exists verification_method text not null default 'human_chart_review',
  add column if not exists source_ref text,
  add column if not exists source_hash_kind text not null default 'prompt_visual_facts_json';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'writing_source_facts_verification_method_check'
      and conrelid = 'public.writing_grading_source_facts'::regclass
  ) then
    alter table public.writing_grading_source_facts
      add constraint writing_source_facts_verification_method_check
      check (
        (verification_method = 'human_chart_review' and verified_by is not null)
        or
        (verification_method = 'agent_image_review' and verified_by is null
          and source_ref is not null and source_hash_kind = 'asset_sha256')
      );
  end if;
end $$;

insert into public.writing_grading_source_facts
  (exam_version_id, facts, source_hash, verified_by, verification_method, source_ref, source_hash_kind)
select v.id,
  '[
    {"id":"eu-growth","claim":"Europe rose from 15% in 2000 to 25% in 2010 and 45% in 2020."},
    {"id":"sa-trajectory","claim":"South America was 35% in 2000, fell to 30% in 2010, and recovered to 40% in 2020."},
    {"id":"na-trajectory","claim":"North America remained at 10% from 2000 to 2010 and reached 20% in 2020."},
    {"id":"asia-trajectory","claim":"Asia had the lowest share throughout, rising from 5% in 2000 to 15% in 2020."},
    {"id":"eu-sa-2015","claim":"Europe and South America were both at 35% in 2015."}
  ]'::jsonb,
  '1b98e8d321eab39656780408185b1dee56dc44781642090a962e02ef45d34ad6',
  null, 'agent_image_review',
  'https://vpkhriywprepuhrbarye.supabase.co/storage/v1/object/public/ielts-images/78f7ebf2b430114998aae6806cb92c1a4a475594/datasets/practice-drills/writing/ielts-writing-academic-band-8.0-test-001.jpeg',
  'asset_sha256'
from public.ielts_exam_versions v
where v.id = '9d002be3-fb3b-49c3-9783-2cfe461edd96'
  and v.content->>'imageUrl' = 'https://vpkhriywprepuhrbarye.supabase.co/storage/v1/object/public/ielts-images/78f7ebf2b430114998aae6806cb92c1a4a475594/datasets/practice-drills/writing/ielts-writing-academic-band-8.0-test-001.jpeg'
on conflict (exam_version_id) do nothing;
