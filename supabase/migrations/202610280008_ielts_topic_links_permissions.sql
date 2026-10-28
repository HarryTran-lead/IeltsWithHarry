-- Public schema defaults can grant table privileges before RLS is evaluated.
revoke all on public.ielts_vocabulary_topic_links from anon, authenticated;
grant select on public.ielts_vocabulary_topic_links to authenticated;
