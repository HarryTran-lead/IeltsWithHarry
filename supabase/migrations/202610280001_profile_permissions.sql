-- Profile RLS already restricts rows to auth.uid(); expose the new editable columns.
grant update (bio, stage_id, avatar) on public.profiles to authenticated;
