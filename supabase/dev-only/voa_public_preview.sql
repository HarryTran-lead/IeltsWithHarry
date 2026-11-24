-- Apply ONLY to development project bhactqaxcvusmpeooxwi.
-- Uploaded lessons with verified R2 objects are visible to signed-in dev learners,
-- while all human review evidence remains false until actually checked.
alter policy voa_lessons_read on public.voa_dictation_lessons
  using (status = 'published' or (status = 'uploaded' and r2_verified and audio_object_key is not null) or public.is_admin());

alter policy voa_segments_read on public.voa_dictation_segments
  using (exists (
    select 1 from public.voa_dictation_lessons l
    where l.id = lesson_id and (l.status = 'published'
      or (l.status = 'uploaded' and l.r2_verified and l.audio_object_key is not null)
      or public.is_admin())
  ));

create or replace function public.submit_voa_dictation(p_segment_id uuid, p_answer text, p_mode text default 'type') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_reference text;
begin
  if auth.uid() is null or length(trim(coalesce(p_answer, ''))) not between 1 and 2000
    or p_mode not in ('type','gap') then
    raise exception 'Sign in and enter a valid dictation answer';
  end if;
  select s.reference_text into v_reference
    from public.voa_dictation_segments s join public.voa_dictation_lessons l on l.id = s.lesson_id
    where s.id = p_segment_id and (l.status = 'published'
      or (l.status = 'uploaded' and l.r2_verified and l.audio_object_key is not null));
  if v_reference is null then raise exception 'Lesson unavailable'; end if;
  insert into public.voa_dictation_attempts(user_id, segment_id, answer, mode, accuracy)
    values (auth.uid(), p_segment_id, trim(p_answer), p_mode,
      public.voa_dictation_accuracy(v_reference, p_answer)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_voa_dictation(uuid,text,text) from public;
grant execute on function public.submit_voa_dictation(uuid,text,text) to authenticated;
