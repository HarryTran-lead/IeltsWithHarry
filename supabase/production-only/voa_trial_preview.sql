-- Apply only to production project vpkhriywprepuhrbarye after the VOA base migrations.
-- "preview" is a learner-visible, explicitly unreviewed state. It never sets QA flags.
begin;

alter table public.voa_dictation_lessons
  drop constraint if exists voa_dictation_lessons_status_check;
alter table public.voa_dictation_lessons
  add constraint voa_dictation_lessons_status_check
  check (status in ('discovered','needs_review','approved','uploaded','preview','published','blocked','rejected'));

create or replace function public.voa_dictation_preview_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'preview' and (
    not new.r2_verified or new.audio_object_key is null or new.cefr is null
    or new.third_party_warning or length(trim(new.transcript)) < 30
    or not exists (select 1 from public.voa_dictation_segments s where s.lesson_id = new.id)
  ) then
    raise exception 'Trial VOA lesson needs verified media, transcript and segments, with no third-party warning';
  end if;
  return new;
end $$;
drop trigger if exists voa_dictation_preview_guard on public.voa_dictation_lessons;
create trigger voa_dictation_preview_guard before insert or update on public.voa_dictation_lessons
  for each row execute function public.voa_dictation_preview_guard();

alter policy voa_lessons_read on public.voa_dictation_lessons
  using (status in ('published','preview') or public.is_admin());
alter policy voa_segments_read on public.voa_dictation_segments
  using (exists (
    select 1 from public.voa_dictation_lessons l
    where l.id = lesson_id and (l.status in ('published','preview') or public.is_admin())
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
    where s.id = p_segment_id and l.status in ('published','preview');
  if v_reference is null then raise exception 'Lesson unavailable'; end if;
  insert into public.voa_dictation_attempts(user_id, segment_id, answer, mode, accuracy)
    values (auth.uid(), p_segment_id, trim(p_answer), p_mode,
      public.voa_dictation_accuracy(v_reference, p_answer)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_voa_dictation(uuid,text,text) from public;
grant execute on function public.submit_voa_dictation(uuid,text,text) to authenticated;

commit;
