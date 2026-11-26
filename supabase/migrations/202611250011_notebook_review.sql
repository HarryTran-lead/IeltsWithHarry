-- Optional IELTS learning metadata for personal notes. Existing notes remain valid.
alter table public.notebook_entries
  add column skill text not null default 'general'
    check (skill in ('general', 'writing', 'speaking', 'reading', 'listening', 'vocabulary', 'grammar')),
  add column review_at date,
  add column review_prompt text not null default '' check (char_length(review_prompt) <= 500),
  add column review_count integer not null default 0 check (review_count >= 0);

create index notebook_entries_due_review_idx
  on public.notebook_entries (user_id, review_at)
  where kind = 'note' and review_at is not null;

grant insert(skill, review_at, review_prompt, review_count) on public.notebook_entries to authenticated;
grant update(skill, review_at, review_prompt, review_count) on public.notebook_entries to authenticated;
