-- Additive notebook workspace. Legacy notebook_entries and study_visits remain intact.
create table public.smart_notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  cover text not null default 'teal' check (cover in ('teal','blue','lavender','coral','sand')),
  favorite boolean not null default false,
  deleted_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index smart_notebooks_owner_recent on public.smart_notebooks(user_id, updated_at desc) where deleted_at is null;

create table public.smart_notebook_pages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null,
  user_id uuid not null default auth.uid(),
  position integer not null default 0 check (position between 0 and 10000),
  paper text not null default 'blank' check (paper in ('blank','ruled','grid')),
  document jsonb not null default '{"schemaVersion":1,"elements":[],"strokes":[]}'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (notebook_id, user_id) references public.smart_notebooks(id, user_id) on delete cascade,
  check (jsonb_typeof(document) = 'object' and document->>'schemaVersion' = '1'
    and jsonb_typeof(document->'elements') = 'array' and jsonb_typeof(document->'strokes') = 'array'
    and octet_length(document::text) <= 1048576)
);
create index smart_pages_order on public.smart_notebook_pages(notebook_id, position, created_at);

create function public.smart_notebook_first_page() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.smart_notebook_pages(notebook_id) values (new.id);
  return new;
end $$;
create trigger smart_notebook_first_page after insert on public.smart_notebooks
  for each row execute function public.smart_notebook_first_page();

create function public.smart_notebook_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.smart_notebooks set updated_at = now() where id = new.notebook_id;
  return new;
end $$;
create trigger smart_notebook_touch after insert or update on public.smart_notebook_pages
  for each row execute function public.smart_notebook_touch();

alter table public.smart_notebooks enable row level security;
alter table public.smart_notebook_pages enable row level security;
create policy smart_notebooks_self on public.smart_notebooks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy smart_pages_self on public.smart_notebook_pages for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.smart_notebooks n where n.id = notebook_id and n.deleted_at is null
  )) with check (user_id = (select auth.uid()) and exists (
    select 1 from public.smart_notebooks n where n.id = notebook_id and n.deleted_at is null
  ));
revoke all on public.smart_notebooks, public.smart_notebook_pages from anon, authenticated;
grant select on public.smart_notebooks, public.smart_notebook_pages to authenticated;
grant insert(title, description, cover) on public.smart_notebooks to authenticated;
grant update(title, description, cover, favorite, deleted_at, opened_at) on public.smart_notebooks to authenticated;
grant insert(notebook_id, position, paper) on public.smart_notebook_pages to authenticated;
grant update(position) on public.smart_notebook_pages to authenticated;
grant delete on public.smart_notebook_pages to authenticated;

-- The only document write path enforces an atomic revision compare and ownership.
create function public.save_smart_notebook_page(
  p_page uuid, p_revision integer, p_document jsonb, p_paper text
) returns public.smart_notebook_pages language plpgsql security definer set search_path = '' as $$
declare saved public.smart_notebook_pages;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_paper not in ('blank','ruled','grid') or p_document->>'schemaVersion' <> '1'
    or jsonb_typeof(p_document->'elements') <> 'array' or jsonb_typeof(p_document->'strokes') <> 'array'
    or octet_length(p_document::text) > 1048576 then
    raise exception 'Invalid notebook page';
  end if;
  update public.smart_notebook_pages p
    set document = p_document, paper = p_paper, revision = revision + 1, updated_at = now()
    where p.id = p_page and p.user_id = auth.uid() and p.revision = p_revision
      and exists (select 1 from public.smart_notebooks n where n.id = p.notebook_id and n.user_id = auth.uid() and n.deleted_at is null)
    returning p.* into saved;
  if saved.id is null then raise exception 'Page changed or unavailable' using errcode = 'P0001'; end if;
  return saved;
end $$;
revoke all on function public.save_smart_notebook_page(uuid,integer,jsonb,text) from public;
grant execute on function public.save_smart_notebook_page(uuid,integer,jsonb,text) to authenticated;

-- Private image bucket. Paths are user-id/notebook-id/random-id.ext.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('smart-notebook-images','smart-notebook-images',false,3145728,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];
create policy smart_notebook_images_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'smart-notebook-images' and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.smart_notebooks n where n.id::text = (storage.foldername(name))[2]
    and n.user_id = (select auth.uid()) and n.deleted_at is null)
);
create policy smart_notebook_images_select on storage.objects for select to authenticated using (
  bucket_id = 'smart-notebook-images' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy smart_notebook_images_delete on storage.objects for delete to authenticated using (
  bucket_id = 'smart-notebook-images' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
