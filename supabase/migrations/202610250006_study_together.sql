-- One shared study room. Message authorship is tied to auth.uid(), and the
-- public display name comes from the learner profile rather than the client.
create table public.study_room_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index study_room_messages_recent_idx on public.study_room_messages(created_at desc, id desc);
create index study_room_messages_user_recent_idx on public.study_room_messages(user_id, created_at desc);

create function public.study_room_prepare_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Sign in to send a message';
  end if;
  new.body := btrim(new.body);
  if char_length(new.body) < 1 or char_length(new.body) > 500 then
    raise exception 'Message must be between 1 and 500 characters';
  end if;
  if exists (select 1 from public.study_room_messages
    where user_id = auth.uid() and created_at > now() - interval '2 seconds') then
    raise exception 'Please wait before sending another message';
  end if;
  select left(coalesce(nullif(btrim(display_name), ''), 'Learner'), 60)
    into new.display_name from public.profiles where id = auth.uid();
  new.display_name := coalesce(new.display_name, 'Learner');
  return new;
end;
$$;
create trigger study_room_prepare before insert on public.study_room_messages
for each row execute function public.study_room_prepare_message();

alter table public.study_room_messages enable row level security;
create policy study_room_read on public.study_room_messages for select to authenticated using (true);
create policy study_room_send on public.study_room_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy study_room_delete on public.study_room_messages for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.study_room_messages from anon, authenticated;
grant select, delete on public.study_room_messages to authenticated;
grant insert(body) on public.study_room_messages to authenticated;

alter table public.study_room_messages replica identity full;
alter publication supabase_realtime add table public.study_room_messages;

-- Presence is private to signed-in learners in the same shared room.
create policy study_together_presence_read on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'study-together' and extension = 'presence');
create policy study_together_presence_write on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'study-together' and extension = 'presence');
