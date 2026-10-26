-- Run after importing ESL-IELTS-STARTER-4-5.
-- Keep legacy rows for learner attempt history, but hide the old course,
-- lessons, and assessments from the student portal.
do $$
declare
  v_new_course uuid;
  v_old_course uuid;
begin
  select id into v_new_course from public.courses
  where slug = 'mindsetstarter-topic-practice-4-5' and published;
  if v_new_course is null or
    (select count(*) from public.units where course_id = v_new_course and published) <> 8 or
    (select count(*) from public.lessons l join public.units u on u.id = l.unit_id
      where u.course_id = v_new_course and l.published) <> 48 then
    raise exception 'The replacement IELTS Starter package is incomplete';
  end if;

  select id into v_old_course from public.courses
  where slug = 'ielts-starter-everyday-topics';
  if v_old_course is null then return; end if;

  update public.package_assessments set published = false
  where course_id = v_old_course;
  update public.lessons set published = false
  where unit_id in (select id from public.units where course_id = v_old_course);
  update public.units set published = false where course_id = v_old_course;
  update public.courses set published = false where id = v_old_course;
end $$;
