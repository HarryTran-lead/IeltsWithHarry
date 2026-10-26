-- Authored course packages retain practice formats that do not fit the
-- multiple-choice lesson tables (fill blanks, short answers and rubrics).
create table public.package_lesson_content (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.package_lesson_content enable row level security;
create policy package_lesson_read on public.package_lesson_content for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));
create policy package_lesson_admin on public.package_lesson_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.package_lesson_content to anon, authenticated;
grant insert, update, delete on public.package_lesson_content to authenticated;

create table public.package_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 150000),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index package_assessments_course_idx on public.package_assessments(course_id, unit_id);
alter table public.package_assessments enable row level security;
create policy package_assessment_read on public.package_assessments for select to anon, authenticated
  using (public.is_admin() or (published and exists (
    select 1 from public.courses c where c.id = course_id and c.published
  ) and (unit_id is null or exists (
    select 1 from public.units u where u.id = unit_id and u.published
  ))));
create policy package_assessment_admin on public.package_assessments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.package_assessments to anon, authenticated;
grant insert, update, delete on public.package_assessments to authenticated;
