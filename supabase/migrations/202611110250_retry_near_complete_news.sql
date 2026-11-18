-- Retry recent near-complete factual passages after adding a bounded revision.
-- Retain rights, factual-review and genuinely thin-dossier rejections.
delete from public.news_skipped_urls
where reason = 'ai_rewrite'
  and skipped_at >= now() - interval '3 days'
  and detail ~ '^The factual dossier did not support a complete independent article \(words=3[0-9]{2},';
