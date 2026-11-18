-- Reconsider recent discovery leads rejected by the former source-host and
-- passage-shape gates. Keep rights and all other editorial rejections.
delete from public.news_skipped_urls
where reason = 'ai_rewrite'
  and skipped_at >= now() - interval '3 days'
  and (detail = 'Insufficient independent primary-source facts'
    or detail like 'The factual dossier did not support a complete independent article%');
