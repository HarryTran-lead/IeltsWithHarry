-- Record a learner's decision to reveal an answer as a skipped attempt.
alter table public.dictation_clip_attempts
  add column is_skipped boolean not null default false;

alter table public.dictation_clip_attempts
  drop constraint dictation_clip_attempts_answer_check;

alter table public.dictation_clip_attempts
  add constraint dictation_clip_attempts_answer_check
  check ((is_skipped and answer = '' and accuracy = 0)
      or (not is_skipped and length(answer) between 1 and 2000));

create function public.skip_dictation_clip(p_clip_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reference text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select a.reference_text into v_reference
    from public.dictation_clip_answers a
    join public.dictation_clips c on c.id = a.clip_id
    where c.id = p_clip_id and c.status in ('preview', 'published');
  if v_reference is null then raise exception 'Clip unavailable'; end if;
  insert into public.dictation_clip_attempts(user_id, clip_id, answer, accuracy, is_skipped)
    values (auth.uid(), p_clip_id, '', 0, true);
  return v_reference;
end $$;

revoke all on function public.skip_dictation_clip(uuid) from public;
grant execute on function public.skip_dictation_clip(uuid) to authenticated;
