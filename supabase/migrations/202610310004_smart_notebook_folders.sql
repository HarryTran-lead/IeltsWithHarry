-- Optional owner-defined folder label for organizing notebooks.
alter table public.smart_notebooks add column folder text not null default ''
  check (char_length(folder) <= 60);
grant insert(folder) on public.smart_notebooks to authenticated;
grant update(folder) on public.smart_notebooks to authenticated;
