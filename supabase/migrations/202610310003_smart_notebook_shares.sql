-- A share link grants read-only access to one notebook when its owner enables it.
create table public.smart_notebook_shares (
  notebook_id uuid primary key,
  user_id uuid not null default auth.uid(),
  token uuid not null default gen_random_uuid() unique,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (notebook_id, user_id) references public.smart_notebooks(id, user_id) on delete cascade
);

alter table public.smart_notebook_shares enable row level security;
create policy smart_notebook_shares_owner on public.smart_notebook_shares for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.smart_notebook_shares from anon, authenticated;
grant select on public.smart_notebook_shares to authenticated;
grant insert(notebook_id, enabled) on public.smart_notebook_shares to authenticated;
grant update(enabled) on public.smart_notebook_shares to authenticated;

create function public.smart_notebook_share_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger smart_notebook_share_touch before update on public.smart_notebook_shares
  for each row execute function public.smart_notebook_share_touch();
