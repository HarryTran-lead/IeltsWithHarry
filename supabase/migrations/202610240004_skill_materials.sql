-- Skill-specific authored material and public lesson assets.
create table public.lesson_materials (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 100000),
  updated_at timestamptz not null default now()
);

alter table public.lesson_materials enable row level security;
create policy materials_public_read on public.lesson_materials for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));
create policy materials_admin_write on public.lesson_materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.lesson_materials to anon, authenticated;
grant insert, update, delete on public.lesson_materials to authenticated;

alter table public.vocabulary_entries
  add column sentence_prompt_vi text not null default '',
  add column accepted_sentences jsonb not null default '[]'::jsonb
    check (jsonb_typeof(accepted_sentences) = 'array' and jsonb_array_length(accepted_sentences) <= 12);
grant update(sentence_prompt_vi, accepted_sentences) on public.vocabulary_entries to authenticated;
grant insert(sentence_prompt_vi, accepted_sentences) on public.vocabulary_entries to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-media', 'lesson-media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/svg+xml','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm'])
on conflict (id) do nothing;

create policy lesson_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'lesson-media');
create policy lesson_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-media' and public.is_admin());
create policy lesson_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'lesson-media' and public.is_admin())
  with check (bucket_id = 'lesson-media' and public.is_admin());
create policy lesson_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-media' and public.is_admin());
