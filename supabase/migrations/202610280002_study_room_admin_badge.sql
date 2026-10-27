-- Stamp admin status on each message server-side so clients cannot impersonate staff.
alter table public.study_room_messages add column is_admin boolean not null default false;
update public.study_room_messages m set is_admin = true
where exists (select 1 from public.admin_users a where a.user_id = m.user_id);

create function public.study_room_stamp_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.is_admin := public.is_admin();
  return new;
end;
$$;
create trigger study_room_stamp_admin before insert on public.study_room_messages
for each row execute function public.study_room_stamp_admin();
