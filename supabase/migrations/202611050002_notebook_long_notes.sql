-- Allow document-sized legacy quick notes while retaining a practical storage limit.
alter table public.notebook_entries
  drop constraint if exists notebook_entries_body_check;

alter table public.notebook_entries
  add constraint notebook_entries_body_check check (char_length(body) <= 100000);
