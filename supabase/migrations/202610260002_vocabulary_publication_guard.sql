alter table public.vocabulary_bank_entries
  add constraint vocabulary_bank_publish_reviewed
  check (not published or (length(trim(meaning_vi)) > 0 and length(trim(definition_en)) > 0));
