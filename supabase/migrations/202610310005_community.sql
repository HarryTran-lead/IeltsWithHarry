-- Community launch: public study discussions, questions, reviews and moderation.
-- Additive migration. Author names are copied from profiles by a trusted trigger;
-- the private learner profile table remains private.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  kind text not null check (kind in ('discussion','question','writing_review','speaking_review')),
  topic text not null default 'IELTS' check (topic in ('IELTS','Grammar','Vocabulary','Writing','Speaking','Reading','Listening')),
  title text not null check (char_length(title) between 8 and 160),
  body text not null check (char_length(body) between 20 and 12000),
  status text not null default 'published' check (status in ('published','hidden','deleted')),
  accepted_comment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_feed on public.community_posts (created_at desc, id desc) where status = 'published';
create index community_posts_author on public.community_posts (author_id, created_at desc);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  parent_id uuid references public.community_comments(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(body) between 2 and 3000),
  status text not null default 'published' check (status in ('published','hidden','deleted')),
  created_at timestamptz not null default now()
);
alter table public.community_posts add constraint community_accepted_comment_fk
  foreign key (accepted_comment_id) references public.community_comments(id) on delete set null;
create index community_comments_post on public.community_comments (post_id, created_at);

create table public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.community_bookmarks (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index community_bookmarks_user on public.community_bookmarks (user_id, created_at desc);
create table public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reason text not null check (reason in ('spam','abuse','privacy','other')),
  detail text not null default '' check (char_length(detail) <= 500),
  status text not null default 'open' check (status in ('open','resolved')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id)
);
create index community_reports_open on public.community_reports (created_at desc) where status = 'open';
create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  kind text not null check (kind in ('comment','answer')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index community_notifications_user on public.community_notifications (user_id, created_at desc);
create table public.community_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  old_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);
create index community_moderation_audit_post on public.community_moderation_audit (post_id, created_at desc);

create function public.community_stamp_author() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) then raise exception 'Không thể đăng nội dung với tài khoản này'; end if;
  if exists (select 1 from public.account_controls where user_id = auth.uid() and chat_muted_until > now()) then
    raise exception 'Tài khoản đang bị tạm hạn chế đăng bài';
  end if;
  select coalesce(nullif(btrim(display_name), ''), 'Học viên') into v_name from public.profiles where id = auth.uid();
  new.author_id := auth.uid();
  new.author_name := left(coalesce(v_name, 'Học viên'), 80);
  if tg_table_name = 'community_posts' then
    if (select count(*) from public.community_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Bạn đã đăng quá nhiều bài. Vui lòng thử lại sau.';
    end if;
  else
    if (select count(*) from public.community_comments where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 5 then
      raise exception 'Bạn đang bình luận quá nhanh. Vui lòng thử lại sau.';
    end if;
    if new.parent_id is not null and not exists (select 1 from public.community_comments where id = new.parent_id and post_id = new.post_id and parent_id is null and status = 'published') then
      raise exception 'Câu trả lời không hợp lệ';
    end if;
  end if;
  return new;
end; $$;
create trigger community_post_stamp before insert on public.community_posts for each row execute function public.community_stamp_author();
create trigger community_comment_stamp before insert on public.community_comments for each row execute function public.community_stamp_author();

create function public.community_validate_resolution() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    if new.author_id <> auth.uid() or new.status <> 'deleted' or old.status <> 'published' then
      raise exception 'Không có quyền thay đổi trạng thái bài viết';
    end if;
  end if;
  if new.accepted_comment_id is distinct from old.accepted_comment_id then
    if new.kind <> 'question' or (new.author_id <> auth.uid() and not (pg_trigger_depth() > 1 and new.accepted_comment_id is null)) then raise exception 'Chỉ tác giả câu hỏi mới chọn câu trả lời'; end if;
    if new.accepted_comment_id is not null and not exists (select 1 from public.community_comments where id = new.accepted_comment_id and post_id = new.id and status = 'published') then
      raise exception 'Câu trả lời không thuộc bài này';
    end if;
  end if;
  if new.author_id <> old.author_id or new.author_name <> old.author_name or new.kind <> old.kind or new.topic <> old.topic or new.title <> old.title or new.body <> old.body then
    raise exception 'Không thể sửa nội dung bài theo cách này';
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger community_post_resolution before update on public.community_posts for each row execute function public.community_validate_resolution();

create function public.community_post_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.community_moderation_audit(actor_id,post_id,old_status,new_status) values(auth.uid(),new.id,old.status,new.status);
  end if;
  return new;
end; $$;
create trigger community_audit_post after update on public.community_posts for each row execute function public.community_post_audit();

create function public.community_validate_comment_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id <> old.id or new.post_id <> old.post_id or new.parent_id is distinct from old.parent_id or new.author_id <> old.author_id or new.author_name <> old.author_name or new.body <> old.body then
    raise exception 'Không thể sửa bình luận theo cách này';
  end if;
  if new.status is distinct from old.status and not public.is_admin() then
    if new.author_id <> auth.uid() or new.status <> 'deleted' or old.status <> 'published' then
      raise exception 'Không có quyền thay đổi trạng thái bình luận';
    end if;
  end if;
  return new;
end; $$;
create trigger community_comment_status before update on public.community_comments for each row execute function public.community_validate_comment_update();

create function public.community_clear_deleted_answer() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'published' and new.status <> 'published' then
    update public.community_posts set accepted_comment_id = null where accepted_comment_id = new.id;
  end if;
  return new;
end; $$;
create trigger community_clear_answer after update on public.community_comments for each row execute function public.community_clear_deleted_answer();

create function public.community_comment_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.community_posts where id = new.post_id;
  if v_author <> new.author_id then
    insert into public.community_notifications(user_id,actor_name,post_id,kind) values(v_author,new.author_name,new.post_id,'comment');
  end if;
  return new;
end; $$;
create trigger community_notify_comment after insert on public.community_comments for each row execute function public.community_comment_notification();

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_bookmarks enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_notifications enable row level security;
alter table public.community_moderation_audit enable row level security;

create policy community_posts_read on public.community_posts for select to authenticated using (
  (status = 'published' and not exists (select 1 from public.community_blocks b where b.blocker_id = auth.uid() and b.blocked_id = author_id))
  or author_id = auth.uid() or public.is_admin());
create policy community_posts_insert on public.community_posts for insert to authenticated with check (author_id = auth.uid() and status = 'published');
create policy community_posts_update on public.community_posts for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy community_comments_read on public.community_comments for select to authenticated using (
  (status = 'published' and exists (select 1 from public.community_posts where id = post_id)) or author_id = auth.uid() or public.is_admin());
create policy community_comments_insert on public.community_comments for insert to authenticated with check (author_id = auth.uid() and status = 'published' and exists (select 1 from public.community_posts where id = post_id and status = 'published'));
create policy community_comments_update on public.community_comments for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy community_reactions_read on public.community_reactions for select to authenticated using (exists (select 1 from public.community_posts where id = post_id));
create policy community_reactions_self on public.community_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.community_posts where id = post_id and status = 'published'));
create policy community_reactions_delete on public.community_reactions for delete to authenticated using (user_id = auth.uid());
create policy community_bookmarks_self on public.community_bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy community_blocks_self on public.community_blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy community_reports_insert on public.community_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy community_reports_admin on public.community_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy community_reports_admin_update on public.community_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy community_notifications_self on public.community_notifications for select to authenticated using (user_id = auth.uid());
create policy community_notifications_update on public.community_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy community_moderation_audit_admin on public.community_moderation_audit for select to authenticated using (public.is_admin());

revoke all on public.community_posts, public.community_comments, public.community_reactions, public.community_bookmarks, public.community_blocks, public.community_reports, public.community_notifications from anon, authenticated;
grant select, insert on public.community_posts, public.community_comments to authenticated;
grant update(status, accepted_comment_id, updated_at) on public.community_posts to authenticated;
grant update(status) on public.community_comments to authenticated;
grant select, insert, delete on public.community_reactions, public.community_bookmarks, public.community_blocks to authenticated;
grant select, insert on public.community_reports to authenticated;
grant update(status, reviewed_by) on public.community_reports to authenticated;
grant select on public.community_notifications to authenticated;
grant update(read_at) on public.community_notifications to authenticated;
revoke all on public.community_moderation_audit from anon, authenticated;
grant select on public.community_moderation_audit to authenticated;
