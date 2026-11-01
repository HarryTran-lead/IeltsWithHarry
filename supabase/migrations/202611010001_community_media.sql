-- Public community attachments live in Storage; posts keep only object paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media', 'community-media', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set public = true, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

create policy community_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not public.account_suspended((select auth.uid()))
);
create policy community_media_select on storage.objects for select to authenticated
using (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy community_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.uid()::text));

alter table public.community_posts
  add column media jsonb not null default '[]'::jsonb
  constraint community_posts_media_shape check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4);

create function public.community_validate_post_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  media_path text;
  media_type text;
  video_count integer := 0;
begin
  for item in select value from jsonb_array_elements(new.media) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'Tệp đính kèm không hợp lệ'; end if;
    media_path := item->>'path';
    media_type := item->>'type';
    if media_path is null or media_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.](jpg|png|webp|mp4|webm|mov)$')
       or media_type is null or media_type not in ('image', 'video')
       or (media_type = 'image' and media_path !~ '[.](jpg|png|webp)$')
       or (media_type = 'video' and media_path !~ '[.](mp4|webm|mov)$') then
      raise exception 'Tệp đính kèm không hợp lệ';
    end if;
    if media_type = 'video' then video_count := video_count + 1; end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'community-media' and o.name = media_path
        and (case when media_type = 'image' then o.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
                  and (o.metadata->>'size')::bigint between 1 and 5242880
                  else o.metadata->>'mimetype' in ('video/mp4', 'video/webm', 'video/quicktime')
                  and (o.metadata->>'size')::bigint between 1 and 20971520 end)
    ) then raise exception 'Tệp đính kèm chưa được tải lên hoặc vượt quá dung lượng cho phép'; end if;
  end loop;
  if video_count > 1 then raise exception 'Mỗi bài đăng chỉ được kèm một video'; end if;
  return new;
end; $$;

create trigger community_post_media_validate before insert on public.community_posts
for each row execute function public.community_validate_post_media();
