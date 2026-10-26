-- Learners can use a sticker or upload a personal profile image.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (
  avatar in ('harry','star','rocket','book','globe','headphones','mic','coffee','bulb','mountain')
  or (avatar ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
      and split_part(avatar, '/', 1) = id::text)
);

-- Each learner writes only inside their own folder. A locked account cannot upload.
create policy user_avatars_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (
    select 1 from public.account_controls c
    where c.user_id = (select auth.uid()) and c.suspended_until > now()
  )
);
create policy user_avatars_select on storage.objects for select to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy user_avatars_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
