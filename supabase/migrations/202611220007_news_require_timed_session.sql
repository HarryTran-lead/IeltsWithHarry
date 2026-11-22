-- Apply after the client uses news_finish_auto_exam, so older deployments
-- remain usable during the additive schema rollout.
revoke execute on function public.news_submit_auto_exam(uuid,jsonb,integer) from public,anon,authenticated;
