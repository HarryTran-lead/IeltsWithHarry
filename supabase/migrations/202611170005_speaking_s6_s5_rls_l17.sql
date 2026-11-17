-- M10-L17: prevent non-S5 learners bypassing Next.js via Supabase REST.
-- Run only after L14 and L15 on isolated disposable Supabase staging.
create or replace function public.speaking_s6_current_user_ready()
returns boolean language sql stable security definer set search_path = '' as $$
 select public.speaking_s6_release_ready()
 and coalesce((select e.s5_verified
                   and e.verified_at is not null
                   and e.verified_by is not null
                   and coalesce(length(btrim(e.evidence_reference)),0)>0
               from public.speaking_s6_s5_eligibility e
               where e.user_id = (select auth.uid())), false);
$$;
revoke all on function public.speaking_s6_current_user_ready() from public,anon,authenticated;
grant execute on function public.speaking_s6_current_user_ready() to authenticated,service_role;

drop policy if exists speaking_s6_published_read on public.speaking_s6_lesson_revisions;
create policy speaking_s6_published_read
on public.speaking_s6_lesson_revisions
for select to authenticated
using (status='published' and public.speaking_s6_current_user_ready());

comment on function public.speaking_s6_current_user_ready() is
 'Live learner RLS requires all global QA gates AND verified S5 for auth.uid(). Admin preview remains server-controlled.';
-- Intentionally does not set any release gate or publish any lesson.
